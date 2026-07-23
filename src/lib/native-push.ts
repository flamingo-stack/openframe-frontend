/**
 * Native-shell push notifications: permission → FCM registration token handed
 * to the backend, and notification taps deep-linked to the `route` key of the
 * push payload (contract: openframe-mobile dev/push-sample.apns). All push
 * flows through Firebase/FCM on both platforms (@capacitor-firebase/messaging,
 * shipped with the shell — not an npm dep here). No-ops on web and in shells
 * without the plugin.
 *
 * Init runs post-login (registration is an authenticated call; the permission
 * prompt belongs after sign-in, not at launch).
 *
 * The register/unregister calls below are SEAMS for the push contract's
 * `registerPushDevice` / `unregisterPushDevice` GraphQL mutations. They are
 * stubbed until the backend lands those types in the introspected schema —
 * adding Relay mutations against a schema that lacks them breaks relay-compiler.
 * Swap the seam bodies for the mutations once the schema is live.
 */
import { firebaseMessagingPlugin, nativePlatform } from './native-shell';

const PUSH_TOKEN_STORAGE_KEY = 'native:push-token';

type PushPlatform = 'IOS' | 'ANDROID';

let initialized = false;

/** Platform uppercased for the PushPlatform enum; null on web / unknown. */
function pushPlatform(): PushPlatform | null {
  const platform = nativePlatform();
  return platform ? (platform.toUpperCase() as PushPlatform) : null;
}

/**
 * SEAM — push contract `registerPushDevice(token, platform)`: idempotent upsert
 * by token, re-binding a token previously owned by another user. For now only
 * persists the token locally (needed for logout-time unregister); the mutation
 * lands with the backend schema.
 */
async function registerPushDevice(token: string): Promise<void> {
  const platform = pushPlatform();
  if (!platform) return;
  try {
    window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Best-effort: only affects logout-time deregistration.
  }
  // TODO(push-contract v1): commit registerPushDevice(token, platform) via Relay.
}

/**
 * SEAM — push contract `unregisterPushDevice(token)`: best-effort; an unknown
 * token is not an error.
 */
async function unregisterPushDevice(token: string): Promise<void> {
  void token;
  // TODO(push-contract v1): commit unregisterPushDevice(token) via Relay.
}

export async function initNativePush(navigate: (route: string) => void): Promise<void> {
  const plugin = firebaseMessagingPlugin();
  if (!plugin || initialized) return;
  initialized = true;

  // Attach listeners before getToken(): the token event can fire immediately,
  // and iOS replays the launching notification's tap to a fresh listener on
  // cold start.
  await plugin.addListener('notificationActionPerformed', ({ notification }) => {
    const route = notification?.data?.route;
    // Only app-internal routes — never navigate to arbitrary payload URLs.
    if (typeof route === 'string' && route.startsWith('/')) {
      navigate(route);
    }
  });

  // FCM issues the token here and re-emits it on rotation — re-register each time.
  await plugin.addListener('tokenReceived', ({ token }) => {
    void registerPushDevice(token);
  });

  const { receive } = await plugin.requestPermissions();
  if (receive !== 'granted') return;

  // Session-start registration. FCM tokens rotate; the backend upsert is
  // idempotent, so overlapping with the tokenReceived path is harmless.
  const { token } = await plugin.getToken();
  await registerPushDevice(token);
}

/**
 * Deregister this device server-side. Call while still authenticated (before
 * local tokens are cleared on logout).
 */
export async function unregisterNativePush(): Promise<void> {
  if (!firebaseMessagingPlugin()) return;

  let token: string | null = null;
  try {
    token = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return;
  }
  if (!token) return;

  await unregisterPushDevice(token);
  try {
    window.localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {}
}
