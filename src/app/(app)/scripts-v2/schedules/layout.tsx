'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { featureFlags } from '@/lib/feature-flags';
import { routes } from '@/lib/routes';
import { useFeatureFlagsStore } from '@/stores/feature-flags-store';

/**
 * Gates every `/scripts-v2/schedules/*` route behind the `script-schedules`
 * feature flag — a sub-gate nested inside the `scripts-v2` gate one level up
 * (see `../layout.tsx`). Feature flags are guaranteed loaded before app children
 * render (see `FeatureFlagsGate`), so this reads the resolved value with no
 * flash. When the flag is off, direct navigation here redirects to the Scripts
 * list; the "Scripts Schedules" tab is hidden in the same case (see
 * `scripts-v2-tabs.tsx`).
 */
export default function ScriptSchedulesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Subscribe to the resolved flag so the gate re-evaluates when the store loads
  // or the value changes. When the server doesn't return the flag, fall back to
  // the env-var default (mirrors `featureFlags.scriptSchedules.enabled()`).
  const serverValue = useFeatureFlagsStore(s => (s.isLoaded ? s.flags['script-schedules'] : undefined));
  const enabled = serverValue ?? featureFlags.scriptSchedules.enabled();

  useEffect(() => {
    if (!enabled) {
      router.replace(routes.scriptsV2.list);
    }
  }, [enabled, router]);

  if (!enabled) {
    return null;
  }

  return <>{children}</>;
}
