/**
 * Detection of, and typed access to, the Capacitor native shell (openframe-mobile).
 * The shell injects `window.Capacitor` at runtime; this web app deliberately has
 * no Capacitor npm dependency, so all bridge access goes through these helpers.
 */

/**
 * Custom URL scheme the mobile app registers (CFBundleURLTypes). The login
 * ASWebAuthenticationSession completes when navigation hits it; the gateway
 * 302s the devTicket straight to it for authMobile=true logins.
 */
export const MOBILE_APP_SCHEME = 'com.openframe.app';

/** Biometry the device supports; `'none'` when biometric auth is unavailable. */
export type BiometryType = 'faceId' | 'touchId' | 'fingerprint' | 'face' | 'none';

export interface NativeAuthPlugin {
  /**
   * Runs the OAuth login in a shell-owned browser context and resolves with
   * the final callback URL. Mobile shells run a system browser
   * (ASWebAuthenticationSession) that completes on `callbackScheme`; the
   * desktop shell runs a dedicated window that intercepts the https
   * callbackHost/callbackPath landing and ignores `callbackScheme`.
   */
  start(options: {
    url: string;
    callbackHost: string;
    callbackPath: string;
    callbackScheme?: string;
  }): Promise<{ callbackUrl: string }>;
  /** Performs the dev-ticket exchange over native HTTP (no CORS) and returns tokens from response headers. */
  exchangeTicket(options: { url: string }): Promise<{ accessToken?: string; refreshToken?: string }>;
  /**
   * Reads the stored tokens. When biometric login is enabled the shell gates
   * this behind a biometric prompt, so it may reject with `BIOMETRIC_CANCELED`
   * (user dismissed the prompt) or `BIOMETRIC_INVALIDATED` (enrollment changed —
   * the token is no longer decryptable). See native-biometrics.ts for handling.
   */
  getTokens(): Promise<{ accessToken?: string; refreshToken?: string }>;
  setTokens(options: { accessToken?: string; refreshToken?: string }): Promise<void>;
  clearTokens(): Promise<void>;
  /**
   * Biometric login (native-only, added by the shell's biometric effort). All
   * four may be absent on shells that predate it — access through
   * native-biometrics.ts, which guards for their presence.
   */
  isBiometricAvailable?(): Promise<{ available: boolean; biometryType: BiometryType }>;
  isBiometricLoginEnabled?(): Promise<{ enabled: boolean }>;
  /** Rejects: BIOMETRIC_UNAVAILABLE | NO_TOKENS | BIOMETRIC_CANCELED. */
  enableBiometricLogin?(): Promise<void>;
  /** Rejects: BIOMETRIC_CANCELED. */
  disableBiometricLogin?(): Promise<void>;
  /**
   * Shell-owned refresh (single-flight in the shell). Optional — shells that
   * implement it become the ONLY refresher: refresh tokens rotate, so the
   * webview must not race a shell-side refresher with its own /oauth/refresh.
   * Resolves with the stored tokens after the attempt (empty = session over);
   * rejects on transient failure. Implemented by the desktop (Tauri) shell;
   * the mobile Swift plugin not yet.
   */
  refreshTokens?(): Promise<{ accessToken?: string; refreshToken?: string }>;
  /**
   * Persist the login-learned tenant host in the shell, so shell-side
   * networking (token refresh, background NATS) has a gateway without
   * depending on webview localStorage. Optional, desktop-only for now.
   */
  setTenantHost?(options: { origin: string }): Promise<void>;
  /** Real safe-area insets from UIKit — WKWebView reports env(safe-area-inset-*) as 0 in the shell. */
  getSafeAreaInsets(): Promise<{ top: number; bottom: number; left: number; right: number }>;
}

export type PushPermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

