/**
 * POST /api/guide-chat — same-origin streaming proxy for the Guide-mode chat
 * turn. Forwards to the hub's `POST /api/docs/chat` with the server-held
 * service token; the response stream (control-byte chat wire) passes through
 * untouched. See `@/lib/guide-chat-hub-proxy` for the full contract.
 *
 * NOTE: not available under `output: 'export'` (native shell) — POST route
 * handlers require the Node server, matching the existing `/content/*`
 * rewrite limitation.
 */

import { proxyGuideChatToHub } from '@/lib/guide-chat-hub-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyGuideChatToHub(request, '/api/docs/chat');
}
