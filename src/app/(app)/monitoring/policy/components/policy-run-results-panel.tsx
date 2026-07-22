'use client';

import type { QueryResultRow } from '@flamingo-stack/openframe-frontend-core';
import {
  Button,
  type ColumnDef,
  DataTable,
  QueryReportTable,
  type Row,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  useDataTable,
} from '@flamingo-stack/openframe-frontend-core';
import { Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatTimeWithSeconds } from '@/lib/format-date';
import type { CampaignEmptyResult, CampaignError, CampaignTotals } from '../../hooks/use-live-campaign';

export interface PolicyRunResultsPanelProps {
  isRunning: boolean;
  startedAt: Date | null;
  results: QueryResultRow[];
  errors: CampaignError[];
  emptyResults: CampaignEmptyResult[];
  totals: CampaignTotals | null;
  hostsResponded: number;
  hostsFailed: number;
  campaignStatus: '' | 'pending' | 'finished';
  onRunAgain: () => void;
  onStop: () => void;
  onClose: () => void;
}

type PolicyRunOutcome = 'pass' | 'fail' | 'error';

interface PolicyRunDeviceRow {
  id: string;
  host: string;
  outcome: PolicyRunOutcome;
  detail: string;
}

const OUTCOME_TAG: Record<PolicyRunOutcome, { label: string; variant: 'success' | 'error' | 'warning' }> = {
  pass: { label: 'Pass', variant: 'success' },
  fail: { label: 'Fail', variant: 'error' },
  error: { label: 'Error', variant: 'warning' },
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Per-device pass/fail breakdown of a policy live run. Osquery policy
 * semantics: a host passes when the query returns at least one row, fails
 * when it returns none; hosts that error out are reported separately.
 */
export function PolicyRunResultsPanel({
  isRunning,
  startedAt,
  results,
  errors,
  emptyResults,
  totals,
  hostsResponded,
  hostsFailed,
  campaignStatus,
  onRunAgain,
  onStop,
  onClose,
}: PolicyRunResultsPanelProps) {
  const isFinished = campaignStatus === 'finished';
  const totalOnlineHosts = totals?.online ?? 0;
  const totalResponded = hostsResponded + hostsFailed;
  const missingHosts = isFinished && totalOnlineHosts > totalResponded ? totalOnlineHosts - totalResponded : 0;

  const [durationMs, setDurationMs] = useState(0);
  useEffect(() => {
    if (!startedAt || !isRunning) {
      if (startedAt && !isRunning) {
        setDurationMs(Date.now() - startedAt.getTime());
      }
      return;
    }
    setDurationMs(Date.now() - startedAt.getTime());
    const interval = setInterval(() => {
      setDurationMs(Date.now() - startedAt.getTime());
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isRunning]);

  const deviceRows = useMemo<PolicyRunDeviceRow[]>(() => {
    const rowCountByHost = new Map<string, number>();
    for (const row of results) {
      const host = String(row.host_display_name ?? 'Unknown');
      rowCountByHost.set(host, (rowCountByHost.get(host) ?? 0) + 1);
    }

    const rows: PolicyRunDeviceRow[] = [];
    for (const [host, count] of rowCountByHost) {
      rows.push({
        id: `pass-${host}`,
        host,
        outcome: 'pass',
        detail: `${count} ${count === 1 ? 'row' : 'rows'} returned`,
      });
    }
    for (const item of emptyResults) {
      rows.push({
        id: `fail-${item.host_id}`,
        host: item.host_display_name,
        outcome: 'fail',
        detail: 'No rows returned',
      });
    }
    for (const err of errors) {
      rows.push({
        id: `error-${err.host_id}`,
        host: err.host_display_name,
        outcome: 'error',
        detail: err.error,
      });
    }

    const outcomeOrder: Record<PolicyRunOutcome, number> = { fail: 0, error: 1, pass: 2 };
    rows.sort((a, b) => {
      if (a.outcome !== b.outcome) return outcomeOrder[a.outcome] - outcomeOrder[b.outcome];
      return a.host.localeCompare(b.host);
    });
    return rows;
  }, [results, emptyResults, errors]);

  const passedCount = deviceRows.filter(r => r.outcome === 'pass').length;

  const columns = useMemo<ColumnDef<PolicyRunDeviceRow>[]>(
    () => [
      {
        id: 'device',
        accessorKey: 'host',
        header: 'DEVICE',
        cell: ({ row }: { row: Row<PolicyRunDeviceRow> }) => (
          <span className="text-h4 text-ods-text-primary break-words">{row.original.host}</span>
        ),
        meta: { width: 'flex-1' },
      },
      {
        id: 'result',
        accessorKey: 'outcome',
        header: 'RESULT',
        cell: ({ row }: { row: Row<PolicyRunDeviceRow> }) => {
          const tag = OUTCOME_TAG[row.original.outcome];
          return <Tag label={tag.label} variant={tag.variant} />;
        },
        meta: { width: 'w-[120px]' },
      },
      {
        id: 'detail',
        accessorKey: 'detail',
        header: 'DETAILS',
        cell: ({ row }: { row: Row<PolicyRunDeviceRow> }) => (
          <span className="text-h6 text-ods-text-secondary break-words">{row.original.detail}</span>
        ),
        meta: { width: 'w-1/3', hideAt: 'md' as const },
      },
    ],
    [],
  );

  const table = useDataTable<PolicyRunDeviceRow>({
    data: deviceRows,
    columns,
    getRowId: (row: PolicyRunDeviceRow) => row.id,
    enableSorting: false,
  });

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-h5 text-ods-text-secondary">POLICY RUN</h3>

      <div className="bg-ods-card border border-ods-border rounded-[6px] max-h-[600px] overflow-clip flex flex-col">
        {/* Header row */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-ods-border shrink-0">
          <div className="flex flex-[1_0_0] flex-col">
            <span className="text-h4 text-ods-text-primary">
              {startedAt ? formatTimeWithSeconds(startedAt) : '--:--:--'}
            </span>
            <span className="text-h6 text-ods-text-secondary">Started</span>
          </div>

          <div className="flex flex-[1_0_0] flex-col">
            <span className="text-h4 text-ods-text-primary">{formatDuration(durationMs)}</span>
            <span className="text-h6 text-ods-text-secondary">Duration</span>
          </div>

          {totalOnlineHosts > 0 && (
            <div className="flex flex-[1_0_0] flex-col">
              <span className="text-h4 text-ods-text-primary">
                {totalResponded}/{totalOnlineHosts}
              </span>
              <span className="text-h6 text-ods-text-secondary">Devices Responded</span>
            </div>
          )}

          <div className="flex flex-[1_0_0] flex-col">
            <span className="text-h4">
              <span className="text-ods-success">{passedCount} Pass</span>
              <span className="text-ods-text-secondary"> / </span>
              <span className="text-ods-error">{emptyResults.length} Fail</span>
              {errors.length > 0 && <span className="text-ods-warning"> / {errors.length} Err</span>}
            </span>
            <span className="text-h6 text-ods-text-secondary">Outcome</span>
          </div>

          <div className="flex flex-[1_0_0] items-center gap-4 justify-end">
            {!isRunning && (
              <Button variant="outline" size="small-legacy" className="h-11 md:h-12" onClick={onRunAgain}>
                Run Again
              </Button>
            )}
            {isRunning && (
              <Button
                variant="outline"
                size="small-legacy"
                className="h-11 md:h-12"
                leftIcon={<Square size={14} />}
                onClick={onStop}
              >
                Stop
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              leftIcon={<X size={24} />}
              aria-label="Close run results panel"
            />
          </div>
        </div>

        {/* Partial-result note for large fleets: the run ended (finished or
            timed out) before every online host reported back. */}
        {missingHosts > 0 && (
          <div className="px-4 py-3 border-b border-ods-border shrink-0">
            <p className="text-h6 text-ods-warning">
              {missingHosts} online {missingHosts === 1 ? 'device' : 'devices'} did not respond before the run ended —
              results are partial.
            </p>
          </div>
        )}

        <Tabs defaultValue="devices" className="flex-1 overflow-auto flex flex-col">
          <TabsList className="px-4 pt-3 shrink-0">
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="raw">Raw Output</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="flex-1 overflow-auto">
            <DataTable table={table}>
              <DataTable.Header rightSlot={<DataTable.RowCount />} />
              <DataTable.Body
                loading={isRunning && deviceRows.length === 0}
                skeletonRows={4}
                emptyMessage={isRunning ? 'Waiting for results...' : 'No devices responded'}
              />
            </DataTable>
          </TabsContent>

          <TabsContent value="raw" className="flex-1 overflow-auto">
            <QueryReportTable
              title=""
              data={results}
              loading={isRunning && results.length === 0}
              skeletonRows={4}
              emptyMessage={isRunning ? 'Waiting for results...' : 'No rows returned'}
              columnOrder={['host_display_name']}
              exportFilename="policy-run-results"
              showExport={false}
              variant="default"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
