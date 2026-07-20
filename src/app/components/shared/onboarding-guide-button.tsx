'use client';

import { BookOpenIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { routes } from '@/lib/routes';
import type { EmptyStateProps } from './empty-state';

/** Sections whose empty state carries a "Learn more about X" footer button. */
export type OnboardingGuideSource =
  | 'queries'
  | 'customers'
  | 'policies'
  | 'scripts'
  | 'script-schedules'
  | 'logs'
  | 'devices'
  | 'tickets';

/**
 * Help Center onboarding-guide slug per section. The button renders only for
 * sections that have a slug configured here — an unset entry hides the button
 * entirely.
 */
const ONBOARDING_GUIDE_SLUGS: Partial<Record<OnboardingGuideSource, string>> = {
  customers: 'set-up-your-customer-organizations',
  devices: 'understanding-the-devices-list',
  scripts: 'scripts-overview',
  'script-schedules': 'scripts-overview',
  policies: 'what-is-a-monitoring-policy',
  queries: 'what-is-a-monitoring-policy',
  logs: 'audit-activity-logs',
  tickets: 'tickets-overview',
};

type OnboardingGuideButtonProps = Pick<EmptyStateProps, 'buttonLabel' | 'buttonIcon' | 'buttonProps'>;

/**
 * Footer-button props for a section's `EmptyState`, spread as
 * `{...onboardingGuideButton('customers', 'Learn more about Customers')}`.
 * The button opens the section's onboarding guide in the in-app Help Center.
 * Returns `{}` (no button) when the section has no slug in
 * `ONBOARDING_GUIDE_SLUGS`.
 */
export function onboardingGuideButton(source: OnboardingGuideSource, label: string): OnboardingGuideButtonProps {
  const slug = ONBOARDING_GUIDE_SLUGS[source];
  if (!slug) return {};
  return {
    buttonLabel: label,
    buttonIcon: <BookOpenIcon className="text-ods-text-secondary" />,
    buttonProps: { href: routes.helpCenter.onboardingGuide(slug) },
  };
}
