'use client';

import {
  type ActionsMenuGroup,
  CardLoader,
  LoadError,
  NotFoundError,
  type PageActionButton,
  PageLayout,
  type PanelRow,
  StackedRowsPanel,
  Tag,
} from '@flamingo-stack/openframe-frontend-core';
import { PenEditIcon, PlayIcon, TrashIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSafeBack } from '@/app/hooks/use-safe-back';
import { routes } from '@/lib/routes';
import { CONTEXT_ENTITY_KIND } from '../../../mingo/context/context-types';
import { useTrackOpenView } from '../../../mingo/context/use-track-open-view';
import { ScriptEditor } from '../../../scripts/components/script/script-editor';
import { ConfirmDeleteMonitoringModal } from '../../components/confirm-delete-monitoring-modal';
import { LiveTestPanel } from '../../components/live-test-panel';
import { useLiveCampaign } from '../../hooks/use-live-campaign';
import { usePolicies } from '../../hooks/use-policies';
import type { Policy } from '../../types/policies.types';
import { getPolicyStatus, POLICY_STATUS_CONFIG } from '../../utils/compute-policy-summary';
import { usePolicyDetails } from '../hooks/use-policy-details';
import { PolicyDevicesTable } from './policy-devices-table';

function PolicyStatusTag({ policy }: { policy: Policy }) {
  const config = POLICY_STATUS_CONFIG[getPolicyStatus(policy)];
  return <Tag label={config.label} variant={config.variant} />;
}

interface PolicyDetailsViewProps {
  policyId: string;
}

