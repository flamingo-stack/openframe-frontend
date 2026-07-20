'use client';

import {
  BuildingsIcon,
  CheckCircleIcon,
  IdCardIcon,
  MonitorIcon,
  UsersGroupIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button, Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { type ReactNode, useState } from 'react';
import { TenantOnboardingStep } from '@/generated/schema-enums';
import { useOnboardingMutations } from '@/graphql/onboarding/use-onboarding-mutations';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useOnboardingAutoAdvance } from '../hooks/use-onboarding-auto-advance';
import { useTenantOnboardingAutoDetect } from '../hooks/use-tenant-onboarding-auto-detect';
import { countCompleted, isStepDone, TENANT_ONBOARDING_STEPS } from '../onboarding-steps';
import { CompanyTeamStep } from './company-team-step';
import { CustomerSetupStep } from './customer-setup-step';
import { DeviceSetupStep } from './device-setup-step';
import { MspSetupStep } from './msp-setup-step';
import { OnboardingAccordionItem, type OnboardingStepStatus } from './onboarding-accordion';

interface StepMeta {
  step: TenantOnboardingStep;
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * Single source of truth for the four steps' static presentation (icon, title,
 * description), shared by the real card and {@link InitialSetupSkeleton} so the
 * skeleton matches the card 1:1 (same icons, titles, descriptions, order). The
 * step-specific expanded body is wired up separately in the card.
 */
const STEP_META: readonly StepMeta[] = [
  {
    step: TenantOnboardingStep.MSP_SETUP,
    icon: <BuildingsIcon size={24} />,
    title: 'Complete MSP Setup',
    description:
      'Set your company name, upload a logo, and add your website so clients recognize your brand across all touchpoints.',
  },
  {
    step: TenantOnboardingStep.CUSTOMERS_SETUP,
    icon: <IdCardIcon size={24} />,
    title: 'Customers Setup',
    description: 'Add your first client - Customer name, service tier, and SLA. Devices need an org to belong to.',
  },
  {
    step: TenantOnboardingStep.DEVICE_MANAGEMENT,
    icon: <MonitorIcon size={24} />,
    title: 'Device Management',
    description: 'Run one command on a client machine to connect it to OpenFrame and start monitoring.',
  },
  {
    step: TenantOnboardingStep.COMPANY_TEAM,
    icon: <UsersGroupIcon size={24} />,
    title: 'Company & Team',
    description: 'Invite your technicians and assign roles so everyone has the right access from day one.',
  },
];

/**
 * Tenant "Initial Setup" block on the Dashboard. Mount gate only: nothing until
 * onboarding progress has loaded, and permanently hidden once Initial Setup is
 * complete (a one-time surface). When active, it renders {@link InitialSetupCardContent},
 * which suspends on its step counts — the loading skeleton is the dashboard
 * `<Suspense fallback={<InitialSetupSkeleton />}>` that wraps this card, so the whole
 * load (counts + the content's own suspending queries) shows one skeleton, not two.
 */
export function InitialSetupCard() {
  const isLoaded = useOnboardingStore(state => state.isLoaded);
  const tenant = useOnboardingStore(state => state.tenant);

  // Render only when progress is loaded AND we actually have a tenant record that
  // isn't complete. Guarding on `!tenant` matters: `refreshOnboardingProgress` marks
  // the store loaded even on a failed/empty fetch (tenant stays null), and the content
  // fires its data queries the instant it mounts — we must not mount it on null.
  if (!isLoaded || !tenant || tenant.completed) {
    return null;
  }

  return <InitialSetupCardContent />;
}

/**
 * The card body. Suspends (via {@link useTenantOnboardingAutoDetect}) until every step
 * count has loaded, then renders once in its fully-settled state — step statuses, the
 * "X/Y done" counter and the "Complete Setup" affordance driven by
 * `tenantOnboardingProgress` unioned with the live data. Sits on the darker page
 * background (`bg-ods-bg`, not `bg-ods-card`) so it doesn't read as a card.
 */
