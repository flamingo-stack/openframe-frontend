'use client';

import { InfoCard } from '@flamingo-stack/openframe-frontend-core';
import {
  BracketCurlyIcon,
  Chevron01DownIcon,
  LaptopIcon,
  MonitorIcon,
  PenEditIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  Button,
  type PageActionButton,
  Skeleton,
  type TabItem,
  TabNavigation,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useLazyLoadQuery } from 'react-relay';
import type { scriptScheduleDetailRelayQuery as ScheduleDetailQueryType } from '@/__generated__/scriptScheduleDetailRelayQuery.graphql';
import type { scriptScheduleDevicesRelayQuery as ScheduleDevicesQueryType } from '@/__generated__/scriptScheduleDevicesRelayQuery.graphql';
import { DeviceSelector } from '@/app/components/shared/device-selector';
import { scriptScheduleDetailRelayQuery } from '@/graphql/scripts/script-schedule-detail-relay';
import { scriptScheduleDevicesRelayQuery } from '@/graphql/scripts/script-schedule-devices-relay';
import { routes } from '@/lib/routes';
import type { Device } from '../../../devices/types/device.types';
import { ScheduleInfoBarFromData } from '../../components/schedule/schedule-info-bar';
import { envVarsToStrings, platformsToIds } from '../utils/script-mappers';
import { NotFoundBoundary, NotFoundSignal } from './not-found-boundary';
import type { ScheduleDetailData } from './schedule-detail-gate';
import { ScriptPageChrome } from './script-page-chrome';

// Execution History is intentionally absent — there is no schedule-run history
// query in the GraphQL schema yet (see docs/script-schedules-v2-graphql-gaps.md).
const SCHEDULE_DETAIL_TABS: TabItem[] = [
  { id: 'scripts', label: 'Scheduled Scripts', icon: BracketCurlyIcon },
  { id: 'devices', label: 'Assigned Devices', icon: MonitorIcon },
];

interface ScheduleDetailsViewProps {
  scheduleId: string;
}

// ----------------------------------------------------------------
// Header island — schedule info bar
// ----------------------------------------------------------------

/**
 * All islands read the same detail query with identical variables: Relay dedupes
 * identical in-flight requests, so mounting them in one commit still issues a
 * single network call; afterwards each renders from the store.
 */
function ScheduleHeaderSection({ scheduleId }: ScheduleDetailsViewProps) {
  const data = useLazyLoadQuery<ScheduleDetailQueryType>(
    scriptScheduleDetailRelayQuery,
    { id: scheduleId },
    { fetchPolicy: 'store-and-network' },
  );
  const schedule = data.scriptSchedule;

  if (!schedule) {
    throw new NotFoundSignal();
  }

  return (
    // TODO(backend): Date / Time / Repeat are placeholders — ScriptSchedule has
    // no timing or repeat fields in the GraphQL schema yet.
    <ScheduleInfoBarFromData
      name={schedule.name}
      note={schedule.description ?? ''}
      date="—"
      time="—"
      repeat="—"
      platforms={platformsToIds(schedule.supportedPlatforms)}
    />
  );
}

