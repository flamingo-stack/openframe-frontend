'use client';

import { PageLayout } from '@flamingo-stack/openframe-frontend-core';
import { Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useLgUp, useLocalStorage, useMdUp } from '@flamingo-stack/openframe-frontend-core/hooks';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  CustomersOverviewSkeleton,
  DevicesOverviewSkeleton,
  TicketsOverviewSkeleton,
} from '@/app/(app)/dashboard/components/dashboard-skeletons';
import { InitialSetupSkeleton } from '@/app/(app)/onboarding/components/initial-setup-card';
import { isSaasTenantMode } from '@/lib/app-mode';
import { featureFlags } from '@/lib/feature-flags';
import {
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_MINIMIZED_STORAGE_KEY,
  SIDEBAR_MINIMIZED_WIDTH,
  SIDEBAR_WIDTH_CSS_VAR,
} from '@/lib/navigation-sidebar-state';
import { routes } from '@/lib/routes';

/**
 * AppHeader action-button cell skeleton — mirrors `HeaderButton`
 * (w-12 md:w-14, full height, centered icon) with a left divider so the cells
 * read like the real header's `divide-x`.
 */
function HeaderButtonCellSkeleton() {
  return (
    <div className="flex items-center justify-center shrink-0 w-12 md:w-14 h-full border-l border-ods-border">
      <Skeleton className="h-4 w-4 md:h-6 md:w-6 rounded" />
    </div>
  );
}

// Stable keys for the static row lists — mirrors the SAAS nav (7 primary, 2
// secondary). Used as React keys only; nothing here is rendered.
const PRIMARY_NAV_SKELETON_KEYS = ['dashboard', 'customers', 'devices', 'scripts', 'monitoring', 'logs', 'tickets'];
const SECONDARY_NAV_SKELETON_KEYS = ['knowledge-base', 'settings'];

/** One sidebar row skeleton — mirrors NavigationSidebarItemButton (h-14, p-4). */
function NavigationSidebarRowSkeleton({ showLabel }: { showLabel: boolean }) {
  return (
    <div className="flex items-center justify-start h-14 p-4">
      <Skeleton className="h-6 w-6 rounded shrink-0" />
      {showLabel && <Skeleton className="h-4 flex-1 ml-2" />}
    </div>
  );
}

/**
 * Sidebar skeleton that tracks the real `NavigationSidebar`:
 * - desktop (lg+): width follows the persisted minimized preference
 * - tablet (md, not lg): always minimized (the real sidebar floats as an
 *   overlay; here we just reserve its 56px slot)
 * - mobile (< md): hidden — the burger menu replaces it
 *
 * Content is gated on hydration (media queries are undefined during SSR/first
 * paint), matching how the real sidebar defers rendering its items.
 */
