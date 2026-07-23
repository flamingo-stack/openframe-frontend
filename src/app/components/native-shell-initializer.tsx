'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { initNativeBack } from '@/lib/native-back';
import { hideSplashScreen, initNativeChrome, isNativeShell, onNativeNotificationClick } from '@/lib/native-shell';
import { initTokenStore } from '@/lib/token-store';
import { resolveNatsNotificationRoute } from './notifications/notification-navigation';

// The shell event transport outlives React lifecycles — register exactly once
// per page, however many times the component (re)mounts.
let clickListenerRegistered = false;

/**
 * Kicks off Keychain -> memory token hydration as early as possible in the
 * native shell so the first API calls can attach a bearer synchronously.
 * Not a render gate: if a request wins the race, the normal 401 -> refresh ->
 * retry path recovers (refresh awaits hydration). No-op on the web.
 *
 * Also routes OS-toast clicks forwarded by the desktop shell's Rust
 * notification plane: the raw NATS envelope maps to the same route the in-app
 * drawer would use, falling back to the notifications page.
 */
export function NativeShellInitializer() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeShell()) return;
    // Activates the shell-only safe-area CSS in globals.css.
    document.documentElement.dataset.nativeShell = 'true';
    // Status bar (overlay + light content) then safe-area insets.
    void initNativeChrome();
    // Android hardware/gesture back → overlay dismiss → SPA history → exit.
    initNativeBack();
    // Hide the launch splash once hydration settles — so it also covers a
    // cold-start biometric unlock prompt (getTokens awaits it).
    void initTokenStore().finally(() => void hideSplashScreen());

    if (!clickListenerRegistered) {
      clickListenerRegistered = true;
      onNativeNotificationClick(payload => {
        router.push(resolveNatsNotificationRoute(payload) ?? '/notifications');
      });
    }
  }, [router]);

  return null;
}
