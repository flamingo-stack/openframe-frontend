'use client';

import { MingoIcon } from '@flamingo-stack/openframe-frontend-core/components/icons';
import type { EmptyStateProps } from './empty-state';

/** Sections whose empty state carries an "Ask Mingo about X" footer button. */
export type AskMingoSource =
  | 'queries'
  | 'customers'
  | 'policies'
  | 'scripts'
  | 'script-schedules'
  | 'logs'
  | 'devices'
  | 'tickets';

/**
 * Link per section. The button renders only for sections that have a link
 * configured here — an unset entry hides the button entirely.
 */
const ASK_MINGO_LINKS: Partial<Record<AskMingoSource, string>> = {};

type AskMingoButtonProps = Pick<EmptyStateProps, 'buttonLabel' | 'buttonIcon' | 'onButtonClick'>;

/**
 * Footer-button props for a section's `EmptyState`, spread as
 * `{...askMingoButton('customers', 'Ask Mingo about Customers')}`.
 * Returns `{}` (no button) when the section has no link in `ASK_MINGO_LINKS`.
 */
export function askMingoButton(source: AskMingoSource, label: string): AskMingoButtonProps {
  if (!ASK_MINGO_LINKS[source]) return {};
  return {
    buttonLabel: label,
    buttonIcon: (
      <MingoIcon
        className="size-5"
        eyesColor="var(--ods-flamingo-cyan-base)"
        cornerColor="var(--ods-flamingo-cyan-base)"
      />
    ),
    onButtonClick: () => {},
  };
}
