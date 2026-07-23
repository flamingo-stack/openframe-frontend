'use client';

import { OSTypeBadgeGroup } from '@flamingo-stack/openframe-frontend-core/components';
import {
  ArrowRightUpIcon,
  BoxArchiveIcon,
  Filter02Icon,
  HourglassClockIcon,
  LaptopIcon,
  ListBulletIcon,
  PenEditIcon,
  PlusCircleIcon,
  RadarIcon,
  SearchIcon,
  TimerIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  ActionsMenuDropdown,
  type ActionsMenuGroup,
  Button,
  type ColumnDef,
  DataTable,
  type DataTableSortState,
  FilterModal,
  Input,
  multiSelectFilterFn,
  PageLayout,
  type Row,
  TruncateText,
  useDataTable,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useApiParams, useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchQuery, useLazyLoadQuery, useMutation, usePaginationFragment, useRelayEnvironment } from 'react-relay';
import type { RecordSourceSelectorProxy } from 'relay-runtime';
import type { archiveScriptScheduleMutation as ArchiveScheduleMutationType } from '@/__generated__/archiveScriptScheduleMutation.graphql';
import type { scriptScheduleFiltersRefreshRelayQuery as ScheduleFiltersRefreshQueryType } from '@/__generated__/scriptScheduleFiltersRefreshRelayQuery.graphql';
import type { scriptSchedulesTableRelay_query$key as SchedulesFragmentKey } from '@/__generated__/scriptSchedulesTableRelay_query.graphql';
import type { scriptSchedulesTableRelayPaginationQuery as SchedulesPaginationQueryType } from '@/__generated__/scriptSchedulesTableRelayPaginationQuery.graphql';
import type {
  scriptSchedulesTableRelayQuery as SchedulesTableQueryType,
  ScriptScheduleFilterInput,
  SortInput,
} from '@/__generated__/scriptSchedulesTableRelayQuery.graphql';
import type { unarchiveScriptScheduleMutation as UnarchiveScheduleMutationType } from '@/__generated__/unarchiveScriptScheduleMutation.graphql';
import { EmptyState, onboardingGuideButton } from '@/app/components/shared';
import { useDeferredQuery } from '@/app/hooks/use-deferred-query';
import { useSafeBack } from '@/app/hooks/use-safe-back';
import { useSearchParam } from '@/app/hooks/use-search-param';
import { useStickyToolbar } from '@/app/hooks/use-sticky-toolbar';
import { ScriptStatus } from '@/generated/schema-enums';
import { archiveScriptScheduleMutation } from '@/graphql/scripts/archive-script-schedule-mutation';
import { scriptScheduleFiltersRefreshRelayQuery } from '@/graphql/scripts/script-schedule-filters-refresh-relay';
import {
  scriptSchedulesTableRelayFragment,
  scriptSchedulesTableRelayQuery,
} from '@/graphql/scripts/script-schedules-table-relay';
import { unarchiveScriptScheduleMutation } from '@/graphql/scripts/unarchive-script-schedule-mutation';
import { openInNewTab } from '@/lib/open-in-new-tab';
import { routes } from '@/lib/routes';
import { formatScheduleStartAt, repeatToLabel } from '../utils/schedule-timing';
import { platformsToEnums, platformsToIds } from '../utils/script-mappers';
import { ArchiveScheduleModal } from './archive-schedule-modal';
import { RestoreScheduleModal } from './restore-schedule-modal';

const PAGE_SIZE = 20;

interface UiScheduleEntry {
  id: string;
  name: string;
  description: string;
  supportedPlatforms: string[];
  deviceCount: number;
  startAt: string | null;
  repeat: number | null;
}

// ----------------------------------------------------------------
// Inner content — Relay hooks, must live inside Suspense
// ----------------------------------------------------------------