/** Subset of @capacitor-firebase/messaging used by this app (plugin ships with the shell, not npm). */
export interface FirebaseMessagingPlugin {
  checkPermissions(): Promise<{ receive: PushPermissionState }>;
  requestPermissions(): Promise<{ receive: PushPermissionState }>;
  /** Registers with APNs/FCM and resolves the FCM registration token (both platforms). */
  getToken(): Promise<{ token: string }>;
  deleteToken(): Promise<void>;
  /** Fires when FCM first issues or later rotates the registration token. */
  addListener(eventName: 'tokenReceived', listenerFunc: (event: { token: string }) => void): Promise<unknown>;
  addListener(
    eventName: 'notificationActionPerformed',
    listenerFunc: (event: { notification: { data?: Record<string, unknown> } }) => void,
  ): Promise<unknown>;
}

/** Subset of @capacitor/splash-screen (plugin ships with the shell, not npm). */
export interface SplashScreenPlugin {
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
  show(options?: { autoHide?: boolean }): Promise<void>;
}

/**
 * Subset of @capacitor/status-bar. Enum naming is counterintuitive: `'DARK'` =
 * light text/icons (for a dark status-bar background), `'LIGHT'` = dark text.
 */
export interface StatusBarPlugin {
  setStyle(options: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }): Promise<void>;
  setOverlaysWebView(options: { overlay: boolean }): Promise<void>;
}

/**
 * Subset of @capacitor/app. `backButton` is Android-only (hardware/gesture back);
 * iOS has no hardware back and uses the WKWebView edge-swipe instead.
 *
 * addListener's return is typed as a union on purpose: the natively-injected
 * bridge proxy hands back the handle synchronously, not the Promise the npm
 * plugin types advertise. Normalize with Promise.resolve() before chaining —
 * calling .catch/.then on it directly crashes at boot on a sync bridge.
 */
export interface AppPlugin {
  addListener(
    eventName: 'backButton',
    listenerFunc: (event: { canGoBack?: boolean }) => void,
  ): Promise<{ remove: () => void }> | { remove: () => void };
  exitApp(): Promise<void>;
}

function capacitorGlobal(): any {
  return typeof window !== 'undefined' ? (window as any).Capacitor : undefined;
}

export function isNativeShell(): boolean {
  return capacitorGlobal()?.isNativePlatform?.() === true;
}

