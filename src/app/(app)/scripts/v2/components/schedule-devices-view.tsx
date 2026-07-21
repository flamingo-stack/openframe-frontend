'use client';

import type { PageActionButton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLazyLoadQuery, useMutation } from 'react-relay';
import type { scriptScheduleDevicesRelayQuery as ScheduleDevicesQueryType } from '@/__generated__/scriptScheduleDevicesRelayQuery.graphql';
import type { setScriptScheduleDevicesMutation as SetDevicesMutationType } from '@/__generated__/setScriptScheduleDevicesMutation.graphql';
import { DeviceSelector } from '@/app/components/shared/device-selector';
import { safeBackOrReplace } from '@/app/hooks/use-safe-back';
import { scriptScheduleDevicesRelayQuery } from '@/graphql/scripts/script-schedule-devices-relay';
import { setScriptScheduleDevicesMutation } from '@/graphql/scripts/set-script-schedule-devices-mutation';
import { routes } from '@/lib/routes';
import { ScheduleInfoBarFromData } from '../../components/schedule/schedule-info-bar';
import { getDevicePrimaryId } from '../../utils/device-helpers';
import { useRunDevices } from '../hooks/use-run-devices';
import { platformsToIds } from '../utils/script-mappers';
import { type ScheduleDetailData, ScheduleDetailGate } from './schedule-detail-gate';
import type { AssignedMachine } from './schedule-details-view';
import { ScheduleInfoBarSkeleton } from './schedule-details-view';
import { ScriptPageChrome } from './script-page-chrome';

/**
 * Invisible island for the schedule's CURRENT device assignment. It rides the
 * dedicated (heavy) devices query — kept out of the detail gate so the page
 * chrome, info bar and candidate list never wait on per-machine resolution —
 * and hands the machines up once loaded (mirrors the gate's seeder pattern).
 */
function AssignedDevicesSeeder({
  scheduleId,
  onData,
}: {
  scheduleId: string;
  onData: (machines: readonly AssignedMachine[]) => void;
}) {
  const data = useLazyLoadQuery<ScheduleDevicesQueryType>(
    scriptScheduleDevicesRelayQuery,
    { id: scheduleId },
    { fetchPolicy: 'store-and-network' },
  );
  const schedule = data.scriptSchedule;

  useLayoutEffect(() => {
    if (schedule) onData(schedule.assignedDevices);
  }, [schedule, onData]);

  return null;
}

interface ScheduleDevicesContentProps {
  scheduleId: string;
  /** `undefined` while the gated schedule query is in flight. */
  schedule: ScheduleDetailData | undefined;
}

function ScheduleDevicesContent({ scheduleId, schedule }: ScheduleDevicesContentProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [commitSetDevices, isSaving] = useMutation<SetDevicesMutationType>(setScriptScheduleDevicesMutation);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // undefined = current assignment still loading; the selection seeds (and Save
  // unlocks) only once it arrives, so a save can never wipe an unseen assignment.
  const [assigned, setAssigned] = useState<readonly AssignedMachine[] | undefined>(undefined);

  const supportedPlatforms = useMemo(() => platformsToIds(schedule?.supportedPlatforms), [schedule]);

  // Candidate devices, narrowed to the schedule's platforms (same GraphQL
  // devices fetch the v2 run-script page uses).
  const { devices: allDevices, isLoadingDevices } = useRunDevices({
    scriptId: scheduleId,
    supportedPlatforms,
    enabled: Boolean(schedule),
  });

  // Seed the selection from the current assignment exactly once — later
  // deliveries must not clobber in-progress editing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (assigned && !seededRef.current) {
      seededRef.current = true;
      setSelectedIds(new Set(assigned.map(m => m.machineId).filter(Boolean)));
    }
  }, [assigned]);

  const handleSave = useCallback(() => {
    if (!schedule || !assigned) return;

    // Selection keys are `machineId` strings (see `getDevicePrimaryId`), but the
    // mutation takes Machine GLOBAL ids — resolve keys through both the fetched
    // candidates and the current assignment (an assigned device may be absent
    // from the candidate page, e.g. beyond the fetch limit).
    const keyToGlobalId = new Map<string, string>();
    for (const machine of assigned) {
      if (machine.machineId) keyToGlobalId.set(machine.machineId, machine.id);
    }
    for (const device of allDevices) {
      keyToGlobalId.set(getDevicePrimaryId(device), device.id);
    }

    const machineIds = [...selectedIds].map(key => keyToGlobalId.get(key)).filter((id): id is string => Boolean(id));

    commitSetDevices({
      variables: { scheduleId, machineIds },
      onCompleted: () => {
        toast({
          title: 'Devices saved',
          description: `${machineIds.length} device(s) assigned to schedule.`,
          variant: 'success',
        });
        safeBackOrReplace(router, routes.scriptsV2.schedules.details(scheduleId, { tab: 'devices' }));
      },
      onError: error => {
        toast({
          title: 'Save failed',
          description: error.message || 'Failed to save devices',
          variant: 'destructive',
        });
      },
    });
  }, [schedule, assigned, allDevices, selectedIds, commitSetDevices, scheduleId, toast, router]);

  const actions = useMemo<PageActionButton[]>(
    () => [
      {
        label: 'Save Devices',
        onClick: handleSave,
        variant: 'accent' as const,
        disabled: !schedule || assigned === undefined || isSaving,
        loading: isSaving,
      },
    ],
    [handleSave, schedule, assigned, isSaving],
  );

  return (
    <ScriptPageChrome
      title="Schedule Devices"
      backFallback={routes.scriptsV2.schedules.details(scheduleId)}
      actions={actions}
    >
      <Suspense fallback={null}>
        <AssignedDevicesSeeder scheduleId={scheduleId} onData={setAssigned} />
      </Suspense>

      <DeviceSelector
        devices={allDevices}
        loading={!schedule || assigned === undefined || isLoadingDevices}
        selectedIds={selectedIds}
        getDeviceKey={getDevicePrimaryId}
        onSelectionChange={setSelectedIds}
        disabled={isSaving}
        addAllBehavior="replace"
        headerContent={
          schedule ? (
            // TODO(backend): Date / Time / Repeat are placeholders — no timing
            // fields on ScriptSchedule yet.
            <ScheduleInfoBarFromData
              name={schedule.name}
              note={schedule.description ?? ''}
              date="—"
              time="—"
              repeat="—"
              platforms={supportedPlatforms}
            />
          ) : (
            <ScheduleInfoBarSkeleton />
          )
        }
      />
    </ScriptPageChrome>
  );
}

interface ScheduleDevicesViewProps {
  scheduleId: string;
}

/**
 * "Edit Devices" page (v2, Relay): replaces the schedule's device assignment
 * via `setScriptScheduleDevices`. The chrome and the selector render
 * immediately; the schedule pours in through {@link ScheduleDetailGate} and the
 * current assignment through {@link AssignedDevicesSeeder} (info-bar skeleton +
 * loading rows until then). A missing schedule swaps the page for the
 * full-page not-found state.
 */
export function ScheduleDevicesView({ scheduleId }: ScheduleDevicesViewProps) {
  return (
    <ScheduleDetailGate scheduleId={scheduleId}>
      {schedule => <ScheduleDevicesContent scheduleId={scheduleId} schedule={schedule} />}
    </ScheduleDetailGate>
  );
}
