'use client';

import { scrollElementIntoView } from '@flamingo-stack/openframe-frontend-core/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long the accordion rows animate (the grid-rows 0fr↔1fr transition in
 * `onboarding-accordion` runs 200ms). The auto-advance anchor waits this out so
 * the collapsing/expanding rows settle before the target position is measured —
 * the smooth tween re-tracks the target each frame anyway, but the
 * reduced-motion path is a single instant write and must measure settled
 * geometry.
 */
const ACCORDION_ANIMATION_MS = 250;

/**
 * Breathing room between the top of the scroll container and the anchored row.
 * Replaces the accordion row's former `scroll-mt-20` (80px), which only the
 * native `scrollIntoView` honored — `scrollElementIntoView` takes the offset
 * explicitly instead of reading `scroll-margin-top`. Exported so the page's
 * `navigateSamePageHash` calls aim their tween at the same landing position.
 */
export const ANCHOR_TOP_OFFSET_PX = 80;

/**
 * Marks a row's collapsible body wrapper (set in `onboarding-accordion.tsx`).
 * The click anchor measures the previously open row's body through it to
 * pre-subtract the height that is about to collapse away — same trick as the
 * hub's `ticket-drawer-` lookup in the core-lib `TicketRow`.
 */
const STEP_BODY_SELECTOR = '[data-onboarding-step-body]';

interface AutoAdvanceOptions<T extends string> {
  /**
   * Also anchor the initially open step on mount — for surfaces the user
   * deep-links or returns to (the /onboarding page), where that step may sit
   * below the fold. Off for the dashboard Initial Setup card, which is already
   * the first section.
   * @default false
   */
  scrollOnMount?: boolean;
  /**
   * URL-synced open step (the hub same-page anchor model — `#faq-…`/`#delivery-…`
   * there, `#step-…` here). The page parses + validates the hash fragment and
   * passes it in; the hook reports every open/close through `onOpenStepChange`
   * so the hash always mirrors the open block, and adopts external hash changes
   * (back/forward, edited URL) by opening + anchoring that step. Omit both on
   * surfaces without URL state (the dashboard card).
   */
  urlStep?: T | null;
  /** Reports the open step on every change — `null` means "all collapsed". */
  onOpenStepChange?: (step: T | null) => void;
}

/**
 * Guided single-open accordion flow for an onboarding surface: keeps the FIRST
 * incomplete step (in display order) auto-expanded and anchors it into view as
 * progress advances. One step is open at a time — same model as the hub's
 * ticket/help-center drawers this mirrors.
 *
 * - On mount, the deep-linked (`urlStep`) or next incomplete step starts
 *   expanded (optionally scrolled to) and is reported to the URL.
 * - A chevron toggle opens/closes a step, anchors the clicked row (every click
 *   scrolls — open, close, or cross-row switch, exactly like the hub's
 *   `TicketRow`) and mirrors the change into the URL.
 * - When progress advances (the next incomplete step changes), the finished
 *   step collapses, the new next step expands and is anchored into view.
 * - Once every step is done, the open step collapses and the surface scrolls
 *   back to the top so its header — where the "Complete …" finisher lives —
 *   is in view.
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
  { scrollOnMount = false, urlStep = null, onOpenStepChange }: AutoAdvanceOptions<T> = {},
) {
  // The step the flow points the user at — first incomplete one in display order.
  const nextStep = steps.find(step => !completedSteps.includes(step)) ?? null;

  // Single open step. A URL-provided step wins on mount (deep link / restored
  // tab); otherwise the guided flow opens the first incomplete step.
  const [openStep, setOpenStepState] = useState<T | null>(urlStep ?? nextStep);

  const nodesRef = useRef(new Map<T, HTMLDivElement>());
  // Stable per-step ref callbacks, so rows don't detach/re-attach on every render.
  const refCallbacksRef = useRef(new Map<T, (node: HTMLDivElement | null) => void>());
  const prevNextStepRef = useRef(nextStep);
  const prevUrlStepRef = useRef(urlStep);
  const openStepRef = useRef(openStep);
  openStepRef.current = openStep;
  const onOpenStepChangeRef = useRef(onOpenStepChange);
  onOpenStepChangeRef.current = onOpenStepChange;

  // Every internal transition goes through here so the URL param stays a
  // faithful mirror of the open block.
  const setOpenStep = useCallback((step: T | null) => {
    setOpenStepState(step);
    onOpenStepChangeRef.current?.(step);
  }, []);

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

  // Click anchor — fires immediately on toggle (no animation wait): the tween
  // recomputes its target every frame, and `adjustTargetY` pre-subtracts the
  // still-collapsing body of the previously open row when it sits ABOVE the
  // clicked one, so the scroll aims at the FINAL post-collapse position from
  // frame one. Same math as the hub's `TicketRow` cross-row switch.
  const scrollToToggledStep = useCallback((step: T, collapsingStep: T | null) => {
    const node = nodesRef.current.get(step);
    if (!node) return;
    const collapsingNode = collapsingStep && collapsingStep !== step ? nodesRef.current.get(collapsingStep) : null;
    scrollElementIntoView(node, {
      headerOffset: ANCHOR_TOP_OFFSET_PX,
      adjustTargetY: raw => {
        const body = collapsingNode?.querySelector(STEP_BODY_SELECTOR);
        if (!(body instanceof HTMLElement)) return raw;
        const bodyRect = body.getBoundingClientRect();
        // A collapsing body BELOW the clicked row doesn't shift its resting
        // position — only subtract when it's above. Re-measured per frame, the
        // remaining height converges to 0 as the collapse finishes.
        if (bodyRect.bottom > node.getBoundingClientRect().top) return raw;
        return raw - bodyRect.height;
      },
    });
  }, []);

  // Mount: report the initially open step so the URL reflects it from the
  // start, and (on deep-linkable surfaces) land the user on it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design
  useEffect(() => {
    const initial = openStepRef.current;
    if (!initial) return;
    if (initial !== urlStep) onOpenStepChangeRef.current?.(initial);
    if (scrollOnMount) scrollToStep(initial);
  }, []);

  // Adopt external URL changes (back/forward, hand-edited param): the URL owns
  // the open drawer, so follow it and anchor the newly opened row. Our own
  // writes echo back with `urlStep === openStep` and fall through.
  useEffect(() => {
    if (urlStep === prevUrlStepRef.current) return;
    prevUrlStepRef.current = urlStep;
    if (urlStep === openStepRef.current) return;
    const collapsing = openStepRef.current;
    setOpenStepState(urlStep);
    if (urlStep) scrollToToggledStep(urlStep, collapsing);
  }, [urlStep, scrollToToggledStep]);

  // Auto-advance: when the next incomplete step changes, close the finished one,
  // open the new one, and (after the accordion animation) anchor to it.
  useEffect(() => {
    const prev = prevNextStepRef.current;
    if (nextStep === prev) return;
    prevNextStepRef.current = nextStep;
    setOpenStep(nextStep);
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
  }, [nextStep, steps, scrollToStep, setOpenStep]);

  const expandedOf = useCallback((step: T) => step === openStep, [openStep]);

  const onExpandedChangeOf = useCallback(
    (step: T) => (value: boolean) => {
      const collapsing = openStepRef.current;
      setOpenStep(value ? step : null);
      // Every click anchors the clicked row — open, close, or switch.
      scrollToToggledStep(step, value ? collapsing : null);
    },
    [setOpenStep, scrollToToggledStep],
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
