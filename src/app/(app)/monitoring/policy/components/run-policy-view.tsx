'use client';

import {
  Button,
  CardLoader,
  LoadError,
  NotFoundError,
  type PageActionButton,
  PageLayout,
  type PanelRow,
  StackedRowsPanel,
} from '@flamingo-stack/openframe-frontend-core';
import { PlayIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { useCallback, useMemo, useState } from 'react';
import { DeviceSelector } from '@/app/components/shared/device-selector';
import { useSafeBack } from '@/app/hooks/use-safe-back';
import { routes } from '@/lib/routes';
import type { Device } from '../../../devices/types/device.types';
import { getFleetHostId } from '../../../devices/utils/device-action-utils';
import { ScriptEditor } from '../../../scripts/components/script/script-editor';
import { useLiveCampaign } from '../../hooks/use-live-campaign';
import { usePolicyDetails } from '../hooks/use-policy-details';
import { usePolicyDevices } from '../hooks/use-policy-devices';
import { usePolicyResponseHosts } from '../hooks/use-policy-response-hosts';
import { PolicyRunResultsPanel } from './policy-run-results-panel';

interface RunPolicyViewProps {
  policyId: string;
}

const getDeviceKey = (d: Device) => {
  const id = getFleetHostId(d);
  return id !== undefined ? String(id) : undefined;
};

export function RunPolicyView({ policyId }: RunPolicyViewProps) {
  const numericId = parseInt(policyId, 10);
  const isValidId = !Number.isNaN(numericId);

  const { policyDetails, isLoading, error } = usePolicyDetails(isValidId ? numericId : null);
  const { devices, isLoading: isLoadingDevices } = usePolicyDevices();
  const { hosts: failingHosts, isLoading: isLoadingFailing } = usePolicyResponseHosts(
    isValidId ? numericId : null,
    'failing',
  );

  const campaign = useLiveCampaign();
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleBack = useSafeBack(
    isValidId ? routes.monitoring.policy(numericId) : routes.monitoring.root({ tab: 'policies' }),
  );

  // "Failing only" preset — retarget the run at the hosts currently failing this
  // policy. Limited to hosts that exist in the selector list (Fleet-connected).
  const failingSelectableIds = useMemo(() => {
    const available = new Set(devices.map(getDeviceKey).filter((k): k is string => k !== undefined));
    return failingHosts.map(h => String(h.id)).filter(id => available.has(id));
  }, [devices, failingHosts]);

  const handleSelectFailingOnly = useCallback(() => {
    setSelectedIds(new Set(failingSelectableIds));
  }, [failingSelectableIds]);

  const selectedHostIds = useMemo(
    () =>
      Array.from(selectedIds)
        .map(Number)
        .filter(n => !Number.isNaN(n)),
    [selectedIds],
  );

  const handleRun = useCallback(() => {
    if (!policyDetails?.query || selectedHostIds.length === 0) return;
    setShowResultsPanel(true);
    campaign.startCampaign(policyDetails.query, selectedHostIds);
  }, [campaign, policyDetails?.query, selectedHostIds]);

  const handleClosePanel = useCallback(() => {
    campaign.stopCampaign();
    setShowResultsPanel(false);
  }, [campaign]);

  const actions = useMemo<PageActionButton[]>(
    () => [
      {
        label: 'Run Policy',
        icon: <PlayIcon size={24} />,
        variant: 'accent',
        onClick: handleRun,
        disabled: !policyDetails?.query || selectedHostIds.length === 0 || campaign.isRunning,
      },
    ],
    [handleRun, policyDetails?.query, selectedHostIds.length, campaign.isRunning],
  );

  if (isLoading) {
    return <CardLoader items={3} />;
  }

  if (error) {
    return <LoadError message={`Error loading policy: ${error}`} />;
  }

  if (!policyDetails) {
    return <NotFoundError message="Policy not found" />;
  }

  const policyInfoRows: PanelRow[] = [
    {
      id: 'policy',
      columns: [{ key: 'policy', value: policyDetails.name, label: 'Policy' }],
    },
    ...(policyDetails.description
      ? [
          {
            id: 'description',
            columns: [{ key: 'description', value: policyDetails.description, label: 'Description' }],
          },
        ]
      : []),
    {
      id: 'severity',
      columns: [{ key: 'severity', value: policyDetails.critical ? 'Critical' : 'Low', label: 'Severity' }],
    },
  ];

  return (
    <PageLayout
      title="Run Policy"
      backButton={{
        label: 'Back',
        onClick: handleBack,
      }}
      actions={actions}
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
    >
      <div className="space-y-6 md:space-y-8">
        {showResultsPanel && (
          <PolicyRunResultsPanel
            isRunning={campaign.isRunning}
            startedAt={campaign.startedAt}
            results={campaign.results}
            errors={campaign.errors}
            emptyResults={campaign.emptyResults}
            totals={campaign.totals}
            hostsResponded={campaign.hostsResponded}
            hostsFailed={campaign.hostsFailed}
            campaignStatus={campaign.campaignStatus}
            onRunAgain={handleRun}
            onStop={campaign.stopCampaign}
            onClose={handleClosePanel}
          />
        )}

        <StackedRowsPanel rows={policyInfoRows} />

        {policyDetails.query && (
          <div>
            <h3 className="text-h5 text-ods-text-secondary">QUERY</h3>
            <ScriptEditor value={policyDetails.query} shell="sql" readOnly height="300px" />
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-[var(--spacing-system-m)]">
            <h2 className="text-h2 text-ods-text-primary">Devices</h2>
            <Button
              variant="outline"
              onClick={handleSelectFailingOnly}
              disabled={isLoadingFailing || isLoadingDevices || failingSelectableIds.length === 0}
            >
              {`Select Failing Only (${failingSelectableIds.length})`}
            </Button>
          </div>
          <DeviceSelector
            devices={devices}
            loading={isLoadingDevices}
            selectedIds={selectedIds}
            getDeviceKey={getDeviceKey}
            onSelectionChange={setSelectedIds}
            disabled={campaign.isRunning}
            addAllBehavior="merge"
            isDeviceDisabled={d => (getFleetHostId(d) === undefined ? 'Fleet agent is\nnot installed' : undefined)}
          />
        </div>
      </div>
    </PageLayout>
  );
}
