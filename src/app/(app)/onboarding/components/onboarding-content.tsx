'use client';

import { CheckCircleIcon, FastForwardIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { PageLayout } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { navigateSamePageHash } from '@flamingo-stack/openframe-frontend-core/utils';
import { useRouter } from 'next/navigation';
import { type ComponentType, useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { UserOnboardingStep } from '@/generated/schema-enums';
import { useOnboardingMutations } from '@/graphql/onboarding/use-onboarding-mutations';
import { EVENT_SUBTYPE, trackDashboardActivity } from '@/lib/analytics';
import { routes } from '@/lib/routes';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { ANCHOR_TOP_OFFSET_PX, useOnboardingAutoAdvance } from '../hooks/use-onboarding-auto-advance';
import {
  countCompleted,
  isStepDone,
  onboardingStepAnchorId,
  onboardingStepFromAnchorId,
  USER_ONBOARDING_STEPS,
} from '../onboarding-steps';
import { USER_ONBOARDING_GROUPS } from '../user-onboarding-groups';
import { CustomerSetupStep } from './customer-setup-step';
import { DeviceSetupStep } from './device-setup-step';
import { KnowledgeBaseStep } from './knowledge-base-step';
import { LoggingStep } from './logging-step';
import { MingoStep } from './mingo-step';
import { MonitoringStep } from './monitoring-step';
import { OnboardingAccordionGroup, OnboardingAccordionItem, type OnboardingStepStatus } from './onboarding-accordion';
import { OnboardingSkeleton } from './onboarding-skeleton';
import { ScriptingStep } from './scripting-step';
import { TicketsStep } from './tickets-step';

/**
 * Props every step body accepts — completion status + the commit handlers.
 * - `onComplete`: tracked completion (shows a spinner on "Mark as Complete").
 * - `onCompleteBackground`: fire-and-forget completion for "open"/navigate actions,
 *   with no loading state anywhere (see `completeUserStepInBackground`).
 */
type StepBodyProps = {
  completed?: boolean;
  completing?: boolean;
  onComplete?: () => void;
  onCompleteBackground?: () => void;
};

/**
 * Step → body component. The static presentation (group, icon, title, description)
 * lives in {@link ../user-onboarding-groups}; this maps each step to the interactive
 * form rendered when its row is expanded.
 */
const STEP_BODY: Record<UserOnboardingStep, ComponentType<StepBodyProps>> = {
  [UserOnboardingStep.CUSTOMERS_SETUP]: CustomerSetupStep,
  [UserOnboardingStep.DEVICE_MANAGEMENT]: DeviceSetupStep,
  [UserOnboardingStep.TICKETS]: TicketsStep,
  [UserOnboardingStep.SCRIPTING]: ScriptingStep,
  [UserOnboardingStep.MONITORING]: MonitoringStep,
  [UserOnboardingStep.LOGGING]: LoggingStep,
  [UserOnboardingStep.KNOWLEDGE_MANAGEMENT]: KnowledgeBaseStep,
  [UserOnboardingStep.MEET_MINGO]: MingoStep,
};

/**
 * User "Get Started" onboarding. Step statuses, the header counter and the
 * Skip action are driven by `userOnboardingProgress` (via the onboarding
 * store); each step's "Mark as Complete" commits `completeUserOnboardingStep`.
 *
 * Mount gate only: shows the skeleton until progress is loaded (and redirects if the
 * tenant Initial Setup isn't done), then mounts {@link LoadedOnboardingContent} — so
 * the loaded content's hooks (notably the auto-advance flow, which picks its initial
 * expanded step on mount) always start from real progress, never from the empty
 * pre-load state.
 */
export function OnboardingContent() {
  const router = useRouter();
  const tenant = useOnboardingStore(state => state.tenant);
  const isLoaded = useOnboardingStore(state => state.isLoaded);

  // The personal Get Started tour is only available after the tenant Initial Setup
  // is complete. If the user lands here (deep link, stale tab) beforehand, send them
  // back to the dashboard where the Initial Setup card lives.
  const initialSetupComplete = tenant?.completed ?? false;
  useEffect(() => {
    if (isLoaded && !initialSetupComplete) {
      router.replace(routes.dashboard);
    }
  }, [isLoaded, initialSetupComplete, router]);

  if (!isLoaded || !initialSetupComplete) {
    return <OnboardingSkeleton />;
  }

  return <LoadedOnboardingContent />;
}

/** The loaded page body — mounted by {@link OnboardingContent} once progress is in. */
function LoadedOnboardingContent() {
  const router = useRouter();
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  // Which step's "Mark as Complete" is committing — drives that button's spinner.
  const [completingStep, setCompletingStep] = useState<UserOnboardingStep | null>(null);

  const user = useOnboardingStore(state => state.user);
  const { completeUserStep, completeUserStepInBackground, completeUser, skipUser, isMutating } =
    useOnboardingMutations();

  const leaveOnboarding = useCallback(() => router.push(routes.dashboard), [router]);

  const completedSteps = user?.completedSteps ?? [];

  // The URL hash mirrors the open accordion block (`/onboarding#step-tickets`) —
  // the hub's same-page anchor model. Each row's DOM id is its anchor
  // (`onboardingStepAnchorId`); the fragment parses back to a step here, unknown
  // fragments → null. Lazy initializer: this component only mounts client-side
  // (behind the `isLoaded` gate), so reading `location.hash` during the first
  // render is safe and gives the deep-linked step to the auto-advance hook from
  // the start — an effect would run after the hook's mount anchor.
  const [hashStep, setHashStep] = useState<UserOnboardingStep | null>(() =>
    typeof window === 'undefined'
      ? null
      : onboardingStepFromAnchorId(USER_ONBOARDING_STEPS, window.location.hash.slice(1)),
  );
  // Back/forward + the synthetic `hashchange` that `navigateSamePageHash` fires
  // for our own writes — both funnel into the same parsed-state refresh.
  useEffect(() => {
    const refresh = () => setHashStep(onboardingStepFromAnchorId(USER_ONBOARDING_STEPS, window.location.hash.slice(1)));
    window.addEventListener('hashchange', refresh);
    return () => window.removeEventListener('hashchange', refresh);
  }, []);

  // Open/close → hash write. Opening goes through the canonical
  // `navigateSamePageHash` (replaceState — a step toggle is not a history step —
  // + synthetic `hashchange` + anchoring-proof tween aimed at the same offset the
  // hook scrolls to). Closing clears the fragment; the helper deliberately
  // refuses hash-less targets, so replicate its replaceState + synthetic-event
  // pair (`replaceState` fires no native `hashchange` per the HTML spec).
  const syncHashToStep = useCallback((step: UserOnboardingStep | null) => {
    if (step) {
      navigateSamePageHash(`#${onboardingStepAnchorId(step)}`, {
        headerOffset: ANCHOR_TOP_OFFSET_PX,
        history: 'replace',
      });
    } else {
      const oldUrl = window.location.href;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      // biome-ignore lint/style/useNamingConvention: oldURL/newURL are the DOM HashChangeEventInit field names
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: oldUrl, newURL: window.location.href }));
    }
  }, []);

  // Guided flow: the first incomplete step opens automatically (anchored on mount —
  // the next step may be a group or two below the fold) and, as steps complete, the
  // flow advances: finished step folds, the next one opens and scrolls into view.
  const { expandedOf, onExpandedChangeOf, refOf } = useOnboardingAutoAdvance(USER_ONBOARDING_STEPS, completedSteps, {
    scrollOnMount: true,
    urlStep: hashStep,
    onOpenStepChange: syncHashToStep,
  });
  const total = USER_ONBOARDING_STEPS.length;
  const done = countCompleted(USER_ONBOARDING_STEPS, completedSteps);
  const allDone = done >= total;

  // No manual finisher on the happy path: the instant every step is done, auto-complete
  // the tour (unless it was already completed — e.g. a deep link back here) and return to
  // the dashboard. A small state machine both guards against a re-fire while the mutation
  // round-trips (`allDone` stays true across the intermediate renders) AND recovers from
  // failure: on error it drops to `failed`, stopping the auto-fire and surfacing a retry
  // action, so a network error can't strand the user on a finished-but-not-completed tour.
  const [completion, setCompletion] = useState<'idle' | 'completing' | 'failed'>('idle');
  const runCompletion = useCallback(() => {
    // Already completed (deep link back here) — nothing to commit, just leave.
    if (user?.completed) {
      leaveOnboarding();
      return;
    }
    setCompletion('completing');
    completeUser(leaveOnboarding, () => setCompletion('failed'));
  }, [user?.completed, completeUser, leaveOnboarding]);
  useEffect(() => {
    if (allDone && completion === 'idle') {
      runCompletion();
    }
  }, [allDone, completion, runCompletion]);

  const statusOf = (step: UserOnboardingStep): OnboardingStepStatus =>
    isStepDone(step, completedSteps) ? 'completed' : 'active';
  const doneOf = (step: UserOnboardingStep) => isStepDone(step, completedSteps);
  const completeOf = (step: UserOnboardingStep) => () => {
    setCompletingStep(step);
    completeUserStep(step, () => setCompletingStep(null));
  };
  const completingOf = (step: UserOnboardingStep) => completingStep === step;
  // Fire-and-forget completion for "open"/navigate primary actions — no loading anywhere.
  const completeBackgroundOf = (step: UserOnboardingStep) => () => completeUserStepInBackground(step);

  // Header action. Normally "Skip Onboarding", available until every step is done; once
  // all steps complete the page auto-completes and leaves for the dashboard (see the
  // effect above), so no action shows then. If that auto-completion FAILS we fall back
  // to an accent "Complete Onboarding" retry — the only manual finisher, on the error
  // path only — so a network error can't strand the user with no way forward.
  const actions =
    completion === 'failed'
      ? [
          {
            label: 'Complete Onboarding',
            variant: 'accent' as const,
            icon: <CheckCircleIcon className="size-5" />,
            disabled: isMutating,
            loading: isMutating,
            onClick: runCompletion,
          },
        ]
      : allDone
        ? []
        : [
            {
              label: 'Skip Onboarding',
              variant: 'outline' as const,
              icon: <FastForwardIcon className="size-5" />,
              disabled: isMutating,
              onClick: () => setSkipConfirmOpen(true),
            },
          ];

  return (
    <PageLayout
      title="Get Started"
      subtitle={`${total} steps to complete · ${done}/${total} done`}
      actions={actions}
      actionsVariant="icon-buttons"
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
      contentClassName="flex flex-col gap-[var(--spacing-system-l)]"
    >
      {USER_ONBOARDING_GROUPS.map(group => (
        <OnboardingAccordionGroup key={group.label} label={group.label}>
          {group.items.map(item => {
            const StepBody = STEP_BODY[item.step];
            return (
              <OnboardingAccordionItem
                key={item.step}
                ref={refOf(item.step)}
                id={onboardingStepAnchorId(item.step)}
                icon={item.icon}
                status={statusOf(item.step)}
                title={item.title}
                description={item.description}
                expanded={expandedOf(item.step)}
                onExpandedChange={onExpandedChangeOf(item.step)}
              >
                <StepBody
                  completed={doneOf(item.step)}
                  completing={completingOf(item.step)}
                  onComplete={completeOf(item.step)}
                  onCompleteBackground={completeBackgroundOf(item.step)}
                />
              </OnboardingAccordionItem>
            );
          })}
        </OnboardingAccordionGroup>
      ))}

      <ConfirmDialog
        open={skipConfirmOpen}
        onOpenChange={setSkipConfirmOpen}
        title="Skip onboarding"
        description="You can finish setup later from Settings."
        confirmLabel="Skip Onboarding"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          trackDashboardActivity(EVENT_SUBTYPE.SKIP_ONBOARDING);
          skipUser(leaveOnboarding);
        }}
      />
    </PageLayout>
  );
}
