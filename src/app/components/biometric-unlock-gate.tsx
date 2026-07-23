'use client';

import { Button } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { biometryLabel, isBiometricAvailable } from '@/lib/native-biometrics';
import { retryTokenHydration } from '@/lib/token-store';

interface BiometricUnlockGateProps {
  /** Re-run the auth session check after the Keychain read succeeds. */
  onUnlocked: () => void;
  /**
   * Abandon the locked session and go to the normal sign-in flow (OpenFrame
   * SSO / Google / Microsoft). The gate stays mounted (buttons disabled) until
   * the caller finishes the hand-off, so it never flashes a stale route.
   */
  onUseAnotherLogin: () => Promise<void> | void;
}

/**
 * Cold-start unlock screen shown when biometric login is on and the Keychain
 * read was canceled / failed (token-store lock state `'locked'`). The tokens are
 * still there — this is not a signed-out state — so Retry re-prompts via
 * `retryTokenHydration()`; on success the lock clears and `onUnlocked` re-drives
 * the auth check. "Log in another way" is the escape hatch for users whose
 * biometrics keep failing — it abandons the locked session for a fresh sign-in.
 * Native-shell only (the caller gates on the lock state, which is only ever set
 * in the shell).
 */
export function BiometricUnlockGate({ onUnlocked, onUseAnotherLogin }: BiometricUnlockGateProps) {
  const [label, setLabel] = useState('Biometrics');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The gate replaces the whole app tree on mount — move focus to the heading
  // so assistive tech announces the lock context instead of staying on a
  // no-longer-rendered element.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    void isBiometricAvailable().then(({ biometryType }) => {
      if (active) setLabel(biometryLabel(biometryType));
    });
    return () => {
      active = false;
    };
  }, []);

  const handleRetry = useCallback(async () => {
    setIsUnlocking(true);
    try {
      await retryTokenHydration();
    } finally {
      setIsUnlocking(false);
    }
    // If the read succeeded the store cleared the lock; re-check auth so the app
    // renders. If it was canceled again the store re-armed 'locked' and this
    // gate stays mounted.
    onUnlocked();
  }, [onUnlocked]);

  const handleUseAnotherLogin = useCallback(async () => {
    // No reset: the gate unmounts when the caller lands on the sign-in route.
    setIsLeaving(true);
    await onUseAnotherLogin();
  }, [onUseAnotherLogin]);

  return (
    <main className="min-h-screen bg-ods-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-h2 text-ods-text-primary focus:outline-none">
          Unlock OpenFrame
        </h1>
        <p className="text-ods-text-secondary">Use {label} to unlock your account.</p>
        <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
          <Button className="w-full" onClick={handleRetry} disabled={isUnlocking || isLeaving}>
            {isUnlocking ? 'Unlocking…' : `Unlock with ${label}`}
          </Button>
          <Button className="w-full" variant="outline" onClick={handleUseAnotherLogin} disabled={isUnlocking || isLeaving}>
            {isLeaving ? 'Loading…' : 'Log in another way'}
          </Button>
        </div>
      </div>
    </main>
  );
}
