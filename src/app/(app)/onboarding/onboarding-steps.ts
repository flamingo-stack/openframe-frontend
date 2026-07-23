/**
 * Canonical onboarding step order + counting helpers.
 *
 * The two enums come from the backend schema (`npm run generate-enums`):
 * `TenantOnboardingStep` drives the tenant "Initial Setup" card on the dashboard,
 * `UserOnboardingStep` drives the per-user "Get Started" page. The ordered arrays
 * below are the single source of truth for how many steps each surface has and in
 * what order they render — nothing counts steps by a hardcoded number anymore.
 */
import { TenantOnboardingStep, UserOnboardingStep } from '@/generated/schema-enums';

/** Tenant "Initial Setup" steps, in display order. */
export const TENANT_ONBOARDING_STEPS: readonly TenantOnboardingStep[] = [
  TenantOnboardingStep.MSP_SETUP,
  TenantOnboardingStep.CUSTOMERS_SETUP,
  TenantOnboardingStep.DEVICE_MANAGEMENT,
  TenantOnboardingStep.COMPANY_TEAM,
];

/** User "Get Started" steps, in display order. */
export const USER_ONBOARDING_STEPS: readonly UserOnboardingStep[] = [
  UserOnboardingStep.CUSTOMERS_SETUP,
  UserOnboardingStep.DEVICE_MANAGEMENT,
  UserOnboardingStep.TICKETS,
  UserOnboardingStep.SCRIPTING,
  UserOnboardingStep.MONITORING,
  UserOnboardingStep.LOGGING,
  UserOnboardingStep.KNOWLEDGE_MANAGEMENT,
  UserOnboardingStep.MEET_MINGO,
];

/**
 * DOM id + URL hash fragment for a step's accordion block on /onboarding
 * (`CUSTOMERS_SETUP` → `step-customers-setup`, deep-linked as
 * `/onboarding#step-customers-setup`). Namespaced with `step-` the way the
 * hub namespaces its anchors (`faq-…`, `delivery-…`) so generic step names
 * (`TICKETS` → `tickets`) can't collide with other DOM ids on the page.
 */
export function onboardingStepAnchorId(step: string): string {
  return `step-${step.toLowerCase().replace(/_/g, '-')}`;
}

/** Reverse of {@link onboardingStepAnchorId}, validated against `steps`; unknown fragment → null. */
export function onboardingStepFromAnchorId<T extends string>(steps: readonly T[], anchorId: string): T | null {
  return steps.find(step => onboardingStepAnchorId(step) === anchorId) ?? null;
}

/** Count how many of `steps` appear in `completedSteps` (order-independent). */
export function countCompleted<T extends string>(steps: readonly T[], completedSteps: readonly T[]): number {
  const done = new Set(completedSteps);
  return steps.reduce((count, step) => (done.has(step) ? count + 1 : count), 0);
}

/** Whether a given step is in the completed set. */
export function isStepDone<T extends string>(step: T, completedSteps: readonly T[]): boolean {
  return completedSteps.includes(step);
}
