'use client';

import { ListBulletIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { EmptyState } from '@/app/components/shared';

interface ScheduleExecutionsTabProps {
  scheduleId: string;
}

/**
 * Execution History for a schedule — **stub**.
 *
 * The backend can't answer "runs of this schedule" yet: there is no
 * `scriptScheduleExecutions(scheduleId)` query and `ScriptExecutionFilterInput`
 * has no `scheduleId`, even though `ScriptExecution.scheduleId` is already
 * stamped at dispatch. Once the backend exposes the query
 * (see docs/script-schedules-v2-execution-history-spec.md), swap this
 * placeholder for a table that mirrors `ScriptExecutionsTab` — the row/filter
 * shape is identical, only the connection field and its `scheduleId` argument
 * differ.
 */
export function ScheduleExecutionsTab(_props: ScheduleExecutionsTabProps) {
  return (
    <EmptyState
      icon={<ListBulletIcon />}
      title="Execution history isn't available yet"
      description="Once this schedule starts firing, each run — device, status, exit code and output — will be listed here."
    />
  );
}
