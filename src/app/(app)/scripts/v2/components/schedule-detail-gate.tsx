'use client';

import { type ReactNode, Suspense, useLayoutEffect, useState } from 'react';
import { useLazyLoadQuery } from 'react-relay';
import type { scriptScheduleDetailRelayQuery as ScheduleDetailQueryType } from '@/__generated__/scriptScheduleDetailRelayQuery.graphql';
import { scriptScheduleDetailRelayQuery } from '@/graphql/scripts/script-schedule-detail-relay';
import { NotFoundBoundary, NotFoundSignal } from './not-found-boundary';

/** The loaded `scriptSchedule` payload of the detail query. Not-found never reaches consumers — see {@link ScheduleDetailGate}. */
export type ScheduleDetailData = NonNullable<ScheduleDetailQueryType['response']['scriptSchedule']>;

/**
 * Invisible data island: suspends on the schedule query (inside the gate's
 * silent `<Suspense fallback={null}>`) and hands the result up. A missing
 * schedule throws {@link NotFoundSignal} — the same full-page not-found
 * mechanism the script pages use — so consumers only ever see a loaded schedule.
 *
 * `store-and-network`: always revalidate against the server. Consumers must
 * tolerate a late second delivery — the edit form guards its seeding effect
 * on `!isDirty`.
 */
function ScheduleDataSeeder({
  scheduleId,
  onData,
}: {
  scheduleId: string;
  onData: (schedule: ScheduleDetailData) => void;
}) {
  const data = useLazyLoadQuery<ScheduleDetailQueryType>(
    scriptScheduleDetailRelayQuery,
    { id: scheduleId },
    { fetchPolicy: 'store-and-network' },
  );
  const schedule = data.scriptSchedule;

  // Layout effect so a warm Relay store (navigating from the details page) seeds
  // the page before the first paint — the empty state is never shown at all.
  useLayoutEffect(() => {
    if (schedule) onData(schedule);
  }, [schedule, onData]);

  if (!schedule) {
    throw new NotFoundSignal();
  }

  return null;
}

interface ScheduleDetailGateProps {
  scheduleId: string;
  /** Rendered immediately; `schedule` is `undefined` while the query is in flight. */
  children: (schedule: ScheduleDetailData | undefined) => ReactNode;
}

function ScheduleDetailGateInner({ scheduleId, children }: ScheduleDetailGateProps) {
  // undefined = query in flight; not-found never lands here (the seeder throws).
  const [schedule, setSchedule] = useState<ScheduleDetailData | undefined>(undefined);

  return (
    <NotFoundBoundary message="Schedule not found">
      <Suspense fallback={null}>
        <ScheduleDataSeeder scheduleId={scheduleId} onData={setSchedule} />
      </Suspense>
      {children(schedule)}
    </NotFoundBoundary>
  );
}

/**
 * Owns the "render the real page once, pour the data in" pattern for the
 * schedule edit and devices pages — the same gate the script pages use (see
 * `script-detail-gate.tsx` for the full rationale). Keyed by `scheduleId` so a
 * client-side hop between schedules remounts state, boundary and form.
 */
export function ScheduleDetailGate(props: ScheduleDetailGateProps) {
  return <ScheduleDetailGateInner key={props.scheduleId} {...props} />;
}
