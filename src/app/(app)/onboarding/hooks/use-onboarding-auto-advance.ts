'use client';

import { scrollElementIntoView } from '@flamingo-stack/openframe-frontend-core/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long the accordion rows animate (the grid-rows 0fr↔1fr transition in
 * `onboarding-accordion` runs 200ms). The anchor scroll waits this out so the
 * collapsing/expanding rows settle before the target position is measured —
 * the smooth tween re-tracks the target each frame anyway, but the
 * reduced-motion path is a single instant write and must measure settled
 * geometry.
 */
const ACCORDION_ANIMATION_MS = 250;

/**
 * Breathing room between the top of the scroll container and the anchored row.
 * Replaces the accordion row's former `scroll-mt-20` (80px), which only the
 * native `scrollIntoView` honored — `scrollElementIntoView` takes the offset
 * explicitly instead of reading `scroll-margin-top`.
 */
const ANCHOR_TOP_OFFSET_PX = 80;

interface AutoAdvanceOptions {
  /**
   * Also anchor the auto-opened step on mount — for surfaces the user deep-links or
   * returns to (the /onboarding page), where the next step may sit below the fold.
   * Off for the dashboard Initial Setup card, which is already the first section.
   * @default false
   */
  scrollOnMount?: boolean;
}

/**
 * Guided accordion flow for an onboarding surface: keeps the FIRST incomplete step
 * (in display order) auto-expanded and anchors it into view as progress advances.
 *
 * - On mount, the next incomplete step starts expanded (optionally scrolled to).
 * - When progress advances (the next incomplete step changes), the just-finished
 *   step collapses, the new next step expands and is smooth-scrolled into view.
 * - Once every step is done, the last step collapses and the surface scrolls back
 *   to the top so its header — where the "Complete …" finisher lives — is in view.
 * - The user stays in control: chevron toggles write to the same state, and the
 *   hook only overrides it at the moment progress actually advances.
 *
 * Anchoring goes through the core-lib's unified `scrollElementIntoView` helper —
 * it resolves the actual scroll container (the AppLayout `<main overflow-y-auto>`,
 * not the window), survives layout shifts from the still-animating accordion, and
 * honors `prefers-reduced-motion` internally.
 *
 * Returns per-step accessors meant for `OnboardingAccordionItem`:
 * `expandedOf`/`onExpandedChangeOf` (controlled expansion) and `refOf` (anchor node).
 */
export function useOnboardingAutoAdvance<T extends string>(
  steps: readonly T[],
  completedSteps: readonly T[],
  { scrollOnMount = false }: AutoAdvanceOptions = {},
) {
  // The step the flow points the user at — first incomplete one in display order.
  const nextStep = steps.find(step => !completedSteps.includes(step)) ?? null;

  const [expanded, setExpanded] = useState<Partial<Record<T, boolean>>>(() =>
    nextStep ? ({ [nextStep]: true } as Partial<Record<T, boolean>>) : {},
  );

  const nodesRef = useRef(new Map<T, HTMLDivElement>());
  // Stable per-step ref callbacks, so rows don't detach/re-attach on every render.
  const refCallbacksRef = useRef(new Map<T, (node: HTMLDivElement | null) => void>());
  const prevNextStepRef = useRef(nextStep);

  // `anchor` lands the row near the top of the scroller; `surface-top` scrolls the
  // whole surface back to the top of its container (the node only picks WHICH
  // container to drive — `adjustTargetY` overrides the target to 0).
  const scrollToStep = useCallback((step: T, mode: 'anchor' | 'surface-top' = 'anchor') => {
    const node = nodesRef.current.get(step);
    if (!node) return;
    scrollElementIntoView(
      node,
      mode === 'surface-top' ? { adjustTargetY: () => 0 } : { headerOffset: ANCHOR_TOP_OFFSET_PX },
    );
  }, []);

  // Mount anchor: land the user on the step they should do next.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
  useEffect(() => {
    if (scrollOnMount && prevNextStepRef.current) {
      scrollToStep(prevNextStepRef.current);
    }
  }, []);

  // Auto-advance: when the next incomplete step changes, close the finished one,
  // open the new one, and (after the accordion animation) anchor to it.
  useEffect(() => {
    const prev = prevNextStepRef.current;
    if (nextStep === prev) return;
    prevNextStepRef.current = nextStep;
    setExpanded(current => ({
      ...current,
      ...(prev ? ({ [prev]: false } as Partial<Record<T, boolean>>) : null),
      ...(nextStep ? ({ [nextStep]: true } as Partial<Record<T, boolean>>) : null),
    }));
    const firstStep = steps[0];
    const timer = window.setTimeout(() => {
      if (nextStep) {
        scrollToStep(nextStep);
      } else if (firstStep) {
        // All done — back to the top of the surface so its header (the finisher
        // button) shows.
        scrollToStep(firstStep, 'surface-top');
      }
    }, ACCORDION_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [nextStep, steps, scrollToStep]);

  const expandedOf = useCallback((step: T) => expanded[step] ?? false, [expanded]);

  const onExpandedChangeOf = useCallback(
    (step: T) => (value: boolean) =>
      setExpanded(current => ({ ...current, ...({ [step]: value } as Partial<Record<T, boolean>>) })),
    [],
  );

  const refOf = useCallback((step: T) => {
    let callback = refCallbacksRef.current.get(step);
    if (!callback) {
      callback = node => {
        if (node) nodesRef.current.set(step, node);
        else nodesRef.current.delete(step);
      };
      refCallbacksRef.current.set(step, callback);
    }
    return callback;
  }, []);

  return { nextStep, expandedOf, onExpandedChangeOf, refOf };
}
