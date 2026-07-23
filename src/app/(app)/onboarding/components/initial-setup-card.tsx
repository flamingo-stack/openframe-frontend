'use client';

import {
  BuildingsIcon,
  CheckCircleIcon,
  IdCardIcon,
  MonitorIcon,
  UsersGroupIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button, Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { TenantOnboardingStep } from '@/generated/schema-enums';
import { useOnboardingMutations } from '@/graphql/onboarding/use-onboarding-mutations';
import { routes } from '@/lib/routes';
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
 * count has loaded, then renders once in its fully-settled state — step statuses and the
 * "X/Y done" counter driven by `tenantOnboardingProgress` unioned with the live data.
 * There is no manual finisher: once every step is done the card auto-completes Initial
 * Setup and sends the user on to the `/onboarding` tour (see effect below). Sits on the
 * darker page background (`bg-ods-bg`, not `bg-ods-card`) so it doesn't read as a card.
 */
function InitialSetupCardContent() {
  const router = useRouter();
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

  // No manual finisher on the happy path: the instant every step is satisfied,
  // auto-complete Initial Setup (which unmounts this card via the parent's
  // `tenant.completed` gate) and move the user on to the `/onboarding` tour. A small
  // state machine both guards against a double-fire while the mutation round-trips
  // (`allDone` stays true across the intermediate renders) AND recovers from failure:
  // on error it drops to `failed`, which stops the auto-fire and surfaces a retry
  // button below, so a network error can't strand the user on a finished-but-not-
  // completed card with no way forward.
  const [completion, setCompletion] = useState<'idle' | 'completing' | 'failed'>('idle');
  const runCompletion = useCallback(() => {
    setCompletion('completing');
    completeTenant(
      () => router.push(routes.onboarding),
      () => setCompletion('failed'),
    );
  }, [completeTenant, router]);
  useEffect(() => {
    if (allDone && completion === 'idle') {
      runCompletion();
    }
  }, [allDone, completion, runCompletion]);

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
        {/* Error-recovery only: the happy path auto-completes and unmounts, so this
            never shows then. It appears solely when auto-completion failed, giving the
            user an explicit way to retry. */}
        {completion === 'failed' && (
          <Button
            variant="accent"
            leftIcon={<CheckCircleIcon className="size-5" />}
            onClick={runCompletion}
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
 * as {@link InitialSetupCardContent}: identical section, header and four accordion rows.
 * A FULL skeleton — the header title/subtitle and each row's title/description are all
 * skeleton bars (via `OnboardingAccordionItem`'s `loading` mode), only the leading step
 * icons stay real. Kept pixel-identical in height to the loaded card.
 *
 * Used as the `<Suspense>` fallback around the card (see dashboard-content): the card
 * body renders `DeviceSetupStep`, whose `useDeviceOrganizations` suspends, so reusing
 * this same skeleton keeps the loading → content transition seamless (no empty gap).
 */
export function InitialSetupSkeleton() {
  return (
    <section className="flex w-full flex-col gap-[var(--spacing-system-m)] rounded-md border border-ods-border bg-ods-bg p-[var(--spacing-system-l)]">
      <div className="flex min-w-0 flex-col">
        {/* Title + subtitle as core `Skeleton` bars, kept inside the real `text-h2`/
            `text-h6` line boxes so the header height matches the loaded card exactly.
            Decorative `div` wrappers (not `h2`/`p`) since `Skeleton` renders a `div`,
            which is invalid inside `<p>`/`<h2>`; the type utilities carry the height. */}
        <div className="text-h2 text-ods-text-primary">
          <Skeleton className="inline-block h-6 w-40 align-middle" />
        </div>
        <div className="text-h6 text-ods-text-secondary">
          <Skeleton className="inline-block h-3 w-52 max-w-full align-middle" />
        </div>
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
