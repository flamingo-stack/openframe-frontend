'use client';

import { Button } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import type { ReactNode } from 'react';

interface OnboardingCompleteBannerProps {
  /** Leading emoji shown in a bordered icon box (e.g. "🎉"). */
  emoji: string;
  title: string;
  description: string;
  /** Accent (yellow) call-to-action label. */
  actionLabel: string;
  onAction: () => void;
  /** Optional leading icon for the action button (e.g. <CheckCircleIcon />). */
  actionIcon?: ReactNode;
  /**
   * Outer background. The dashboard Initial Setup card sits on `bg-ods-bg`, so its
   * footer banner passes `bg-ods-bg` to read as a bordered box on the same surface;
   * the Get Started page sits on `bg-ods-bg` too but its banner is `bg-ods-card` so it
   * reads as a raised card. Defaults to `bg-ods-card`.
   */
  className?: string;
}

/**
 * The "all steps complete" banner shown on both onboarding surfaces once every step is
 * done — 🎉 emoji + title/description + an accent CTA. Shared by the Initial Setup card
 * ("Setup Complete" → Take the Product Tour) and the Get Started page ("All Steps Done!"
 * → Go to Dashboard). Layout/spacing/typography follow the ODS tokens the accordion rows
 * use, so the banner lines up with the rows above/below it.
 */
export function OnboardingCompleteBanner({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  className,
}: OnboardingCompleteBannerProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-[var(--spacing-system-sf)] rounded-md border border-ods-border p-[var(--spacing-system-m)] md:flex-row md:items-center',
        className ?? 'bg-ods-card',
      )}
    >
      {/* Emoji + text stay in one row even on mobile — only the CTA drops below (per the
          mobile Figma). On desktop this group grows to push the CTA to the right. */}
      <div className="flex items-center gap-[var(--spacing-system-s)] md:min-w-0 md:flex-1">
        {/* Emoji box — 40px on mobile, 48px on desktop. */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-ods-border bg-ods-bg text-h3 md:size-12">
          <span aria-hidden>{emoji}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="text-h3 text-ods-text-primary">{title}</p>
          <p className="text-h6 text-ods-text-secondary">{description}</p>
        </div>
      </div>

      <Button variant="accent" leftIcon={actionIcon} onClick={onAction} className="w-full md:w-auto">
        {actionLabel}
      </Button>
    </div>
  );
}
