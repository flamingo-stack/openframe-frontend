/**
 * guide-chat-hub-proxy — server-only streaming pass-through from the app's
 * same-origin `/api/guide-chat/*` routes to the multi-platform-hub chat
 * backend. This is what lets Guide mode run in the embedded chat without
 * the browser ever learning the hub origin or the service token.
 *
 * Contract (Phase 5, guide-mode restoration):
 *   - `HUB_CHAT_BASE_URL` is an ORIGIN env (no path) — e.g.
 *     `https://hub.openframe.ai` or `http://localhost:3000` in dev.
 *   - `CHAT_SERVICE_TOKEN` is a SERVER-HELD secret. The hub honors
 *     `x-chat-service-token` + `x-openframe-chat-source: openframe` on
 *     POST /api/docs/chat, POST /api/chat/agent/confirm-tool and
 *     GET /api/docs/commands, waiving auth with a 'service' tier (no debug
 *     powers). When the token env is unset we still proxy — the hub then
 *     treats the request as anonymous (degraded, but functional for public
 *     sources), which also keeps local dev usable without the secret.
 *   - The request body is forwarded RAW (`request.body` + `duplex: 'half'`)
 *     and the client abort propagates via `signal: request.signal`.
 *   - The upstream body is returned UNTOUCHED (`new Response(upstream.body)`).
 *     NEVER buffer or re-encode: the chat wire is a byte protocol using
 *     control bytes (\0, \x1E, \x1F) that any text round-trip would corrupt.
 *   - App cookies / Authorization are NOT forwarded to the hub (the service
 *     token IS the identity), and the token never reaches the browser (no
 *     NEXT_PUBLIC_ prefix).
 *   - The VISITOR's IP is forwarded as `x-chat-ip`. See
 *     `visitorIpFrom()` for why this is load-bearing, not optional.
 */

import { NextResponse } from 'next/server';

/** Resolve the hub origin, normalizing away any trailing slash. */
function hubOrigin(): string | null {
  const raw = process.env.HUB_CHAT_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/** Emitted once per process — a deployed misconfiguration must not be silent. */
let warnedMissingServiceToken = false;

// Deliberately shape-only (not a full RFC-compliant validator): the point is
// to reject anything that could smuggle CR/LF or extra header material into
// the forwarded value. Anything that isn't recognisably an address is dropped.
const IPV4_SHAPE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_SHAPE = /^[0-9a-fA-F:]{2,45}$/;

function isPlausibleIp(value: string): boolean {
  if (IPV4_SHAPE.test(value)) {
    return value.split('.').every(part => Number(part) <= 255);
  }
  return value.includes(':') && IPV6_SHAPE.test(value);
}

/**
 * Extract the end user's IP from the incoming request.
 *
 * WHY THIS MATTERS — do not "simplify" this away: without a forwarded
 * visitor identity the hub can only bucket by this app server's single
 * egress IP, so (a) the hub's guide-mode rate limit (5 req/min) is shared by
 * EVERY user of this deployment — the 6th guide request in a minute 429s for
 * everyone — and (b) every guide conversation persists under the same
 * pseudo-visitor, destroying per-user conversation attribution.
 *
 * The hub honors `x-chat-ip` only on requests that also carry a valid
 * `x-chat-service-token`; the service token IS the trust proof. We must NOT
 * forward the impersonation-grade `CHAT_PROXY_SECRET` here — this proxy
 * speaks for anonymous visitors and must not hold that power.
 *
 * `x-forwarded-for` FIRST hop is the client as seen by the edge; later hops
 * are proxies. Values are validated for IP shape before forwarding so a
 * hostile header can't inject anything into the upstream request.
 */
function visitorIpFrom(request: Request): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const candidates = [
    ...(forwardedFor ? forwardedFor.split(',') : []),
    request.headers.get('x-real-ip') ?? '',
    // Vercel's connection IP (set by the platform, not client-controllable).
    request.headers.get('x-vercel-forwarded-for') ?? '',
  ];
  for (const raw of candidates) {
    const candidate = raw.trim().replace(/^\[|\]$/g, '');
    if (candidate && isPlausibleIp(candidate)) return candidate;
  }
  return null;
}

/**
 * Proxy `request` to `${HUB_CHAT_BASE_URL}${upstreamPath}` (query string
 * forwarded), streaming the response straight back to the client.
 */
export async function proxyGuideChatToHub(request: Request, upstreamPath: string): Promise<Response> {
  const origin = hubOrigin();
  if (!origin) {
    return NextResponse.json({ error: 'Guide chat is not configured: HUB_CHAT_BASE_URL is unset' }, { status: 503 });
  }

  const { search } = new URL(request.url);
  const target = `${origin}${upstreamPath}${search}`;

  // Minimal upstream header set — content negotiation only, plus the service
  // identity pair. Deliberately NO cookie / authorization forwarding: app
  // session material must not leak to the hub.
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  headers.set('x-openframe-chat-source', 'openframe');
  const token = process.env.CHAT_SERVICE_TOKEN?.trim();
  if (token) {
    headers.set('x-chat-service-token', token);
  } else if (!warnedMissingServiceToken) {
    // Dev ergonomics keep the anonymous fallback, but in a deployed
    // environment it turns a missing env var into a confusing partial
    // outage (public sources answer, guide sources 401) with nothing in the
    // logs. Say it once.
    warnedMissingServiceToken = true;
    console.warn('[guide-chat-proxy] CHAT_SERVICE_TOKEN unset — forwarding anonymously');
  }

  // Visitor identity for rate-limit bucketing + conversation attribution.
  // Only meaningful alongside the service token (the hub gates `x-chat-ip`
  // on it), but harmless to send either way. See `visitorIpFrom`.
  const visitorIp = visitorIpFrom(request);
  if (visitorIp) headers.set('x-chat-ip', visitorIp);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      // Raw body pass-through; `duplex: 'half'` is required by undici when
      // streaming a request body (not yet in the DOM RequestInit type).
      ...(request.body ? ({ body: request.body, duplex: 'half' } as RequestInit) : {}),
      // Propagate client disconnects so an abandoned chat turn cancels the
      // upstream LLM stream instead of running to completion.
      signal: request.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch (err) {
    if (request.signal.aborted) {
      // Client went away mid-request — nothing meaningful to answer.
      return new Response(null, { status: 499 });
    }
    console.error(`[guide-chat-proxy] upstream fetch failed for ${upstreamPath}:`, err);
    return NextResponse.json({ error: 'Upstream chat service unreachable' }, { status: 502 });
  }

  // Control path: upstream answered without a stream body (e.g. 204 / some
  // proxies on error). Return a JSON envelope so the client sees a clean
  // non-2xx instead of an empty stream.
  if (!upstream.body) {
    return NextResponse.json(
      { error: `Upstream chat service responded ${upstream.status} with no body` },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }

  // Stream pass-through — success AND error bodies alike (the hub's JSON
  // error envelopes flow through with their original status + content-type).
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) responseHeaders.set('content-type', upstreamType);
  // Defeat CDN/proxy buffering so chat tokens render as they stream.
  responseHeaders.set('cache-control', 'no-store, no-transform');
  responseHeaders.set('x-accel-buffering', 'no');
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
