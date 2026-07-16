'use client';

import { PageLayout } from '@flamingo-stack/openframe-frontend-core';
import { isSaasTenantMode } from '@/lib/app-mode';
import {
  CustomersOverviewSkeleton,
  DevicesOverviewSkeleton,
  TicketsOverviewSkeleton,
} from './components/dashboard-skeletons';

/**
 * Next.js route-level loading state for /dashboard.
 *
 * Renders the exact same section skeletons the overview sections render while they
 * fetch (`./components/dashboard-skeletons`) inside the same `PageLayout` chrome as
 * `DashboardContent`, so the transition route-skeleton → section-skeleton → data has
 * no shape change. The onboarding block is deliberately NOT skeletoned — it renders
 * nothing until its progress loads (see `InitialSetupCard`).
 */
export default function DashboardLoading() {
  const showTickets = isSaasTenantMode();

  return (
    <div role="status" aria-label="Loading dashboard">
      <PageLayout className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]">
        <DevicesOverviewSkeleton />
        {showTickets && <TicketsOverviewSkeleton />}
        <CustomersOverviewSkeleton />
      </PageLayout>
    </div>
  );
}
