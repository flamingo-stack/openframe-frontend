/**
 * Frontend consumer of the native-shell biometric-login contract (iOS + Android
 * NativeAuth plugin). Biometric login gates the Keychain token read behind
 * Face ID / Touch ID / Fingerprint: with it on, the shell's `getTokens()` — the
 * one the token store hydrates from — prompts, and can reject with
 * `BIOMETRIC_CANCELED` / `BIOMETRIC_INVALIDATED`.
 *
 * Every wrapper here degrades to a disabled/unavailable answer when not in the
 * native shell or when the (optional) plugin methods are absent, so desktop
 * (Tauri) and web are unaffected — they never see a biometric affordance.
 */
import { type BiometryType, isNativeShell, nativeAuthPlugin } from './native-shell';

/** Reject codes the native contract may surface; anything else is a generic failure. */
export const BIOMETRIC_ERROR = {
  UNAVAILABLE: 'BIOMETRIC_UNAVAILABLE',
  NO_TOKENS: 'NO_TOKENS',
  CANCELED: 'BIOMETRIC_CANCELED',
  INVALIDATED: 'BIOMETRIC_INVALIDATED',
} as const;

export type BiometricErrorCode = (typeof BIOMETRIC_ERROR)[keyof typeof BIOMETRIC_ERROR];

/**
 * Capacitor surfaces a rejected plugin call as an Error whose `code` carries the
 * native error string (`CAPError.code`). Read it defensively — a generic failure
 * (no biometric hardware access, etc.) has no code.
 */
export function biometricErrorCode(error: unknown): BiometricErrorCode | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? (code as BiometricErrorCode) : null;
}

export function isBiometricCanceled(error: unknown): boolean {
  return biometricErrorCode(error) === BIOMETRIC_ERROR.CANCELED;
}

export function isBiometricInvalidated(error: unknown): boolean {
  return biometricErrorCode(error) === BIOMETRIC_ERROR.INVALIDATED;
}

/**
 * Whether the device can do biometric auth. Resolves `{ available: false }` off
 * the native shell or on shells without the method, so callers can gate UI on it
 * unconditionally.
 */
export async function isBiometricAvailable(): Promise<{ available: boolean; biometryType: BiometryType }> {
  const plugin = nativeAuthPlugin();
  if (!plugin?.isBiometricAvailable) return { available: false, biometryType: 'none' };
  try {
    return await plugin.isBiometricAvailable();
  } catch {
    return { available: false, biometryType: 'none' };
  }
}

/** Whether the user has turned biometric login on. `false` when unsupported. */
export async function isBiometricLoginEnabled(): Promise<boolean> {
  const plugin = nativeAuthPlugin();
  if (!plugin?.isBiometricLoginEnabled) return false;
  try {
    const { enabled } = await plugin.isBiometricLoginEnabled();
    return enabled;
  } catch {
    return false;
  }
}

/**
 * Turn biometric login on. Rejects (propagated) with BIOMETRIC_UNAVAILABLE |
 * NO_TOKENS | BIOMETRIC_CANCELED so the caller can revert its toggle and message
 * the user. Off the native shell this rejects too (there is nothing to enable) —
 * but the toggle is never rendered there, so it is unreachable.
 */
export async function enableBiometricLogin(): Promise<void> {
  const plugin = nativeAuthPlugin();
  if (!plugin?.enableBiometricLogin) throw new Error(BIOMETRIC_ERROR.UNAVAILABLE);
  await plugin.enableBiometricLogin();
}

/** Turn biometric login off. May reject with BIOMETRIC_CANCELED (propagated). */
export async function disableBiometricLogin(): Promise<void> {
  const plugin = nativeAuthPlugin();
  if (!plugin?.disableBiometricLogin) return;
  await plugin.disableBiometricLogin();
}

/**
 * Human label for the device biometry, for row labels and the unlock gate.
 * Face ID / Touch ID on iOS; Fingerprint / Face for Android's biometryType
 * variants; a neutral fallback otherwise.
 */
export function biometryLabel(biometryType: BiometryType): string {
  switch (biometryType) {
    case 'faceId':
      return 'Face ID';
    case 'touchId':
      return 'Touch ID';
    case 'fingerprint':
      return 'Fingerprint';
    case 'face':
      return 'Face Unlock';
    default:
      return 'Biometrics';
  }
}

/** True only inside a native shell whose plugin exposes the biometric methods. */
export function biometricsSupported(): boolean {
  return isNativeShell() && !!nativeAuthPlugin()?.isBiometricAvailable;
}

/**
 * Per-device record of the user's explicit biometric-login choice, driving the
 * one-time post-login enrollment offer (biometric-enroll-prompt). `'declined'`
 * suppresses the offer for good (until reinstall / data clear). `'accepted'`
 * allows re-offering when gating was later reset — the native `clearTokens`
 * always returns to an ungated state on logout / enrollment invalidation, and a
 * user who opted in before almost certainly wants it back. The settings toggle
 * records the choice too, so disabling there also suppresses the offer.
 */
const BIOMETRIC_CHOICE_KEY = 'native:biometric-login-choice';

export type BiometricLoginChoice = 'accepted' | 'declined';

export function getBiometricLoginChoice(): BiometricLoginChoice | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(BIOMETRIC_CHOICE_KEY);
  return value === 'accepted' || value === 'declined' ? value : null;
}

export function setBiometricLoginChoice(choice: BiometricLoginChoice): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BIOMETRIC_CHOICE_KEY, choice);
}
