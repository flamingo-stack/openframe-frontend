'use client';

import { useSearchParams } from 'next/navigation';
import { ScheduleDetailsView } from '../../../scripts/v2/components/schedule-details-view';

export default function ScheduleDetailsV2Page() {
  const id = useSearchParams().get('id') ?? '';
  return <ScheduleDetailsView scheduleId={id} />;
}
