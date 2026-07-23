'use client';

import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Non-intrusive connectivity banner: watches `navigator.onLine` and the
 * `online`/`offline` window events, showing a small pill when the network drops
 * and hiding it when it returns. `navigator.onLine` only guarantees "no network
 * interface", not reachability, so this is a hint — not a substitute for the
 * per-request 401/refresh/retry paths. Web and native shell alike.
 */
export function OfflineBanner() {
  // Start online: `navigator` is undefined during SSR/static export, and a
  // false-positive "offline" flash on first paint is worse than a one-tick
  // delay before the effect corrects a genuinely-offline load.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[calc(var(--native-safe-top,0px)+0.5rem)] z-[70] -translate-x-1/2"
    >
      <div className="flex items-center gap-2 rounded-full bg-ods-card px-4 py-2 shadow-lg border border-ods-border">
        <WifiOff className="h-4 w-4 text-ods-text-secondary" />
        <span className="text-code text-ods-text-primary">You're offline</span>
      </div>
    </div>
  );
}
