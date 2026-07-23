'use client';

import { PageLayout } from '@flamingo-stack/openframe-frontend-core';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import { Suspense } from 'react';
import { InitialSetupCard, InitialSetupSkeleton } from '@/app/(app)/onboarding/components/initial-setup-card';
import { isSaasTenantMode } from '@/lib/app-mode';
import { featureFlags } from '@/lib/feature-flags';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { CustomersOverviewSection } from './customers-overview';
import { DevicesOverviewSection } from './devices-overview';
import { OnboardingSection } from './onboarding-section';
import { TicketsOverviewSection } from './tickets-overview';

/** Padded wrapper for the onboarding blocks that live OUTSIDE the PageLayout chrome.
 *  `empty:hidden` collapses the wrapper (padding included) when the inner component
 *  renders `null` (dismissed walkthrough / completed setup). */
const ONBOARDING_WRAPPER_CLASS = 'px-[var(--spacing-system-l)] pt-[var(--spacing-system-l)] empty:hidden';

/**
 * Dashboard content component - extracted for dynamic import with loading skeleton
 * Contains all dashboard sections: Onboarding, Devices, Tickets (SaaS only), Organizations
 */
export default function DashboardContent() {
  const showTickets = isSaasTenantMode();
  // The legacy onboarding section is replaced by the new onboarding chrome once the
  // `new-onboarding` flag is on: the tenant "Initial Setup" card here, plus the
  // standalone `/onboarding` (user Get Started) page and the top bar.
  const newOnboardingEnabled = featureFlags.newOnboarding.enabled();
  const showLegacyOnboarding = !newOnboardingEnabled;

  // Dim (and disable) the rest of the dashboard ONLY while the tenant Initial Setup
  // is still incomplete — that's when the setup card is the surface to focus on
  // ("finish setup first"). Once setup is complete — or before onboarding progress
  // has loaded — the dashboard is fully lit. Backed by the same onboarding store as
  // the setup card, so it flips the instant setup is marked complete.
  const onboardingLoaded = useOnboardingStore(state => state.isLoaded);
  const initialSetupComplete = useOnboardingStore(state => state.tenant?.completed ?? false);
  const dimDashboard = newOnboardingEnabled && onboardingLoaded && !initialSetupComplete;

  return (
    <>
      {/* Onboarding — deliberately OUTSIDE the PageLayout below. */}
      {showLegacyOnboarding && (
        <div className={ONBOARDING_WRAPPER_CLASS}>
          <OnboardingSection />
        </div>
      )}
      {/* Local Suspense so the setup card's suspending queries (e.g. DeviceSetupStep's
          `useDeviceOrganizations`, a `useSuspenseQuery`) are caught here instead of
          bubbling to the route-level `loading.tsx` and re-flashing the whole dashboard
          skeleton. Fallback is the card skeleton (not `null`) so the suspend doesn't
          flash an empty gap between the card's own count-loading skeleton and its
          content — the same skeleton carries through while onboarding progress
          (the tenant step-detection round-trips) loads. */}
      {newOnboardingEnabled && (
        <Suspense
          fallback={
            <div className={ONBOARDING_WRAPPER_CLASS}>
              <InitialSetupSkeleton />
            </div>
          }
        >
          <div className={ONBOARDING_WRAPPER_CLASS}>
            <InitialSetupCard />
          </div>
        </Suspense>
      )}
      <div
        className={cn('transition-opacity duration-300', dimDashboard && 'pointer-events-none select-none opacity-40')}
        aria-hidden={dimDashboard || undefined}
      >
        {/* Standard page chrome: PageLayout supplies the gap between sections; each
            section renders its own TitleBlock header (with the TitleBlock's own pt/mb). */}
        <PageLayout className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]">
          <DevicesOverviewSection />
          {showTickets && <TicketsOverviewSection />}
          <CustomersOverviewSection />
        </PageLayout>
      </div>
    </>
  );
}
