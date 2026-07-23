'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { authSessionQueryKey, invalidateAuthSession } from '@/app/(auth)/auth/hooks/use-auth-session';
import { forceLogout } from '@/lib/force-logout';
import { routes } from '@/lib/routes';
import {
  type BiometricLockState,
  dismissBiometricLock,
  getBiometricLockState,
  subscribeToBiometricLock,
} from '@/lib/token-store';
import { BiometricUnlockGate } from './biometric-unlock-gate';

/**
 * Root-level owner of the native-shell biometric cold-start lock (token-store).
 * Must sit ABOVE every useAuthSession consumer that renders a loading state on
 * `!isReady` (FeatureFlagsGate, AppLayout): while `'locked'` the session query
 * stays in error state, so a consumer higher in the tree would show its
 * skeleton forever and the unlock gate below it would never mount.
 *
 * The lock state is only ever non-null in the native shell — on web/desktop
 * this renders children untouched.
 */
export function BiometricLockBoundary({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [lock, setLock] = useState<BiometricLockState>(() => getBiometricLockState());
  const [leavingToLogin, setLeavingToLogin] = useState(false);

  useEffect(() => {
    setLock(getBiometricLockState());
    return subscribeToBiometricLock(setLock);
  }, []);

  // Biometric enrollment changed → the Keychain key is gone, tokens are
  // unrecoverable. Force a fresh login through the normal path.
  useEffect(() => {
    if (lock === 'invalidated') {
      void forceLogout();
    }
  }, [lock]);

  // "Log in another way" hand-off: keep rendering the gate until the sign-in
  // route is actually current — releasing on dismiss alone would flash the
  // stale cold-start route (e.g. `/` redirecting by persisted auth state).
  useEffect(() => {
    if (leavingToLogin && pathname?.startsWith(routes.auth.root)) {
      setLeavingToLogin(false);
    }
  }, [leavingToLogin, pathname]);

  const handleUseAnotherLogin = useCallback(async () => {
    setLeavingToLogin(true);
    // Deliberately abandons the locked session: lift the lock first (forceLogout
    // skips cleanup while 'locked'), then run the normal logout — wipes the
    // stale gated tokens and the auth store — and land on the sign-in flow.
    // Seeding the session query with null marks it ready+signed-out so the
    // skeleton gates below don't hang on the errored query.
    dismissBiometricLock();
    await forceLogout({ shouldRedirect: false });
    queryClient.setQueryData(authSessionQueryKey, null);
    router.replace(routes.auth.root);
  }, [queryClient, router]);

  // Prompt canceled/failed at cold start: the tokens are still in the Keychain,
  // so this is NOT logged-out — hold the whole app behind the unlock gate and
  // let Retry re-prompt; on success re-drive the auth session check.
  if (lock === 'locked' || leavingToLogin) {
    return (
      <BiometricUnlockGate
        onUnlocked={() => invalidateAuthSession(queryClient)}
        onUseAnotherLogin={handleUseAnotherLogin}
      />
    );
  }

  return <>{children}</>;
}
