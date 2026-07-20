'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long the accordion rows animate (the grid-rows 0fr↔1fr transition in
 * `onboarding-accordion` runs 200ms). The anchor scroll waits this out so the
 * collapsing/expanding rows settle before the target position is measured.
 */
const ACCORDION_ANIMATION_MS = 250;

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
 * - Once every step is done, the last step collapses and the first row is centered
 *   so the surface header — where the "Complete …" finisher lives — is back in view.
 * - The user stays in control: chevron toggles write to the same state, and the
 *   hook only overrides it at the moment progress actually advances.
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

  const scrollToStep = useCallback((step: T, block: ScrollLogicalPosition = 'start') => {
    const node = nodesRef.current.get(step);
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block });
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
        // All done — center the surface so its header (the finisher button) shows.
        scrollToStep(firstStep, 'center');
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
