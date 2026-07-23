'use client';

import { ListCheckIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { AnnouncementBarView, Button } from '@flamingo-stack/openframe-frontend-core/components/ui';

/**
 * Full-width banner rendered in the app layout's `topBar` slot (above sidebar +
 * header) while the tenant "Initial Setup" is unfinished. Accent-yellow surface
 * with on-accent (dark) text — see ODS `--color-accent-primary` / `on-accent`.
 * Hidden on the page that hosts the setup card (dashboard); visibility is
 * decided by the caller.
 *
 * Markup/responsiveness come from the shared {@link AnnouncementBarView}
 * (Figma 9364-40603 / 9418-43969 / ODS 2862-8391 mobile): one row from `md` up
 * with the CTA at content width, below `md` the CTA is full-width on its own
 * row under the icon + wrapping title. The CTA reads "Start Setup" until the
 * first step is done, then "Continue Setup" (`started`). Button uses
 * `variant="outline" size="small"` — a dark card surface with an uppercase
 * Azeret Mono (`text-h5`) label, matching Figma.
 *
 * `showAction` (default true) — when false the CTA is not rendered at all and
 * the bar collapses to its content height (per the updated mockup), e.g. on
 * the page that already hosts the setup card (the dashboard).
 */
export function InitialSetupBar({
  onStart,
  started = false,
  showAction = true,
}: {
  onStart: () => void;
  started?: boolean;
  showAction?: boolean;
}) {
  return (
    <AnnouncementBarView
      className="shrink-0 bg-ods-accent text-ods-text-on-accent"
      startAdornment={<ListCheckIcon className="size-[var(--icon-size-icon-size)] shrink-0" />}
      title="Complete your Initial Setup to start using OpenFrame."
      actionBlock={
        showAction ? (
          <Button variant="outline" size="small" onClick={onStart}>
            {started ? 'Continue Setup' : 'Start Setup'}
          </Button>
        ) : undefined
      }
    />
  );
}
