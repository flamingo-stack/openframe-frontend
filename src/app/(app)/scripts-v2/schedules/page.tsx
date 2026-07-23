'use client';

import { ScriptSchedulesTable } from '../../scripts/v2/components/script-schedules-table';
import { ScriptsV2TabNavigation } from '../../scripts/v2/components/scripts-v2-tabs';

export default function ScriptSchedulesV2Page() {
  return (
    <div className="flex flex-col w-full">
      <ScriptsV2TabNavigation activeTab="schedules" />
      <ScriptSchedulesTable />
    </div>
  );
}