interface SchedulesTableContentProps {
  backendFilters: ScriptScheduleFilterInput;
  debouncedSearch: string;
  /** Deferred sort — feeds the query (lags the live indicator during a refetch). */
  sort: SortInput | null;
  tableFilters: Record<string, string[]>;
  /** Live sort — drives the header indicator so it flips instantly on click. */
  sortState: DataTableSortState | null;
  onSortChange: (columnId: string) => void;
  /**
   * True while the deferred query variables lag the live filter/search state
   * (a refetch is in flight and the rows on screen are the previous result) —
   * guards the empty state so it never flashes on stale data.
   */
  isPending: boolean;
  onFilterChange: (filters: Record<string, any[]>) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  mobileFilterOpen: boolean;
  onMobileFilterClose: () => void;
  stickyHeaderOffset: string;
  archived: boolean;
}

function SchedulesTableContent({
  backendFilters,
  debouncedSearch,
  sort,
  tableFilters,
  sortState,
  onSortChange,
  isPending,
  onFilterChange,
  onEmptyChange,
  mobileFilterOpen,
  onMobileFilterClose,
  stickyHeaderOffset,
  archived,
}: SchedulesTableContentProps) {
  const { toast } = useToast();
  const environment = useRelayEnvironment();

  const [commitArchive, isArchiving] = useMutation<ArchiveScheduleMutationType>(archiveScriptScheduleMutation);
  const [commitUnarchive, isUnarchiving] = useMutation<UnarchiveScheduleMutationType>(unarchiveScriptScheduleMutation);

  // Schedule whose archive/restore is awaiting confirmation in the modal (null = closed).
  const [confirmTarget, setConfirmTarget] = useState<UiScheduleEntry | null>(null);

  // One round-trip per interaction: the filter facets (`scriptScheduleFilters`)
  // ride the list operation — see the query docstring.
  const queryData = useLazyLoadQuery<SchedulesTableQueryType>(
    scriptSchedulesTableRelayQuery,
    {
      filter: backendFilters,
      search: debouncedSearch || null,
      sort,
      first: PAGE_SIZE,
      after: null,
    },
    { fetchPolicy: 'store-and-network' },
  );

  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<
    SchedulesPaginationQueryType,
    SchedulesFragmentKey
  >(scriptSchedulesTableRelayFragment, queryData);

  // This list's connection record id — handed to archive/unarchive's `@deleteEdge`
  // so the mutated schedule's edge is removed from THIS list only.
  const connectionId = data.scriptSchedules?.__id;

  const transformedSchedules: UiScheduleEntry[] = useMemo(() => {
    const edges = data.scriptSchedules?.edges ?? [];
    // Defensive null-edge/node guard — mirrors scripts-table; `@deleteEdge`
    // keeps the record, so dangling edges aren't expected, but skipping them
    // keeps the map crash-proof.
    return edges.flatMap(edge => {
      const node = edge?.node;
      if (!node) return [];
      return [
        {
          id: node.id,
          name: node.name,
          description: node.description ?? '',
          supportedPlatforms: platformsToIds(node.supportedPlatforms),
          deviceCount: node.deviceCount,
          startAt: node.startAt ?? null,
          repeat: node.repeat ?? null,
        },
      ];
    });
  }, [data.scriptSchedules?.edges]);

  const fetchNextPage = useCallback(() => {
    if (hasNext && !isLoadingNext) {
      loadNext(PAGE_SIZE);
    }
  }, [hasNext, isLoadingNext, loadNext]);

  // Server-driven platform facet, mapped from the backend enum to the UI id the
  // column filter + `backendFilters` use (windows / darwin / linux).
  const platformOptions = useMemo(
    () =>
      (queryData.scriptScheduleFilters?.platforms ?? [])
        .map(p => {
          const id = platformsToIds([p.value])[0];
          return id ? { id, label: p.label, value: id } : null;
        })
        .filter((o): o is { id: string; label: string; value: string } => o !== null),
    [queryData.scriptScheduleFilters?.platforms],
  );

  const renderRowActions = useCallback(
    (schedule: UiScheduleEntry) => {
      const editHref = routes.scriptsV2.schedules.edit(schedule.id);
      const devicesHref = routes.scriptsV2.schedules.devices(schedule.id);
      const newTabIcon = <ArrowRightUpIcon className="w-5 h-5 text-ods-text-secondary" />;
      const mutating = isArchiving || isUnarchiving;

      // Archive (active list) ↔ Unarchive (archived list). The action only opens
      // a confirmation modal; the mutation runs on confirm.
      const groups: ActionsMenuGroup[] = [
        {
          items: [
            {
              id: 'edit-schedule',
              label: 'Edit Schedule',
              icon: <PenEditIcon className="w-6 h-6 text-ods-text-secondary" />,
              href: editHref,
              iconAction: {
                icon: newTabIcon,
                'aria-label': 'Open Edit Schedule in new tab',
                href: editHref,
                openInNewTab: true,
              },
            },
            {
              id: 'edit-devices',
              label: 'Edit Devices',
              icon: <LaptopIcon className="w-6 h-6 text-ods-text-secondary" />,
              href: devicesHref,
              iconAction: {
                icon: newTabIcon,
                'aria-label': 'Open Edit Devices in new tab',
                href: devicesHref,
                openInNewTab: true,
              },
            },
            {
              id: archived ? 'unarchive-schedule' : 'archive-schedule',
              label: archived ? 'Unarchive Schedule' : 'Archive Schedule',
              icon: <BoxArchiveIcon className="w-6 h-6 text-ods-text-secondary" />,
              disabled: mutating,
              onClick: () => setConfirmTarget(schedule),
            },
          ],
        },
      ];

      return <ActionsMenuDropdown groups={groups} />;
    },
    [archived, isArchiving, isUnarchiving],
  );

  // Archiving/unarchiving changes the list's MEMBERSHIP, so the platform facet
  // may still offer values whose last schedule just left this scope. Re-fetch it
  // imperatively into the store (`fetchQuery(...).subscribe({})`); the list
  // itself is NOT refetched — `@deleteEdge` already updated it locally.
  const refreshFilterMeta = useCallback(() => {
    fetchQuery<ScheduleFiltersRefreshQueryType>(
      environment,
      scriptScheduleFiltersRefreshRelayQuery,
      { filter: backendFilters },
      { fetchPolicy: 'network-only' },
    ).subscribe({});
  }, [environment, backendFilters]);

  // Runs the archive/unarchive mutation for the schedule the confirm modal
  // targets. The `updater` invalidates the record so every OTHER cached
  // connection still holding its edge is marked stale and refetches on next
  // read — mirrors the scripts table's archive flow.
  const handleConfirmArchive = useCallback(() => {
    if (!confirmTarget) return;
    const { id, name } = confirmTarget;
    const connections = connectionId ? [connectionId] : [];
    const updater = (store: RecordSourceSelectorProxy) => store.get(id)?.invalidateRecord();
    const commit = archived ? commitUnarchive : commitArchive;
    commit({
      variables: { id, connections },
      updater,
      onCompleted: () => {
        toast(
          archived
            ? {
                title: 'Schedule unarchived',
                description: `"${name}" was moved back to Scripts Schedules.`,
                variant: 'success',
              }
            : {
                title: 'Schedule archived',
                description: `"${name}" was moved to Archived Schedules.`,
                variant: 'success',
              },
        );
        setConfirmTarget(null);
        refreshFilterMeta();
      },
      onError: error => {
        toast({
          title: 'Error',
          description: error.message || `Failed to ${archived ? 'unarchive' : 'archive'} schedule`,
          variant: 'destructive',
        });
        setConfirmTarget(null);
      },
    });
  }, [confirmTarget, connectionId, archived, commitArchive, commitUnarchive, toast, refreshFilterMeta]);

  const columns = useMemo<ColumnDef<UiScheduleEntry>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Script',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <div className="flex flex-col justify-center gap-1 min-w-0">
            <TruncateText>{row.original.name}</TruncateText>
            {row.original.description && (
              <TruncateText variant="h6" tone="secondary">
                {row.original.description}
              </TruncateText>
            )}
          </div>
        ),
        enableSorting: false,
        meta: { width: 'flex-1 min-w-0' },
      },
      {
        accessorKey: 'supportedPlatforms',
        header: 'OS',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <OSTypeBadgeGroup osTypes={row.original.supportedPlatforms} iconSize="w-4 h-4 md:w-6 md:h-6" />
        ),
        enableSorting: false,
        filterFn: multiSelectFilterFn,
        meta: {
          width: 'w-[90px]',
          hideAt: 'lg',
          filter: { options: platformOptions },
        },
      },
      {
        id: 'dateTime',
        header: 'Date & Time',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => {
          const { date, time } = formatScheduleStartAt(row.original.startAt);
          if (!row.original.startAt) {
            return <span className="text-h4 text-ods-text-secondary">—</span>;
          }
          return (
            <div className="flex flex-col justify-center gap-1 min-w-0">
              <TruncateText>{date}</TruncateText>
              <TruncateText variant="h6" tone="secondary">
                {time}
              </TruncateText>
            </div>
          );
        },
        enableSorting: false,
        meta: { width: 'w-[100px] md:w-[160px]', hideAt: 'md' },
      },
      {
        id: 'repeat',
        header: 'Repeat',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <span className="text-h4 text-ods-text-primary">{repeatToLabel(row.original.repeat)}</span>
        ),
        enableSorting: false,
        meta: { width: 'w-[120px]', hideAt: 'md', sortable: true },
      },
      {
        accessorKey: 'deviceCount',
        header: 'Devices',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <span className="text-h4 text-ods-text-primary">{row.original.deviceCount}</span>
        ),
        enableSorting: false,
        meta: { width: 'w-[100px] md:w-[140px]', hideAt: 'lg', sortable: true },
      },
      {
        id: 'actions',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <div data-no-row-click className="flex gap-2 items-center justify-end pointer-events-auto">
            {renderRowActions(row.original)}
          </div>
        ),
        enableSorting: false,
        meta: { width: 'w-12 shrink-0 flex-none', align: 'right' },
      },
      {
        id: 'open',
        cell: ({ row }: { row: Row<UiScheduleEntry> }) => (
          <div data-no-row-click className="flex items-center justify-end pointer-events-auto">
            <Button
              onClick={openInNewTab(routes.scriptsV2.schedules.details(row.original.id))}
              variant="outline"
              size="icon"
              leftIcon={<ArrowRightUpIcon className="w-5 h-5" />}
              aria-label="Open in new tab"
              className="bg-ods-card"
            />
          </div>
        ),
        enableSorting: false,
        meta: { width: 'w-12 shrink-0 flex-none', hideAt: 'md', align: 'right' },
      },
    ],
    [renderRowActions, platformOptions],
  );

  const filterGroups = useMemo(
    () => [{ id: 'supportedPlatforms', title: 'OS', options: platformOptions }],
    [platformOptions],
  );

  const columnFilters = useMemo(
    () =>
      Object.entries(tableFilters)
        .filter(([, value]) => value && value.length > 0)
        .map(([id, value]) => ({ id, value })),
    [tableFilters],
  );

  const handleColumnFiltersChange = useCallback(
    (updater: any) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      const nextFilters: Record<string, any[]> = {};
      for (const f of next) {
        nextFilters[f.id] = Array.isArray(f.value) ? f.value : [f.value];
      }
      onFilterChange(nextFilters);
    },
    [columnFilters, onFilterChange],
  );

  const table = useDataTable<UiScheduleEntry>({
    data: transformedSchedules,
    columns,
    getRowId: (row: UiScheduleEntry) => row.id,
    enableSorting: false,
    state: { columnFilters },
    onColumnFiltersChange: handleColumnFiltersChange,
  });

  const scheduleRowHref = useCallback(
    (schedule: UiScheduleEntry) => routes.scriptsV2.schedules.details(schedule.id),
    [],
  );

  const hasActiveFilters = Object.values(tableFilters).some(values => values.length > 0);
  const showEmptyState = !debouncedSearch && !hasActiveFilters && !isPending && transformedSchedules.length === 0;

  useEffect(() => {
    onEmptyChange(showEmptyState);
  }, [showEmptyState, onEmptyChange]);

  if (showEmptyState && archived) {
    return (
      <EmptyState
        icon={<BoxArchiveIcon />}
        title="No archived schedules"
        description="Schedules you archive will be moved here. They stay out of the main list but can be restored any time."
      />
    );
  }

  if (showEmptyState) {
    return (
      <EmptyState
        icon={<TimerIcon />}
        title="No scripts schedules yet"
        description="Scripts set to run automatically on a schedule (daily maintenance, weekly cleanups, monthly audits) will be displayed here."
        actions={[
          { icon: <HourglassClockIcon />, label: 'Run hourly, daily, weekly, or on custom cron' },
          { icon: <RadarIcon />, label: 'Target specific devices, Customers, or tags' },
          { icon: <ListBulletIcon />, label: 'View execution history and success rates' },
        ]}
        {...onboardingGuideButton('script-schedules', 'Learn more about Script Schedules')}
      />
    );
  }

  return (
    <>
      {/* Dim (don't unmount) the stale rows while a deferred refetch is in
          flight — the subtle fade is the pending feedback. */}
      <div className={`transition-opacity duration-200 ${isPending ? 'opacity-60' : ''}`}>
        <DataTable table={table}>
          <DataTable.Header
            stickyHeader
            stickyHeaderOffset={stickyHeaderOffset}
            rightSlot={<DataTable.RowCount />}
            sort={sortState}
            onSortChange={onSortChange}
          />
          <DataTable.Body
            skeletonRows={PAGE_SIZE}
            emptyMessage={
              debouncedSearch
                ? `No schedules found matching "${debouncedSearch}". Try adjusting your search.`
                : 'No schedules found. Try adjusting your filters or add a new schedule.'
            }
            rowClassName="mb-1"
            rowHref={scheduleRowHref}
          />
          <DataTable.InfiniteFooter
            hasNextPage={hasNext}
            isFetchingNextPage={isLoadingNext}
            onLoadMore={fetchNextPage}
            skeletonRows={2}
          />
        </DataTable>
      </div>

      <FilterModal
        isOpen={mobileFilterOpen}
        onClose={onMobileFilterClose}
        filterGroups={filterGroups}
        onFilterChange={onFilterChange}
        currentFilters={tableFilters}
      />

      {archived ? (
        <RestoreScheduleModal
          open={confirmTarget !== null}
          onOpenChange={open => !open && setConfirmTarget(null)}
          onConfirm={handleConfirmArchive}
          isPending={isUnarchiving}
        />
      ) : (
        <ArchiveScheduleModal
          open={confirmTarget !== null}
          onOpenChange={open => !open && setConfirmTarget(null)}
          onConfirm={handleConfirmArchive}
          isPending={isArchiving}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------
// Loading skeleton
// ----------------------------------------------------------------

const EMPTY_ROWS: UiScheduleEntry[] = [];

function SchedulesTableSkeleton({ stickyHeaderOffset }: { stickyHeaderOffset: string }) {
  const columns = useMemo<ColumnDef<UiScheduleEntry>[]>(
    () => [
      { accessorKey: 'name', header: 'Script', enableSorting: false, meta: { width: 'flex-1 min-w-0' } },
      {
        accessorKey: 'supportedPlatforms',
        header: 'OS',
        enableSorting: false,
        meta: { width: 'w-[90px]', hideAt: 'lg' },
      },
      {
        id: 'dateTime',
        header: 'Date & Time',
        enableSorting: false,
        meta: { width: 'w-[100px] md:w-[160px]', hideAt: 'md' },
      },
      { id: 'repeat', header: 'Repeat', enableSorting: false, meta: { width: 'w-[120px]', hideAt: 'md' } },
      {
        accessorKey: 'deviceCount',
        header: 'Devices',
        enableSorting: false,
        meta: { width: 'w-[100px] md:w-[140px]', hideAt: 'lg' },
      },
      // Mirror the real table's trailing actions column so the loading header
      // reserves the same width and stays aligned.
      { id: 'actions', enableSorting: false, meta: { width: 'w-12 shrink-0 flex-none', align: 'right' } },
      { id: 'open', enableSorting: false, meta: { width: 'w-12 shrink-0 flex-none', hideAt: 'md', align: 'right' } },
    ],
    [],
  );

  const table = useDataTable<UiScheduleEntry>({
    data: EMPTY_ROWS,
    columns,
    getRowId: (row: UiScheduleEntry) => row.id,
    enableSorting: false,
  });

  return (
    <DataTable table={table}>
      <DataTable.Header stickyHeader stickyHeaderOffset={stickyHeaderOffset} />
      <DataTable.Body loading={true} skeletonRows={PAGE_SIZE} emptyMessage="" rowClassName="mb-1" />
    </DataTable>
  );
}

// ----------------------------------------------------------------
// Outer shell — layout + URL state + Suspense boundary
// ----------------------------------------------------------------

interface ScriptSchedulesTableProps {
  /** When true, lists archived schedules (status = ARCHIVED) with a back button instead of the header actions. */
  archived?: boolean;
}

export function ScriptSchedulesTable({ archived = false }: ScriptSchedulesTableProps = {}) {
  const router = useRouter();
  const handleBack = useSafeBack(routes.scriptsV2.schedules.list);

  const { params, setParam, setParams } = useApiParams({
    search: { type: 'string', default: '' },
    supportedPlatforms: { type: 'array', default: [] },
    // Server-side sort: column id (backend sort field: 'repeat' | 'deviceCount')
    // + direction. Empty sortBy = backend default order (newest-first by _id).
    sortBy: { type: 'string', default: '' },
    sortDir: { type: 'string', default: 'desc' },
  });

  // Local search input keeps typing responsive; the shared hook debounces it to
  // the URL param and guards the back/forward sync-down against clobbering typing.
  const {
    search: searchInput,
    setSearch: setSearchInput,
    debouncedSearch,
  } = useSearchParam(params.search, value => setParam('search', value), 300);

  const [isEmpty, setIsEmpty] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const { toolbarRef, containerStyle, stickyHeaderOffset } = useStickyToolbar();

  const backendFilters: ScriptScheduleFilterInput = useMemo(() => {
    const supportedPlatforms = platformsToEnums(params.supportedPlatforms);
    // Default scriptSchedules() (null statuses) returns ACTIVE + ARCHIVED
    // together; scope each page explicitly so the archive lives on its own list.
    return {
      statuses: [archived ? ScriptStatus.ARCHIVED : ScriptStatus.ACTIVE],
      ...(supportedPlatforms.length > 0 && { supportedPlatforms }),
    };
  }, [archived, params.supportedPlatforms]);

  // Backend SortInput for the query; null = no sort (backend default order).
  const sortInput = useMemo<SortInput | null>(
    () => (params.sortBy ? { field: params.sortBy, direction: params.sortDir === 'asc' ? 'ASC' : 'DESC' } : null),
    [params.sortBy, params.sortDir],
  );

  // Live descriptor the header renders its indicator from (flips instantly on click).
  const sortState = useMemo<DataTableSortState | null>(
    () => (params.sortBy ? { id: params.sortBy, desc: params.sortDir !== 'asc' } : null),
    [params.sortBy, params.sortDir],
  );

  // Filter + sort travel together as one deferred object so the query lags in
  // lockstep and `isPending` covers both; the LIVE params keep driving the
  // controls (checkboxes, header indicator) so they respond instantly.
  const queryVars = useMemo(() => ({ filter: backendFilters, sort: sortInput }), [backendFilters, sortInput]);
  const { deferredFilters: deferredVars, deferredSearch, isPending } = useDeferredQuery(queryVars, debouncedSearch);

  const tableFilters = useMemo(() => ({ supportedPlatforms: params.supportedPlatforms }), [params.supportedPlatforms]);

  const handleFilterChange = useCallback(
    (columnFilters: Record<string, any[]>) => {
      setParams({ supportedPlatforms: columnFilters.supportedPlatforms || [] });
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' });
    },
    [setParams],
  );

  // 3-state toggle owned by the consumer (per DataTable.Header contract):
  // unsorted → desc → asc → unsorted. `columnId` is the column's id, which
  // equals the backend sort field ('repeat' | 'deviceCount').
  const handleSortChange = useCallback(
    (columnId: string) => {
      if (params.sortBy !== columnId) {
        setParams({ sortBy: columnId, sortDir: 'desc' });
      } else if (params.sortDir === 'desc') {
        setParams({ sortDir: 'asc' });
      } else {
        setParams({ sortBy: '', sortDir: 'desc' });
      }
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' });
    },
    [params.sortBy, params.sortDir, setParams],
  );

  const handleOpenArchive = useCallback(() => {
    router.push(routes.scriptsV2.schedules.archived);
  }, [router]);

  const handleNewSchedule = useCallback(() => {
    router.push(routes.scriptsV2.schedules.new);
  }, [router]);

  // Archived list has no header actions (back button only); the active list
  // shows Archive (→ archived page) + Add Schedule.
  const actions = useMemo(
    () =>
      archived
        ? []
        : [
            {
              label: 'Archive',
              variant: 'outline' as const,
              icon: <BoxArchiveIcon className="w-6 h-6 text-ods-text-secondary" />,
              onClick: handleOpenArchive,
            },
            {
              label: 'Add Schedule',
              variant: (isEmpty ? 'accent' : 'outline') as 'accent' | 'outline',
              icon: (
                <PlusCircleIcon size={24} className={isEmpty ? 'text-ods-text-on-accent' : 'text-ods-text-secondary'} />
              ),
              onClick: handleNewSchedule,
            },
          ],
    [archived, handleOpenArchive, handleNewSchedule, isEmpty],
  );

  const mobileFilterButton = (
    <Button
      variant="outline"
      size="icon"
      className="md:hidden"
      onClick={() => setMobileFilterOpen(true)}
      aria-label="Open filters"
      leftIcon={<Filter02Icon />}
    />
  );

  return (
    <PageLayout
      title={archived ? 'Archived Schedules' : 'Scripts Schedules'}
      backButton={archived ? { label: 'Back', onClick: handleBack } : undefined}
      actions={actions.length > 0 ? actions : undefined}
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
    >
      <div className="flex flex-col" style={containerStyle}>
        {!isEmpty && (
          <div
            ref={toolbarRef}
            className="sticky top-0 z-20 flex gap-[var(--spacing-system-m)] items-center bg-ods-bg -mx-[var(--spacing-system-l)] p-[var(--spacing-system-l)] -mt-[var(--spacing-system-l)]"
          >
            <Input
              placeholder="Search for Schedule"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="flex-1"
              startAdornment={<SearchIcon className="w-4 h-4 md:w-6 md:h-6" />}
            />
            {mobileFilterButton}
          </div>
        )}

        <Suspense fallback={<SchedulesTableSkeleton stickyHeaderOffset={stickyHeaderOffset} />}>
          <SchedulesTableContent
            backendFilters={deferredVars.filter}
            debouncedSearch={deferredSearch}
            sort={deferredVars.sort}
            tableFilters={tableFilters}
            sortState={sortState}
            onSortChange={handleSortChange}
            isPending={isPending}
            onFilterChange={handleFilterChange}
            onEmptyChange={setIsEmpty}
            mobileFilterOpen={mobileFilterOpen}
            onMobileFilterClose={() => setMobileFilterOpen(false)}
            stickyHeaderOffset={stickyHeaderOffset}
            archived={archived}
          />
        </Suspense>
      </div>
    </PageLayout>
  );
}
