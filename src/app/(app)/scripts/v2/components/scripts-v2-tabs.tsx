'use client';

import { type TabItem, TabNavigation } from '@flamingo-stack/openframe-frontend-core';
import { BracketCurlyIcon, TimerIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { featureFlags } from '@/lib/feature-flags';
import { routes } from '@/lib/routes';
import { useFeatureFlagsStore } from '@/stores/feature-flags-store';

const SCRIPTS_V2_TABS: TabItem[] = [
  { id: 'list', label: 'Scripts List', icon: BracketCurlyIcon },
  { id: 'schedules', label: 'Scripts Schedules', icon: TimerIcon },
];

interface ScriptsV2TabNavigationProps {
  activeTab: 'list' | 'schedules';
}

/**
 * Top-level switcher between the scripts-v2 pages. Unlike the legacy
 * `/scripts?tab=` page, the v2 tabs are separate routes, so this is pure
 * navigation — no `?tab=` state and no tab-owned components.
 *
 * The Schedules view (tab + `/scripts-v2/schedules/*` routes) is gated by the
 * `script-schedules` flag. When it's off the switcher collapses to a single
 * view (Scripts List), so the whole tab bar is hidden rather than rendering a
 * lone tab — the schedules routes themselves redirect away (see
 * `scripts-v2/schedules/layout.tsx`).
 */
export function ScriptsV2TabNavigation({ activeTab }: ScriptsV2TabNavigationProps) {
  const router = useRouter();

  // Mirror the schedules layout gate so the tab and the route agree with no
  // flash: resolved store value, env-var fallback when the server omits it.
  const serverValue = useFeatureFlagsStore(s => (s.isLoaded ? s.flags['script-schedules'] : undefined));
  const schedulesEnabled = serverValue ?? featureFlags.scriptSchedules.enabled();

  const handleTabChange = useCallback(
    (tabId: string) => {
      if (tabId === activeTab) return;
      router.push(tabId === 'schedules' ? routes.scriptsV2.schedules.list : routes.scriptsV2.list);
    },
    [activeTab, router],
  );

  if (!schedulesEnabled) {
    return null;
  }

  return (
    <div className="px-[var(--spacing-system-l)]">
      <TabNavigation urlSync={false} activeTab={activeTab} tabs={SCRIPTS_V2_TABS} onTabChange={handleTabChange} />
    </div>
  );
}
