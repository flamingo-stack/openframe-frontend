'use client';

import { type DeviceType, getDeviceTypeIcon, type QueryResultRow } from '@flamingo-stack/openframe-frontend-core';
import { OSTypeBadge } from '@flamingo-stack/openframe-frontend-core/components/features';
import { ArrowRightUpIcon, PlayIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  Button,
  type ColumnDef,
  DataTable,
  EntityImage,
  QueryReportTable,
  type Row,
  Tag,
  TruncateText,
  useDataTable,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFullImageUrl } from '@/lib/image-url';
import { openInNewTab } from '@/lib/open-in-new-tab';
import { routes } from '@/lib/routes';
import { useLiveCampaign } from '../../hooks/use-live-campaign';
import { usePolicyDevicesTable } from '../hooks/use-policy-devices-table';
import type { PolicyDeviceRow } from '../types/policy-device-row';

interface PolicyDevicesTableProps {
  policyId: number;
  assignedHostIds?: Array<{ id: number; hostname: string }>;
  /** Policy osquery SQL — enables the per-device run inside expanded rows. */
  policyQuery?: string;
}

type DeviceRunOutcome = 'pass' | 'fail' | 'error' | 'no-response';

interface DeviceRunSnapshot {
  outcome: DeviceRunOutcome;
  rows: QueryResultRow[];
  errorMessage?: string;
}

const RUN_OUTCOME_TAG: Record<DeviceRunOutcome, { label: string; variant: 'success' | 'error' | 'warning' }> = {
  pass: { label: 'Pass', variant: 'success' },
  fail: { label: 'Fail', variant: 'error' },
  error: { label: 'Error', variant: 'warning' },
  'no-response': { label: 'No Response', variant: 'warning' },
};

function runOutcomeDetail(snapshot: DeviceRunSnapshot): string {
  switch (snapshot.outcome) {
    case 'pass':
      return `${snapshot.rows.length} ${snapshot.rows.length === 1 ? 'row' : 'rows'} returned — policy passes on this device`;
    case 'fail':
      return 'No rows returned — policy fails on this device';
    case 'error':
      return snapshot.errorMessage || 'Query failed on this device';
    case 'no-response':
      return 'Device did not respond before the run ended';
  }
}