function NavigationSidebarSkeleton() {
  const mdUp = useMdUp();
  const lgUp = useLgUp();
  const [desktopMinimized] = useLocalStorage<boolean>(SIDEBAR_MINIMIZED_STORAGE_KEY, false);

  const isHydrated = mdUp !== undefined && lgUp !== undefined;
  const isTablet = (mdUp ?? false) && !(lgUp ?? false);
  const minimized = isTablet ? true : desktopMinimized;
  const showLabel = !minimized;
  const width = minimized ? SIDEBAR_MINIMIZED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  // The width is driven by the CSS var (seeded pre-paint by the layout's inline
  // script to avoid an expanded→minimized flash on refresh). Keep it in sync
  // once hydrated so it tracks viewport changes and recovers if the seed script
  // was skipped. The aside's `style` string itself is constant, so SSR and
  // first client render match — no hydration mismatch.
  useEffect(() => {
    document.documentElement.style.setProperty(SIDEBAR_WIDTH_CSS_VAR, `${width}px`);
  }, [width]);

  return (
    <>
      {/* Tablet reserves the collapsed slot so the content area keeps its
          position while the real sidebar floats above it. */}
      {isTablet && (
        <div className="hidden md:block h-full shrink-0" style={{ width: SIDEBAR_MINIMIZED_WIDTH }} aria-hidden />
      )}

      <aside
        className={cn(
          'flex-col hidden md:flex shrink-0 bg-ods-card border-r border-ods-border',
          isTablet ? 'fixed top-0 left-0 h-screen z-[45]' : 'relative h-full',
        )}
        style={{ width: `var(${SIDEBAR_WIDTH_CSS_VAR}, ${SIDEBAR_EXPANDED_WIDTH}px)` }}
        aria-hidden
      >
        {isHydrated && (
          <>
            {/* Logo header */}
            <div className="flex items-center justify-start h-14 p-4 border-b border-ods-border">
              <Skeleton className="h-6 w-6 rounded shrink-0" />
              {showLabel && <Skeleton className="h-5 w-24 ml-2" />}
            </div>

            {/* Primary items at top, secondary pinned to the bottom */}
            <div className="flex-1 flex flex-col justify-between py-4 overflow-y-auto">
              <div className="flex flex-col">
                {PRIMARY_NAV_SKELETON_KEYS.map(key => (
                  <NavigationSidebarRowSkeleton key={key} showLabel={showLabel} />
                ))}
              </div>
              <div className="flex flex-col">
                {SECONDARY_NAV_SKELETON_KEYS.map(key => (
                  <NavigationSidebarRowSkeleton key={key} showLabel={showLabel} />
                ))}
              </div>
            </div>

            {/* Collapse toggle */}
            <div className="border-t border-ods-border">
              <div className="flex items-center justify-start h-14 p-4">
                <Skeleton className="h-6 w-6 rounded shrink-0" />
                {showLabel && <Skeleton className="h-4 w-20 ml-2" />}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/**
 * OnboardingStepCard skeleton - matches OnboardingStepCard exactly
 * Structure: bg-ods-card, rounded-[6px], h-[80px], flex row
 */
function OnboardingStepCardSkeleton() {
  return (
    <div className="bg-ods-card border border-ods-border rounded-[6px] min-h-[80px] md:h-[80px] flex flex-col md:flex-row items-start md:items-center gap-[var(--spacing-system-m)] px-[var(--spacing-system-mf)] py-[var(--spacing-system-mf)] md:py-0">
      {/* Left - title and description */}
      <div className="flex-1 w-full md:w-auto min-w-0 flex flex-col justify-center gap-[var(--spacing-system-xxs)]">
        <Skeleton className="h-6 w-40" /> {/* title - 18px/24px line height */}
        <Skeleton className="h-5 w-64" /> {/* description - 14px/20px line height, h-[20px] explicit */}
      </div>
      {/* Right - buttons */}
      <div className="flex items-center gap-[var(--spacing-system-xsf)] w-full md:w-auto justify-start md:justify-end shrink-0">
        <Skeleton className="h-14 w-full md:w-[100px] rounded-[6px]" />{' '}
        {/* Skip button - h-14 matches Button default */}
        <Skeleton className="h-14 w-full md:w-[160px] rounded-[6px]" />{' '}
        {/* Action button - h-14 matches Button default */}
      </div>
    </div>
  );
}

/**
 * Onboarding skeleton - matches OnboardingWalkthrough exactly
 * Structure: header row + vertical list of OnboardingStepCards.
 *
 * Kept in the shell fallback on purpose: the dashboard shows an onboarding block
 * while its progress loads, and that progress needs extra round-trips (device/org/
 * user/SSO counts for the legacy walkthrough, tenant step detection for Initial
 * Setup) that take a noticeable moment — so we draw the skeleton in the meantime
 * instead of a gap.
 */
function OnboardingSkeleton() {
  return (
    <div className="w-full space-y-[var(--spacing-system-mf)]">
      {/* Header - title + button */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-[var(--spacing-system-sf)] md:gap-0">
        <Skeleton className="h-8 w-36" /> {/* "Get Started" title - 24px/32px line height */}
        <Skeleton className="h-12 w-full md:w-[180px] rounded-[6px]" />{' '}
        {/* "Skip Onboarding" button - w-full md:w-auto matches actual Button */}
      </div>
      {/* Step cards - 5 vertical cards */}
      <div className="space-y-[var(--spacing-system-mf)]">
        {Array.from({ length: 5 }, (_, i) => (
          <OnboardingStepCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * DashboardInfoCard skeleton - matches DashboardInfoCard exactly
 * Structure: bg-ods-card, rounded-md, ODS-token padding/gap, flex items-center
 *
 * NOTE: this is the pre-existing GENERIC dashboard mock, kept ONLY for the
 * standard (non-dashboard) shell fallback. The /dashboard route uses the
 * canonical section skeletons instead (see the route-aware branch below).
 */
function InfoCardSkeleton() {
  return (
    <div className="bg-ods-card border border-ods-border rounded-[6px] p-[var(--spacing-system-mf)] flex gap-[var(--spacing-system-sf)] items-center">
      {/* Content section */}
      <div className="flex-1 flex flex-col">
        {/* Title - uppercase 14px */}
        <Skeleton className="h-4 w-20 mb-[var(--spacing-system-xxs)]" />
        {/* Value + percentage row */}
        <div className="flex items-center gap-[var(--spacing-system-xsf)]">
          <Skeleton className="h-10 w-12" /> {/* 32px number */}
          <Skeleton className="h-5 w-8" /> {/* percentage */}
        </div>
      </div>
      {/* Circular progress */}
      <Skeleton className="h-12 w-12 rounded-full" />
    </div>
  );
}

/**
 * Devices skeleton - matches DevicesOverviewSection exactly
 * Structure: h2 title + p subtitle + grid of InfoCards
 */
function DevicesSkeleton() {
  return (
    <div className="space-y-[var(--spacing-system-mf)]">
      {/* h2 title */}
      <Skeleton className="h-8 w-44" />
      {/* p subtitle */}
      <Skeleton className="h-5 w-36" />
      {/* Grid of 2 info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--spacing-system-mf)]">
        <InfoCardSkeleton />
        <InfoCardSkeleton />
      </div>
    </div>
  );
}

/**
 * Tickets skeleton - matches TicketsOverviewSection exactly
 * Structure: h2 title + p subtitle + grid of 4 InfoCards
 */
function TicketsSkeleton() {
  return (
    <div className="space-y-[var(--spacing-system-mf)]">
      {/* h2 title */}
      <Skeleton className="h-8 w-40" />
      {/* p subtitle */}
      <Skeleton className="h-5 w-32" />
      {/* Grid of 4 info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--spacing-system-mf)]">
        <InfoCardSkeleton />
        <InfoCardSkeleton />
        <InfoCardSkeleton />
        <InfoCardSkeleton />
      </div>
    </div>
  );
}

/**
 * OrganizationCard skeleton - matches OrganizationCard exactly
 */
function CustomerCardSkeleton() {
  return (
    <div className="bg-ods-card border border-ods-border rounded-[6px] p-[var(--spacing-system-mf)]">
      <div className="flex items-start gap-[var(--spacing-system-sf)]">
        <div className="flex-1 min-w-0 space-y-[var(--spacing-system-xsf)]">
          <Skeleton className="h-6 w-3/4" /> {/* org name */}
          <Skeleton className="h-4 w-1/2" /> {/* org details */}
        </div>
        <Skeleton className="h-4 w-20" /> {/* device count badge */}
      </div>
    </div>
  );
}

/**
 * Organizations skeleton - matches CustomersOverviewSection exactly
 * Structure: h2 title + p subtitle + rows of [OrgCard, InfoCard, InfoCard]
 */
function CustomersSkeleton() {
  return (
    <div className="space-y-[var(--spacing-system-mf)]">
      {/* h2 title */}
      <Skeleton className="h-8 w-52" />
      {/* p subtitle */}
      <Skeleton className="h-5 w-48" />
      {/* Rows of org + info cards */}
      <div className="flex flex-col gap-[var(--spacing-system-sf)]">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--spacing-system-mf)] items-stretch"
          >
            <CustomerCardSkeleton />
            <InfoCardSkeleton />
            <InfoCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton that mirrors the AppShell structure:
 * - NavigationSidebar (left): responsive width tracking the real sidebar's
 *   minimized/expanded + tablet states
 * - AppHeader (top of main area): h-12 md:h-14, action cells gated by the same
 *   feature flags
 * - Content area: p-6 pt-0 (main)
 *
 * Used for:
 * - "Checking session" loading state
 * - "Initializing" loading state
 * - Root layout Suspense fallback
 * - Root page redirect loading
 */
export function AppShellSkeleton() {
  // Gate the header action cells by the same flags the live `AppHeader` reads,
  // so the skeleton's button row matches what will render once auth resolves.
  const notificationsEnabled = featureFlags.notifications.enabled();
  const timeTrackerEnabled = featureFlags.timeTracker.enabled();
  const mingoEnabled = featureFlags.mingoSidebar.enabled();
  // Tickets overview is SaaS-tenant only — gate it exactly like the dashboard
  // route (`loading.tsx` / `DashboardContent`) so the shell and route skeletons agree.
  const showTickets = isSaasTenantMode();
  // Match `DashboardContent`'s onboarding variant so the shell → dashboard swap
  // doesn't shift: the new "Initial Setup" card skeleton when `new-onboarding` is
  // on, the legacy "Get Started" walkthrough skeleton otherwise.
  const newOnboardingEnabled = featureFlags.newOnboarding.enabled();

  // Route-scope the fixed dashboard body: only /dashboard renders the canonical
  // section skeletons (+ onboarding). This shell is the app-WIDE loading fallback
  // (root layout Suspense, session check, feature-flags gate, root redirect), so
  // every OTHER route keeps the pre-existing generic mock below — the dashboard
  // fix must not leak onto Settings, Devices, etc.
  const pathname = usePathname();
  const isDashboardRoute = pathname === routes.dashboard || pathname.startsWith(`${routes.dashboard}/`);

  return (
    <output className="flex h-screen bg-ods-bg" aria-label="Loading application">
      <NavigationSidebarSkeleton />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* AppHeader skeleton - mirrors the real header: h-12 md:h-14, empty
            left spacer, full-height divided action cells on the right. */}
        <header className="flex items-center w-full bg-ods-card border-b border-ods-border h-12 md:h-14">
          {/* Mobile: burger menu cell */}
          <div className="flex md:hidden items-center justify-center shrink-0 w-12 h-full">
            <Skeleton className="h-4 w-4 rounded" />
          </div>
          {/* Mobile: logo cell */}
          <div className="flex md:hidden items-center gap-2 px-3 h-full flex-1 border-l border-ods-border">
            <Skeleton className="h-6 w-6 rounded shrink-0" />
            <Skeleton className="h-4 w-24" />
          </div>
          {/* Desktop: search/spacer slot (empty — this app passes no search) */}
          <div className="hidden md:flex w-full" />

          {timeTrackerEnabled && <HeaderButtonCellSkeleton />}
          {notificationsEnabled && <HeaderButtonCellSkeleton />}

          {/* User avatar — desktop only, like the real header */}
          <div className="hidden md:flex items-center justify-center shrink-0 w-12 md:w-14 h-full border-l border-ods-border">
            <Skeleton className="h-8 w-8 md:h-10 md:w-10 rounded-full" />
          </div>

          {/* Mingo AI — content-width, icon + wordmark (wordmark desktop only) */}
          {mingoEnabled && (
            <div className="flex items-center shrink-0 gap-2 px-4 h-full border-l border-ods-border">
              <Skeleton className="h-4 w-4 md:h-6 md:w-6 rounded" />
              <Skeleton className="hidden md:block h-5 w-16" />
            </div>
          )}
        </header>

        {/* Main content. On /dashboard we render the SAME canonical section
            skeletons as the dashboard route `loading.tsx` (so the shell → route →
            data transition has no card-count/height/layout jump): the core
            `AppLayout` `<main>` is `flex-1 overflow-y-auto` with only bottom padding
            from `mainClassName` (`pb-14`, per `(app)/layout.tsx`), and the dashboard
            supplies its own `px-l` via `PageLayout`; the onboarding skeleton sits
            OUTSIDE `PageLayout`, matching `DashboardContent`'s `ONBOARDING_WRAPPER_CLASS`
            (px-l pt-l). Every other route keeps the pre-existing generic mock. */}
        {isDashboardRoute ? (
          <main className="flex-1 overflow-y-auto pb-14">
            <div className="px-[var(--spacing-system-l)] pt-[var(--spacing-system-l)]">
              {newOnboardingEnabled ? <InitialSetupSkeleton /> : <OnboardingSkeleton />}
            </div>
            <PageLayout className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]">
              <DevicesOverviewSkeleton />
              {showTickets && <TicketsOverviewSkeleton />}
              <CustomersOverviewSkeleton />
            </PageLayout>
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-[var(--spacing-system-lf)] pt-0">
            {/* ContentPageContainer wrapper. `gap-8` (32px) has no ODS spacing token
                (the scale is …lf 24 → xlf 40), and it's a no-op here anyway — a single
                child — so it's left as-is rather than force-fitting a non-matching token. */}
            <div className="flex flex-col w-full gap-8">
              <div className="flex-1">
                {/* Dashboard content skeleton */}
                <div className="space-y-[var(--spacing-system-xlf)] pt-[var(--spacing-system-lf)]">
                  <OnboardingSkeleton />
                  <DevicesSkeleton />
                  <TicketsSkeleton />
                  <CustomersSkeleton />
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </output>
  );
}
