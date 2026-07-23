'use client';

import { useRequiredIdParam } from '@/app/hooks/use-required-id-param';
import { routes } from '@/lib/routes';
import { EditSchedulePage } from '../../../scripts/v2/components/edit-schedule-page';

export default function EditScheduleV2Page() {
  const id = useRequiredIdParam('/scripts-v2/schedules', routes.scriptsV2.schedules.new);
  if (!id) return null;
  return <EditSchedulePage scheduleId={id} />;
}