export function PolicyDevicesTable({ policyId, assignedHostIds, policyQuery }: PolicyDevicesTableProps) {
  const { rows, isLoading } = usePolicyDevicesTable(policyId, assignedHostIds);

  const campaign = useLiveCampaign();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeHostId, setActiveHostId] = useState<number | null>(null);
  const [runsByHost, setRunsByHost] = useState<Map<number, DeviceRunSnapshot>>(new Map());

  const canRun = Boolean(policyQuery?.trim());

  const toggleExpanded = useCallback((rowId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  const handleRunOnDevice = useCallback(
    async (fleetHostId: number) => {
      if (!policyQuery?.trim() || campaign.isRunning) return;
      setActiveHostId(fleetHostId);
      const started = await campaign.startCampaign(policyQuery, [fleetHostId]);
      if (!started) {
        setActiveHostId(null);
      }
    },
    [campaign, policyQuery],
  );

  // When the single-device campaign finishes, freeze its outcome into a
  // per-host snapshot so each expanded row keeps its own last result even
  // after another device is run (the hook holds only one live campaign).
  useEffect(() => {
    if (campaign.isRunning || activeHostId === null || campaign.campaignStatus !== 'finished') return;

    let snapshot: DeviceRunSnapshot;
    if (campaign.errors.length > 0) {
      snapshot = { outcome: 'error', rows: [], errorMessage: campaign.errors[0].error };
    } else if (campaign.results.length > 0) {
      snapshot = { outcome: 'pass', rows: campaign.results };
    } else if (campaign.emptyResults.length > 0) {
      snapshot = { outcome: 'fail', rows: [] };
    } else {
      snapshot = { outcome: 'no-response', rows: [] };
    }

    setRunsByHost(prev => new Map(prev).set(activeHostId, snapshot));
    setActiveHostId(null);
  }, [
    campaign.isRunning,
    campaign.campaignStatus,
    campaign.errors,
    campaign.results,
    campaign.emptyResults,
    activeHostId,
  ]);

  const columns = useMemo<ColumnDef<PolicyDeviceRow>[]>(
    () => [
      {
        id: 'expand',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) => (
          <div data-no-row-click className="flex items-center pointer-events-auto">
            <Button
              onClick={() => toggleExpanded(String(row.original.id))}
              variant="outline"
              size="icon"
              leftIcon={
                expandedIds.has(String(row.original.id)) ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )
              }
              aria-label={expandedIds.has(String(row.original.id)) ? 'Collapse device row' : 'Expand device row'}
              className="bg-ods-card"
            />
          </div>
        ),
        enableSorting: false,
        meta: { width: 'w-12 shrink-0 flex-none' },
      },
      {
        id: 'device',
        accessorKey: 'displayName',
        header: 'DEVICE',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) => {
          const r = row.original;
          return (
            <div className="box-border content-stretch flex gap-4 h-20 items-center justify-start py-0 relative shrink-0 w-full">
              <div className="flex h-8 w-8 items-center justify-center relative rounded-[6px] shrink-0 border border-ods-border">
                {r.deviceType &&
                  getDeviceTypeIcon(r.deviceType.toLowerCase() as DeviceType, {
                    className: 'w-5 h-5 text-ods-text-secondary',
                  })}
              </div>
              <div className="flex-1 min-w-0">
                <TruncateText>{r.displayName || r.hostname}</TruncateText>
              </div>
            </div>
          );
        },
        meta: { width: 'flex-1 md:w-1/3' },
      },
      {
        id: 'organization',
        accessorKey: 'organization',
        header: 'CUSTOMER',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) => {
          const r = row.original;
          const fullImageUrl = getFullImageUrl(r.organizationImageUrl, r.organizationImageHash);
          return (
            <div className="flex items-center gap-3">
              <EntityImage src={fullImageUrl} alt={r.organization || 'Customer'} className="size-12 md:size-12" />
              <div className="flex flex-col justify-center flex-1 min-w-0">
                <span className="text-h4 text-ods-text-primary break-words">{r.organization || ''}</span>
              </div>
            </div>
          );
        },
        meta: { width: 'w-1/6', hideAt: 'lg' as const },
      },
      {
        id: 'os',
        accessorKey: 'osType',
        header: 'OS',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) => (
          <div className="flex items-start gap-2 shrink-0">
            <OSTypeBadge osType={row.original.osType} />
          </div>
        ),
        meta: { width: 'w-[120px] md:w-1/6', hideAt: 'md' as const },
      },
      {
        id: 'compliance',
        accessorKey: 'complianceStatus',
        header: 'STATUS',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) => {
          const r = row.original;
          if (r.complianceStatus === 'pending') return <Tag label="Pending" variant="warning" />;
          return (
            <Tag
              label={r.complianceStatus === 'non-compliant' ? 'Non-Compliant' : 'Passing'}
              variant={r.complianceStatus === 'non-compliant' ? 'error' : 'success'}
            />
          );
        },
        meta: { width: 'w-[140px]' },
      },
      {
        id: 'open',
        cell: ({ row }: { row: Row<PolicyDeviceRow> }) =>
          row.original.machineId ? (
            <div data-no-row-click className="flex items-center justify-end pointer-events-auto">
              <Button
                onClick={openInNewTab(routes.devices.details(row.original.machineId))}
                variant="outline"
                size="icon"
                leftIcon={<ArrowRightUpIcon className="w-5 h-5" />}
                aria-label="Open in new tab"
                className="bg-ods-card"
              />
            </div>
          ) : null,
        enableSorting: false,
        meta: { width: 'w-12 shrink-0 flex-none', hideAt: 'md', align: 'right' },
      },
    ],
    [expandedIds, toggleExpanded],
  );

  const table = useDataTable<PolicyDeviceRow>({
    data: rows,
    columns,
    getRowId: (row: PolicyDeviceRow) => String(row.id),
    enableSorting: false,
  });

  const policyDeviceRowHref = useCallback(
    (row: PolicyDeviceRow) => (row.machineId ? routes.devices.details(row.machineId) : undefined),
    [],
  );

  const renderSubRow = useCallback(
    (row: PolicyDeviceRow) => {
      if (!expandedIds.has(String(row.id))) return null;

      const fleetHostId = row.fleetHostId;
      const isThisRunning = campaign.isRunning && activeHostId === fleetHostId;
      const snapshot = runsByHost.get(fleetHostId);
      const tag = snapshot ? RUN_OUTCOME_TAG[snapshot.outcome] : null;

      return (
        <div
          data-no-row-click
          className="flex flex-col gap-[var(--spacing-system-s)] px-[var(--spacing-system-mf)] py-[var(--spacing-system-s)]"
        >
          <div className="flex flex-wrap items-center gap-[var(--spacing-system-m)]">
            <Button
              variant="outline"
              size="small-legacy"
              leftIcon={<PlayIcon size={16} />}
              onClick={() => handleRunOnDevice(fleetHostId)}
              disabled={!canRun || campaign.isRunning}
            >
              {isThisRunning ? 'Running...' : 'Run on This Device'}
            </Button>
            {isThisRunning && (
              <span className="text-h6 text-ods-text-secondary">Waiting for the device to respond...</span>
            )}
            {!isThisRunning && snapshot && tag && (
              <>
                <Tag label={tag.label} variant={tag.variant} />
                <span className="text-h6 text-ods-text-secondary">{runOutcomeDetail(snapshot)}</span>
              </>
            )}
            {!isThisRunning && !snapshot && canRun && (
              <span className="text-h6 text-ods-text-secondary">
                Run the policy query on this device to see its live result.
              </span>
            )}
            {!canRun && <span className="text-h6 text-ods-text-secondary">This policy has no query to run.</span>}
          </div>

          {!isThisRunning && snapshot?.outcome === 'pass' && snapshot.rows.length > 0 && (
            <QueryReportTable
              title=""
              data={snapshot.rows}
              loading={false}
              skeletonRows={1}
              emptyMessage="No rows returned"
              showExport={false}
              variant="default"
            />
          )}
        </div>
      );
    },
    [expandedIds, campaign.isRunning, activeHostId, runsByHost, canRun, handleRunOnDevice],
  );

  return (
    <DataTable table={table}>
      <DataTable.Header rightSlot={<DataTable.RowCount />} />
      <DataTable.Body
        loading={isLoading}
        skeletonRows={5}
        emptyMessage="No devices found for this policy"
        rowHref={policyDeviceRowHref}
        renderSubRow={renderSubRow}
      />
    </DataTable>
  );
}
