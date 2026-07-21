'use client';

import { useSearchParams } from 'next/navigation';
import { ScheduleDevicesView } from '../../../scripts/v2/components/schedule-devices-view';

export default function ScheduleDevicesV2Page() {
  const id = useSearchParams().get('id') ?? '';
  return <ScheduleDevicesView scheduleId={id} />;
}