/** Mirrors `ScheduleInfoBarFromData`: Name/Note top row + Date/Time/Repeat/Platform bottom row. */
export function ScheduleInfoBarSkeleton() {
  return (
    <div className="flex flex-col gap-0 bg-ods-card border border-ods-border rounded-[6px] overflow-clip w-full">
      <div className="grid grid-cols-2 border-b border-ods-border">
        {['name', 'note'].map(cell => (
          <div key={cell} className="flex flex-col items-start justify-center min-w-0 px-4 py-3 md:py-0 md:h-[80px]">
            <Skeleton className="h-6 w-36 mb-1" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {['date', 'time', 'repeat', 'platform'].map(cell => (
          <div key={cell} className="flex flex-col items-start justify-center min-w-0 px-4 py-3 md:py-0 md:h-[80px]">
            <Skeleton className="h-6 w-20 mb-1" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// "Scheduled Scripts" tab — expandable card per script
// ----------------------------------------------------------------

type ScheduleScript = ScheduleDetailData['scripts'][number];

/** "key value" strings → InfoCard rows (a key with no value renders as a flag). */
function argsToInfoItems(args: ReadonlyArray<string>) {
  return args.map(arg => {
    const spaceIdx = arg.indexOf(' ');
    if (spaceIdx === -1) return { label: arg, value: 'flag' };
    return { label: arg.substring(0, spaceIdx), value: arg.substring(spaceIdx + 1) };
  });
}

/** "name=value" strings → InfoCard rows. */
function envToInfoItems(envStrings: string[]) {
  return envStrings.map(env => {
    const [key, ...rest] = env.includes('=') ? env.split('=') : [env];
    return { label: key, value: rest.join('=') || '' };
  });
}

function ScheduleScriptCard({ script }: { script: ScheduleScript }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleScriptDetails = useCallback(() => {
    router.push(routes.scriptsV2.details(script.id));
  }, [router, script.id]);

  const argsItems = script.defaultArgs && script.defaultArgs.length > 0 ? argsToInfoItems(script.defaultArgs) : null;
  const envStrings = envVarsToStrings(script.envVars);
  const envItems = envStrings.length > 0 ? envToInfoItems(envStrings) : null;

  return (
    <div className="bg-ods-card border border-ods-border rounded-[8px] overflow-clip flex flex-col">
      <div className="flex gap-4 items-center h-[80px] px-4">
        <div className="flex-1 flex flex-col min-w-0">
          <span className="text-h4 text-ods-text-primary truncate" title={script.name}>
            {script.name}
          </span>
          <span className="text-h6 text-ods-text-secondary truncate">Script</span>
        </div>

        <div className="flex flex-col">
          <span className="text-h4 text-ods-text-primary truncate">{script.defaultTimeoutSeconds ?? 300} Seconds</span>
          <span className="text-h6 text-ods-text-secondary truncate">Timeout</span>
        </div>

        <Button variant="outline" onClick={handleScriptDetails} className="hidden md:flex">
          Script Details
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsExpanded(prev => !prev)}
          aria-label={isExpanded ? 'Collapse script details' : 'Expand script details'}
          leftIcon={
            <span className={`inline-flex transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
              <Chevron01DownIcon size={24} />
            </span>
          }
        />
      </div>

      {/* Expandable content — animated with grid rows */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="flex flex-col border-t border-ods-border">
            {argsItems || envItems ? (
              <div className="flex flex-col md:flex-row items-start w-full">
                <div className="flex-1 w-full p-4">
                  {argsItems ? (
                    <InfoCard data={{ title: 'Script Arguments', items: argsItems }} />
                  ) : (
                    <div className="text-h6 text-ods-text-secondary">No script arguments</div>
                  )}
                </div>
                <div className="flex-1 w-full p-4">
                  {envItems ? (
                    <InfoCard data={{ title: 'Environment Vars', items: envItems }} />
                  ) : (
                    <div className="text-h6 text-ods-text-secondary">No environment variables</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-h6 text-ods-text-secondary">
                No script arguments or environment variables configured
              </div>
            )}

            <div className="md:hidden px-4 pb-4">
              <Button variant="outline" onClick={handleScriptDetails} className="w-full">
                Show Script Details
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleScriptsTabSection({ scheduleId }: ScheduleDetailsViewProps) {
  // `store-or-network`: the header island already revalidated this exact query
  // on page load; this island remounts per tab switch and reads the store.
  const data = useLazyLoadQuery<ScheduleDetailQueryType>(
    scriptScheduleDetailRelayQuery,
    { id: scheduleId },
    { fetchPolicy: 'store-or-network' },
  );
  const schedule = data.scriptSchedule;

  // Not-found is escalated (full-page) by the header island; render nothing here.
  if (!schedule) {
    return null;
  }

  if (schedule.scripts.length === 0) {
    return <div className="text-h6 text-ods-text-secondary">No scripts in this schedule yet.</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {schedule.scripts.map(script => (
        <ScheduleScriptCard key={script.id} script={script} />
      ))}
    </div>
  );
}

/** Mirrors {@link ScheduleScriptCard}'s collapsed header row. */
function ScheduleScriptCardSkeleton() {
  return (
    <div className="bg-ods-card border border-ods-border rounded-[8px] overflow-clip flex flex-col">
      <div className="flex gap-4 items-center h-[80px] px-4">
        <div className="flex-1 flex flex-col min-w-0">
          <Skeleton className="h-6 w-44 mb-1" />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex flex-col">
          <Skeleton className="h-6 w-24 mb-1" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-12 w-[130px] rounded-[6px] hidden md:block" />
        <Skeleton className="h-12 w-12 rounded-[6px]" />
      </div>
    </div>
  );
}

function ScheduleScriptsTabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {['a', 'b'].map(key => (
        <ScheduleScriptCardSkeleton key={key} />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// "Assigned Devices" tab — read-only device list
// ----------------------------------------------------------------

export type AssignedMachine = NonNullable<
  ScheduleDevicesQueryType['response']['scriptSchedule']
>['assignedDevices'][number];

/**
 * Adapts a Machine node to the `Device` shape `DeviceSelector` renders.
 * `organization` is deliberately not queried (per-machine N+1 — see the
 * devices query docstring), so the org column is hidden wherever this is used.
 */
export function machineToDevice(machine: AssignedMachine): Device {
  return {
    id: machine.id,
    machineId: machine.machineId,
    hostname: machine.hostname ?? '',
    displayName: machine.displayName ?? machine.hostname ?? '',
    osType: machine.osType ?? '',
    status: machine.status ?? undefined,
  } as Device;
}

function ScheduleDevicesTabSection({ scheduleId }: ScheduleDetailsViewProps) {
  // Dedicated query — the heavy machine resolution loads only when this tab
  // mounts, never with the page itself.
  const data = useLazyLoadQuery<ScheduleDevicesQueryType>(
    scriptScheduleDevicesRelayQuery,
    { id: scheduleId },
    { fetchPolicy: 'store-and-network' },
  );
  const schedule = data.scriptSchedule;

  const devices = useMemo<Device[]>(() => (schedule?.assignedDevices ?? []).map(machineToDevice), [schedule]);

  if (!schedule) {
    return null;
  }

  return <DeviceSelector devices={devices} loading={false} readOnly hideColumns={['organization', 'actions']} />;
}

function ScheduleDevicesTabSkeleton() {
  return <DeviceSelector devices={[]} loading readOnly hideColumns={['organization', 'actions']} />;
}

// ----------------------------------------------------------------
// Page shell — chrome renders immediately, data islands suspend
// ----------------------------------------------------------------

/**
 * The page chrome (title, Back, Edit actions, tab bar) depends only on the
 * route's `scheduleId`, so it renders immediately — only the data islands
 * (info bar, tab body) suspend into colocated skeletons. A missing schedule is
 * escalated from the header island via {@link NotFoundSignal} and swaps the
 * whole page for the full-page not-found state. Keyed by `scheduleId` so a
 * client-side hop to another schedule resets a tripped not-found.
 */
export function ScheduleDetailsView({ scheduleId }: ScheduleDetailsViewProps) {
  const actions = useMemo<PageActionButton[]>(
    () => [
      {
        label: 'Edit Devices',
        variant: 'outline' as const,
        href: routes.scriptsV2.schedules.devices(scheduleId),
        icon: <LaptopIcon size={20} />,
      },
      {
        label: 'Edit Schedule',
        variant: 'outline' as const,
        href: routes.scriptsV2.schedules.edit(scheduleId),
        icon: <PenEditIcon size={20} />,
      },
    ],
    [scheduleId],
  );

  return (
    <NotFoundBoundary key={scheduleId} message="Schedule not found">
      <ScriptPageChrome
        title="Schedule Details"
        backFallback={routes.scriptsV2.schedules.list}
        actions={actions}
        actionsVariant="icon-buttons"
      >
        <div className="flex flex-col gap-[var(--spacing-system-lf)]">
          <Suspense fallback={<ScheduleInfoBarSkeleton />}>
            <ScheduleHeaderSection scheduleId={scheduleId} />
          </Suspense>

          <TabNavigation tabs={SCHEDULE_DETAIL_TABS} urlSync defaultTab="scripts">
            {activeTab =>
              activeTab === 'devices' ? (
                <Suspense fallback={<ScheduleDevicesTabSkeleton />}>
                  <ScheduleDevicesTabSection scheduleId={scheduleId} />
                </Suspense>
              ) : (
                <Suspense fallback={<ScheduleScriptsTabSkeleton />}>
                  <ScheduleScriptsTabSection scheduleId={scheduleId} />
                </Suspense>
              )
            }
          </TabNavigation>
        </div>
      </ScriptPageChrome>
    </NotFoundBoundary>
  );
}