function InitialSetupCardContent() {
  const tenant = useOnboardingStore(state => state.tenant);
  const { completeTenantStep, completeTenantStepInBackground, completeTenant, isMutating } = useOnboardingMutations();

  // Auto-close steps whose underlying data already exists (MSP profile filled,
  // customer/device/teammate added) — see the hook for criteria. Suspends until the
  // counts load; `completedByData` feeds the display union below.
  // ⚠️ TEMPORARY client-side stopgap — drop this union and read `completedSteps` from
  // the store once the backend computes step completion in `tenantOnboardingProgress`.
  const completedByData = useTenantOnboardingAutoDetect();

  // Which step's "Mark as Complete" is currently committing — drives that button's
  // loading spinner. Cleared when the mutation settles (success or error).
  const [completingStep, setCompletingStep] = useState<TenantOnboardingStep | null>(null);
  const completeStep = (step: TenantOnboardingStep) => {
    setCompletingStep(step);
    completeTenantStep(step, () => setCompletingStep(null));
  };

  // Display state = backend-persisted steps ∪ steps already satisfied by live data,
  // so a step reads as done immediately without waiting for its background mutation
  // to round-trip (the hook writes those to the backend for persistence). No dedup
  // needed: `countCompleted` builds its own Set and `isStepDone` uses `.includes`, so
  // an overlap between the two sources is harmless.
  const completedSteps = [...(tenant?.completedSteps ?? []), ...completedByData];

  // Guided flow: the first incomplete step opens automatically and, as steps
  // complete, the finished one folds while the next opens and scrolls into view.
  // No mount anchor — this card is already the dashboard's first section. Runs
  // after the auto-detect suspend, so the initial expanded step is picked from the
  // settled union above, not a pre-load snapshot.
  const { expandedOf, onExpandedChangeOf, refOf } = useOnboardingAutoAdvance(TENANT_ONBOARDING_STEPS, completedSteps);

  const total = TENANT_ONBOARDING_STEPS.length;
  const done = countCompleted(TENANT_ONBOARDING_STEPS, completedSteps);
  const allDone = done >= total;

  const statusOf = (step: TenantOnboardingStep): OnboardingStepStatus =>
    isStepDone(step, completedSteps) ? 'completed' : 'active';

  const renderStepBody = (step: TenantOnboardingStep): ReactNode => {
    const completed = isStepDone(step, completedSteps);
    const completing = completingStep === step;
    const onComplete = () => completeStep(step);
    switch (step) {
      case TenantOnboardingStep.MSP_SETUP:
        return <MspSetupStep completed={completed} completing={completing} onComplete={onComplete} />;
      case TenantOnboardingStep.CUSTOMERS_SETUP:
        return <CustomerSetupStep completed={completed} completing={completing} onComplete={onComplete} />;
      case TenantOnboardingStep.DEVICE_MANAGEMENT:
        return (
          <DeviceSetupStep
            completed={completed}
            completing={completing}
            onComplete={onComplete}
            onCompleteBackground={() => completeTenantStepInBackground(TenantOnboardingStep.DEVICE_MANAGEMENT)}
          />
        );
      case TenantOnboardingStep.COMPANY_TEAM:
        return <CompanyTeamStep completed={completed} completing={completing} onComplete={onComplete} />;
      default:
        return null;
    }
  };

  return (
    <section className="flex w-full flex-col gap-[var(--spacing-system-m)] rounded-md border border-ods-border bg-ods-bg p-[var(--spacing-system-l)]">
      <div className="flex flex-col gap-[var(--spacing-system-s)] md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-h2 text-ods-text-primary">Initial Setup</h2>
          <p className="text-h6 text-ods-text-secondary">
            {total} steps to complete · {done}/{total} done
          </p>
        </div>
        {allDone && !tenant?.completed && (
          <Button
            variant="accent"
            leftIcon={<CheckCircleIcon className="size-5" />}
            onClick={() => completeTenant()}
            disabled={isMutating}
            loading={isMutating}
            className="w-full md:w-auto"
          >
            Complete Setup
          </Button>
        )}
      </div>

      <div className="flex w-full flex-col overflow-hidden rounded-md border border-ods-border [&>*:last-child]:border-b-0">
        {STEP_META.map(meta => (
          <OnboardingAccordionItem
            key={meta.step}
            ref={refOf(meta.step)}
            icon={meta.icon}
            status={statusOf(meta.step)}
            title={meta.title}
            description={meta.description}
            expanded={expandedOf(meta.step)}
            onExpandedChange={onExpandedChangeOf(meta.step)}
          >
            {renderStepBody(meta.step)}
          </OnboardingAccordionItem>
        ))}
      </div>
    </section>
  );
}

/**
 * Loading placeholder for the card, rendered 1:1 from the same frame and `STEP_META`
 * as {@link InitialSetupCardContent}: identical section, header, and four accordion
 * rows via `OnboardingAccordionItem`'s `loading` mode (real icon/title/description,
 * only the trailing status control skeletoned). Header shows the static title/label
 * with just the unknown done-count skeletoned.
 *
 * Used as the `<Suspense>` fallback around the card (see dashboard-content): the card
 * body renders `DeviceSetupStep`, whose `useDeviceOrganizations` suspends, so reusing
 * this same skeleton keeps the loading → content transition seamless (no empty gap).
 */
export function InitialSetupSkeleton() {
  const total = TENANT_ONBOARDING_STEPS.length;
  return (
    <section className="flex w-full flex-col gap-[var(--spacing-system-m)] rounded-md border border-ods-border bg-ods-bg p-[var(--spacing-system-l)]">
      <div className="flex flex-col gap-[var(--spacing-system-s)] md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-h2 text-ods-text-primary">Initial Setup</h2>
          {/* Same text + classes as the real subtitle; only the unknown done-count is a
              skeleton, inline (no flex/gap, no extra space) so it doesn't shift on swap. */}
          <div className="text-h6 text-ods-text-secondary">
            {total} steps to complete · <Skeleton className="inline-block h-3.5 w-4 rounded-sm align-middle" />/{total}{' '}
            done
          </div>
        </div>
        {/* "Complete Setup" button placeholder — matches the real button's box
            (`h-10 md:h-12`, `w-full md:w-auto`; fixed desktop width since a skeleton
            has no content to size to). */}
        <Skeleton className="h-10 w-full rounded-md md:h-12 md:w-[188px]" />
      </div>

      <div className="flex w-full flex-col overflow-hidden rounded-md border border-ods-border [&>*:last-child]:border-b-0">
        {STEP_META.map(meta => (
          <OnboardingAccordionItem
            key={meta.step}
            loading
            icon={meta.icon}
            title={meta.title}
            description={meta.description}
          />
        ))}
      </div>
    </section>
  );
}
