'use client';

import { CheckCircleIcon, Chevron02DownIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button, Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import React from 'react';

/**
 * Inline (phrasing-valid `<span>`) skeleton bar for the loading title/description.
 * Lives INSIDE the real `<p>` so that element's line box sets the height — the loading
 * row is pixel-identical to the loaded one, only the text is a bar instead of real text.
 */
function InlineTextSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block max-w-full animate-pulse rounded-md bg-ods-border align-middle', className)}
    />
  );
}

/**
 * Visual status of an onboarding step.
 * - `active`    — interactive step, can be expanded/collapsed (uses its own icon)
 * - `completed` — finished step, shows a green check + "Complete" tag, still expandable
 * - `disabled`  — locked step, muted styling, not interactive, shows a requirement hint
 */
export type OnboardingStepStatus = 'active' | 'completed' | 'disabled';

export interface OnboardingAccordionItemProps {
  /** Leading icon, expected at 24x24 (e.g. <IdCardIcon size={24} />). Overridden by a green check when completed. */
  icon: React.ReactNode;
  title: string;
  description: string;
  /** @default 'active' */
  status?: OnboardingStepStatus;
  /** Right-aligned hint shown for `disabled` steps (e.g. "Added Customer required"). */
  requirementHint?: string;
  /** Whether the step starts expanded. Ignored for `disabled`. @default false */
  defaultExpanded?: boolean;
  /**
   * Controlled expansion. When set, the row follows this value and reports chevron
   * toggles via `onExpandedChange` instead of keeping internal state (used by the
   * auto-advance flow — see `useOnboardingAutoAdvance`). Ignored for `disabled`.
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Ref to the row's root element — the scroll anchor for the auto-advance flow. */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * DOM id for the row's root element — the URL-hash anchor target
   * (`/onboarding#step-…`, see `onboardingStepAnchorId`). Optional: surfaces
   * without hash deep-linking (the dashboard card) omit it.
   */
  id?: string;
  /**
   * Loading state: renders the row frame exactly as an `active` step, but the title,
   * description and trailing status control are all skeleton bars (only the leading
   * icon stays real), and the body is not mounted. Kept pixel-identical in height to
   * the loaded row so the page skeleton reuses it verbatim without a jump. @default false
   */
  loading?: boolean;
  /** Expanded body. Not implemented yet — the step body is wired up later. */
  children?: React.ReactNode;
}

/**
 * A single onboarding accordion row. Renders the header (icon, title, description and
 * trailing control) and, when expanded, the step body. The inner body content is
 * intentionally left to the caller — it is wired up in a later iteration.
 *
 * Spacing uses the `--spacing-system-*` design tokens; expand/collapse animates via a
 * `grid-rows` 0fr→1fr transition so it works for content of any height.
 */
export function OnboardingAccordionItem({
  icon,
  title,
  description,
  status = 'active',
  requirementHint,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  loading = false,
  children,
  ref,
  id,
}: OnboardingAccordionItemProps) {
  const isDisabled = !loading && status === 'disabled';
  const isCompleted = !loading && status === 'completed';
  const [internalExpanded, setInternalExpanded] = React.useState(!isDisabled && defaultExpanded);
  const expanded = !isDisabled && (controlledExpanded ?? internalExpanded);

  const toggle = React.useCallback(() => {
    if (isDisabled) return;
    const next = !expanded;
    setInternalExpanded(next);
    onExpandedChange?.(next);
  }, [isDisabled, expanded, onExpandedChange]);

  return (
    <div
      ref={ref}
      id={id}
      className={cn(
        // Top offset for the auto-advance anchor lives in the hook (`scrollElementIntoView`
        // headerOffset), not in a scroll-mt here — the helper ignores scroll-margin-top.
        'w-full border-b border-ods-border transition-colors duration-200 ease-out motion-reduce:transition-none',
        expanded && !loading ? 'bg-ods-bg' : 'bg-ods-card',
      )}
    >
      {/* Header is not interactive — only the chevron button toggles the step. */}
      <div className="flex w-full items-center gap-[var(--spacing-system-s)] p-[var(--spacing-system-m)] text-left">
        {/* Icon box — matches the chevron Button's `size="icon"` footprint (44px → 48px). */}
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-ods-border md:h-12 md:w-12',
            '[&_svg]:size-4 md:[&_svg]:size-6',
            isDisabled ? 'bg-ods-card' : 'bg-ods-bg',
            // The leading step icon stays grey in every state (active/closed/open/disabled);
            // only the completed state swaps it for the green success check.
            isCompleted ? 'text-ods-success' : 'text-ods-text-secondary',
          )}
        >
          {isCompleted ? <CheckCircleIcon /> : icon}
        </div>

        {/* Title + description — skeleton bars while loading (kept inside the real
            `<p>` line boxes so the row height is identical to the loaded one). */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className={cn('text-h3', isDisabled ? 'text-ods-border' : 'text-ods-text-primary')}>
            {loading ? <InlineTextSkeleton className="h-4 w-40 md:h-5" /> : title}
          </p>
          <p className={cn('text-h6', isDisabled ? 'text-ods-border' : 'text-ods-text-secondary')}>
            {loading ? <InlineTextSkeleton className="h-3 w-64 max-w-full" /> : description}
          </p>
        </div>

        {/* Trailing: skeleton (loading) / requirement hint (disabled) / complete tag + chevron / chevron.
            Status is the one thing the skeleton doesn't know, so only this control is a placeholder. */}
        {loading ? (
          <Skeleton className="h-11 w-11 shrink-0 rounded-md md:h-12 md:w-12" />
        ) : isDisabled ? (
          requirementHint ? (
            <p className="shrink-0 whitespace-nowrap text-right text-h6 text-ods-text-secondary">{requirementHint}</p>
          ) : null
        ) : (
          <div className="flex shrink-0 items-center gap-[var(--spacing-system-s)]">
            {isCompleted ? (
              <span className="flex h-8 items-center justify-center rounded-md bg-ods-success-secondary px-[var(--spacing-system-xsf)] text-h5 text-ods-success">
                Complete
              </span>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={toggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            >
              <Chevron02DownIcon
                className={cn(
                  'transition-transform duration-300 ease-out motion-reduce:transition-none',
                  expanded && 'rotate-180',
                )}
              />
            </Button>
          </div>
        )}
      </div>

      {/* Step body, animated via grid-rows 0fr→1fr. Not mounted for disabled steps, so a
          locked step never runs its form's data hooks — nor while loading, so the skeleton
          never mounts a step's (suspending) data hooks. */}
      {!isDisabled && !loading && (
        <div
          // The auto-advance click anchor measures this wrapper (its height is the
          // row's visible body) to pre-subtract a collapsing row above the clicked
          // one — see STEP_BODY_SELECTOR in `useOnboardingAutoAdvance`.
          data-onboarding-step-body
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="px-[var(--spacing-system-m)] pb-[var(--spacing-system-xl)]">{children}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface OnboardingAccordionGroupProps {
  /** Optional uppercase section label rendered above the group. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Groups one or more {@link OnboardingAccordionItem}s inside a bordered, rounded
 * container with dividers between rows. Use `label` for a section heading.
 */
export function OnboardingAccordionGroup({ label, children, className }: OnboardingAccordionGroupProps) {
  return (
    <div className={cn('flex w-full flex-col gap-[var(--spacing-system-xxs)]', className)}>
      {label ? <p className="text-h5 text-ods-text-secondary">{label}</p> : null}
      <div className="flex w-full flex-col overflow-hidden rounded-md border border-ods-border [&>*:last-child]:border-b-0">
        {children}
      </div>
    </div>
  );
}