/** `'ios' | 'android'` inside the shell, null on the web. */
export function nativePlatform(): 'ios' | 'android' | null {
  if (!isNativeShell()) return null;
  const platform = capacitorGlobal()?.getPlatform?.();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

export function nativeAuthPlugin(): NativeAuthPlugin | null {
  return isNativeShell() ? (capacitorGlobal()?.Plugins?.NativeAuth ?? null) : null;
}

/** Null on web and until @capacitor-firebase/messaging is present in the shell — callers no-op. */
export function firebaseMessagingPlugin(): FirebaseMessagingPlugin | null {
  return isNativeShell() ? (capacitorGlobal()?.Plugins?.FirebaseMessaging ?? null) : null;
}

/** Null on web / until @capacitor/splash-screen is present in the shell — callers no-op. */
export function splashScreenPlugin(): SplashScreenPlugin | null {
  return isNativeShell() ? (capacitorGlobal()?.Plugins?.SplashScreen ?? null) : null;
}

/** Null on web / until @capacitor/status-bar is present in the shell — callers no-op. */
export function statusBarPlugin(): StatusBarPlugin | null {
  return isNativeShell() ? (capacitorGlobal()?.Plugins?.StatusBar ?? null) : null;
}

/** Null on web / until @capacitor/app is present in the shell — callers no-op. */
export function appPlugin(): AppPlugin | null {
  return isNativeShell() ? (capacitorGlobal()?.Plugins?.App ?? null) : null;
}

const TENANT_HOST_STORAGE_KEY = 'native:tenant-host-url';

/**
 * Tenant host the shell learned at login time: the OAuth callback lands on the
 * tenant's canonical host (resolved server-side from the tenant registry), so
 * one binary can serve any tenant without a build-time
 * NEXT_PUBLIC_TENANT_HOST_URL. localStorage survives shell restarts and is
 * synchronous, so the value is available to module-load-time readers.
 */
export function getStoredTenantHost(): string | null {
  if (!isNativeShell()) return null;
  try {
    return window.localStorage.getItem(TENANT_HOST_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeTenantHost(origin: string): void {
  if (!isNativeShell() || !origin) return;
  try {
    window.localStorage.setItem(TENANT_HOST_STORAGE_KEY, origin);
  } catch {
    // Best-effort: the next login learns the host again.
  }
}

/**
 * Subscribe to shell-pushed token rotations. The desktop shell refreshes
 * tokens on its own schedule (the webview may be idle) and emits the full
 * token set after every change — including an empty set when the session is
 * over. Tauri-only transport; no-op in shells without it (Capacitor mobile).
 */
export function onNativeTokenUpdate(callback: (tokens: { accessToken?: string; refreshToken?: string }) => void): void {
  if (!isNativeShell()) return;
  const tauriEvent = (window as any).__TAURI__?.event;
  if (typeof tauriEvent?.listen !== 'function') return;
  void tauriEvent.listen('native-auth:token-update', (event: any) => callback(event?.payload ?? {}));
}

/**
 * Subscribe to OS-toast clicks forwarded by the desktop shell's Rust
 * notification plane. The payload is the raw NATS notification envelope —
 * resolve a route with resolveNatsNotificationRoute. Tauri-only transport;
 * no-op in shells without it.
 */
export function onNativeNotificationClick(callback: (payload: unknown) => void): void {
  if (!isNativeShell()) return;
  const tauriEvent = (window as any).__TAURI__?.event;
  if (typeof tauriEvent?.listen !== 'function') return;
  void tauriEvent.listen('notification:click', (event: any) => callback(event?.payload));
}

/**
 * Publish the native safe-area insets as CSS variables consumed by the
 * shell-scoped rules in globals.css
 * (`--native-safe-top/-bottom/-left/-right`). All four are set so landscape and
 * notch/home-indicator edges are honored, not just the portrait status bar.
 */
export async function applyNativeSafeAreas(): Promise<void> {
  try {
    const insets = await nativeAuthPlugin()?.getSafeAreaInsets();
    if (!insets) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--native-safe-top', `${insets.top}px`);
    rootStyle.setProperty('--native-safe-bottom', `${insets.bottom}px`);
    rootStyle.setProperty('--native-safe-left', `${insets.left}px`);
    rootStyle.setProperty('--native-safe-right', `${insets.right}px`);
  } catch (error) {
    console.warn('[Native Shell] safe-area inset lookup failed:', error);
  }
}

/**
 * Hide the launch splash once the shell is interactive. The splash is configured
 * launchAutoHide:false, so nothing hides it until this runs — call it after token
 * hydration settles so it also covers a cold-start biometric unlock prompt.
 * No-op on web / shells without the plugin.
 */
export async function hideSplashScreen(): Promise<void> {
  try {
    await splashScreenPlugin()?.hide({ fadeOutDuration: 200 });
  } catch (error) {
    console.warn('[Native Shell] splash hide failed:', error);
  }
}

/**
 * Configure the status bar for the dark app chrome: overlay the WebView (so the
 * viewport-fit=cover content + the opaque --native-safe-top band draw under it)
 * with light content legible on that band. No-op on web / shells without the plugin.
 */
export async function initNativeStatusBar(): Promise<void> {
  const statusBar = statusBarPlugin();
  if (!statusBar) return;
  try {
    await statusBar.setOverlaysWebView({ overlay: true });
    await statusBar.setStyle({ style: 'DARK' });
  } catch (error) {
    console.warn('[Native Shell] status bar setup failed:', error);
  }
}

/**
 * Native launch chrome, run once on shell startup: set the status bar to overlay
 * with light content, THEN publish the safe-area insets (on Android the top inset
 * only becomes the status-bar height once the bar overlays the WebView).
 */
export async function initNativeChrome(): Promise<void> {
  await initNativeStatusBar();
  await applyNativeSafeAreas();
}