export function PolicyDetailsView({ policyId }: PolicyDetailsViewProps) {
  const router = useRouter();
  const numericId = parseInt(policyId, 10);
  const isValidId = !isNaN(numericId);

  const { policyDetails, isLoading, error } = usePolicyDetails(isValidId ? numericId : null);
  const { deletePolicy, isDeleting } = usePolicies();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const campaign = useLiveCampaign();
  const [showTestPanel, setShowTestPanel] = useState(false);

  // Register this policy as the Mingo "open view" (passive context) so the agent
  // gets the user's working context on the next message; cleared → recent views.
  useTrackOpenView(
    policyDetails ? { type: CONTEXT_ENTITY_KIND.POLICY, id: policyId, label: policyDetails.name } : null,
  );

  const handleBack = useSafeBack(routes.monitoring.root({ tab: 'policies' }));

  const handleEditPolicy = () => {
    router.push(routes.monitoring.policyEdit(policyId));
  };

  const handleDeletePolicy = () => {
    deletePolicy(numericId, {
      onSuccess: () => router.push(routes.monitoring.root({ tab: 'policies' })),
    });
  };

  if (isLoading) {
    return <CardLoader items={4} />;
  }

  if (error) {
    return <LoadError message={`Error loading policy: ${error}`} />;
  }

  if (!policyDetails) {
    return <NotFoundError message="Policy not found" />;
  }

  // Run the policy query as a regular live test query (same mechanism as the
  // Queries screen) against the policy's assigned hosts. Without assigned
  // devices the action is disabled, so the hook's all-hosts fallback is
  // intentionally unreachable from here.
  const hasAssignedDevices = (policyDetails?.hosts_include_any?.length ?? 0) > 0;

  const handleRunNow = async () => {
    const started = await campaign.startCampaign(
      policyDetails.query || '',
      policyDetails.hosts_include_any?.map(h => h.id) ?? [],
    );
    // Only surface the panel for an accepted campaign; failures already toast.
    if (started) {
      setShowTestPanel(true);
    }
  };

  const handleCloseTestPanel = () => {
    campaign.stopCampaign();
    setShowTestPanel(false);
  };

  // First applicable disable reason doubles as the button tooltip, so every
  // disabled state explains itself.
  const runNowDisabledReason = !policyDetails.query?.trim()
    ? 'This policy has no query to run'
    : campaign.isRunning
      ? 'A run is already in progress'
      : !hasAssignedDevices
        ? 'Assign at least one device to this policy to run it'
        : undefined;

  const actions: PageActionButton[] = [
    {
      label: 'Edit',
      icon: <PenEditIcon size={24} className="text-ods-text-secondary" />,
      variant: 'outline',
      onClick: handleEditPolicy,
    },
    {
      label: 'Run Now',
      icon: <PlayIcon size={24} />,
      variant: 'accent',
      onClick: handleRunNow,
      disabled: Boolean(runNowDisabledReason),
      tooltip: runNowDisabledReason,
    },
  ];

  const menuActions: ActionsMenuGroup[] = [
    {
      items: [
        {
          id: 'delete-policy',
          label: 'Delete Policy',
          icon: <TrashIcon />,
          onClick: () => setIsDeleteModalOpen(true),
          disabled: isDeleting,
        },
      ],
    },
  ];

  const severityColumn = { key: 'severity', value: policyDetails.critical ? 'Critical' : 'Low', label: 'Severity' };
  const statusColumn = { key: 'status', value: <PolicyStatusTag policy={policyDetails} />, label: 'Status' };
  const authorColumn = { key: 'author', value: policyDetails.author_name, label: 'Author' };

  // The meta fields render as one row on desktop and as two separate rows on
  // tablet/mobile. Each is a distinct PanelRow toggled by breakpoint so every
  // line keeps its own divider and padding (matching the Figma responsive specs).
  const policyInfoRows: PanelRow[] = [
    ...(policyDetails.description
      ? [
          {
            id: 'description',
            columns: [{ key: 'description', value: policyDetails.description, label: 'Description' }],
          },
        ]
      : []),
    // Desktop (lg+): Severity + Status + Author on a single row → 2 rows total.
    {
      id: 'meta-desktop',
      className: 'hidden lg:flex lg:border-b-0',
      columns: [severityColumn, statusColumn, authorColumn],
    },
    // Tablet & mobile (< lg): split into two rows — Severity + Status, then Author
    // on its own third row. The empty spacer keeps Author at the standard row height.
    {
      id: 'meta-severity-status',
      className: 'lg:hidden',
      columns: [severityColumn, statusColumn],
    },
    {
      id: 'meta-author',
      className: 'lg:hidden',
      columns: [authorColumn, { key: 'author-spacer' }],
    },
  ];

  return (
    <PageLayout
      title={policyDetails.name}
      backButton={{
        label: 'Back',
        onClick: handleBack,
      }}
      actions={actions}
      menuActions={menuActions}
      actionsVariant="menu-primary"
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
    >
      {/* Policy Testing */}
      {showTestPanel && (
        <div className="mb-[var(--spacing-system-lf)]">
          <LiveTestPanel
            mode="policy"
            isRunning={campaign.isRunning}
            startedAt={campaign.startedAt}
            results={campaign.results}
            errors={campaign.errors}
            emptyResults={campaign.emptyResults}
            totals={campaign.totals}
            hostsResponded={campaign.hostsResponded}
            hostsFailed={campaign.hostsFailed}
            campaignStatus={campaign.campaignStatus}
            onTestAgain={handleRunNow}
            onStop={campaign.stopCampaign}
            onClose={handleCloseTestPanel}
          />
        </div>
      )}

      {/* Policy Info */}
      <StackedRowsPanel rows={policyInfoRows} />

      {/* Query */}
      {policyDetails.query && (
        <div className="mt-6">
          <div className="">
            <h3 className="text-h5 text-ods-text-secondary">QUERY</h3>
          </div>
          <ScriptEditor value={policyDetails.query} shell="sql" readOnly height="300px" />
        </div>
      )}

      {/* Policy Devices */}
      <div className="mt-6">
        <h1 className="text-h2 text-ods-text-primary pt-6">Devices</h1>
        <div className="pt-4">
          <PolicyDevicesTable
            policyId={numericId}
            assignedHostIds={policyDetails.hosts_include_any}
            policyQuery={policyDetails.query}
          />
        </div>
      </div>
      <ConfirmDeleteMonitoringModal
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        itemName={policyDetails.name}
        itemType="policy"
        onConfirm={handleDeletePolicy}
      />
    </PageLayout>
  );
}
