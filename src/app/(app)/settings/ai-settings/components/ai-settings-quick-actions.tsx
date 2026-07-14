'use client';

import { InfoCircleIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  type ColumnDef,
  DataTable,
  type Row,
  StackedRowsPanel,
  TruncateText,
  useDataTable,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import { useMemo } from 'react';
import type { AiQuickAction } from '../types/ai-settings';

/** Per-tab wording for the quick-actions blocks (Mingo vs the customer assistant). */
export interface QuickActionsAgentConfig {
  /** Woven into the list header: "OpenFrame {agentLabel} Quick Actions". */
  agentLabel: string;
  /** Core-lib agent slug (checkbox ids; will drive glyph accents once icons ship). */
  agentSlug: string;
}

export const MINGO_QUICK_ACTIONS_CONFIG: QuickActionsAgentConfig = { agentLabel: 'Mingo', agentSlug: 'mingo' };
export const ASSISTANT_QUICK_ACTIONS_CONFIG: QuickActionsAgentConfig = { agentLabel: 'AI Assistant', agentSlug: 'fae' };

/**
 * Info banner above the list: whose actions are in effect (view mode).
 * A single-row lib StackedRowsPanel; `leadingIcon` centers the 24px glyph
 * against both text lines per the mock (matches the lib's InfoBanner story).
 */
export function QuickActionsSourceBanner({ isDefault }: { isDefault: boolean }) {
  return (
    <StackedRowsPanel
      rows={[
        {
          id: 'source',
          className: 'p-[var(--spacing-system-s)]',
          columns: [
            {
              key: 'source',
              leadingIcon: <InfoCircleIcon className="size-6 text-ods-text-secondary" />,
              value: isDefault ? 'Using OpenFrame default actions' : 'Using your custom actions',
              label: isDefault
                ? 'These quick actions are curated and approved by OpenFrame.'
                : 'These quick actions were configured by your organization.',
            },
          ],
        },
      ]}
    />
  );
}

/** View-mode section: heading + source banner + read-only list. */
export function AiSettingsQuickActionsSection({
  title,
  actions,
  isDefault,
  agentConfig,
}: {
  title: string;
  actions: AiQuickAction[];
  isDefault: boolean;
  agentConfig: QuickActionsAgentConfig;
}) {
  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      <span className="text-h2 text-ods-text-primary">{title}</span>
      <QuickActionsSourceBanner isDefault={isDefault} />
      <AiSettingsQuickActions actions={actions} isDefault={isDefault} agentConfig={agentConfig} />
    </div>
  );
}

interface AiSettingsQuickActionsProps {
  actions: AiQuickAction[];
  /** True → OpenFrame (Product Hub) defaults; false → the organization's customs. */
  isDefault: boolean;
  agentConfig: QuickActionsAgentConfig;
  className?: string;
}

/**
 * Read-only Quick Actions list (view mode, and the dimmed preview in edit
 * mode). Single-column `DataTable`: the column header carries the source label
 * ("OpenFrame Mingo Quick Actions" / "Organization ... "), the right slot the
 * row count, and each row a name + instructions (icon tiles ship with the
 * SVG-icons follow-up task).
 */
export function AiSettingsQuickActions({ actions, isDefault, agentConfig, className }: AiSettingsQuickActionsProps) {
  const columns = useMemo<ColumnDef<AiQuickAction>[]>(
    () => [
      {
        accessorKey: 'name',
        header: `${isDefault ? 'OpenFrame' : 'Organization'} ${agentConfig.agentLabel} Quick Actions`,
        cell: ({ row }: { row: Row<AiQuickAction> }) => (
          <div className="flex flex-col justify-center min-h-[60px]">
            <TruncateText>{row.original.name}</TruncateText>
            <TruncateText variant="h6" tone="secondary">
              {row.original.instructions}
            </TruncateText>
          </div>
        ),
      },
    ],
    [isDefault, agentConfig.agentLabel],
  );

  const table = useDataTable<AiQuickAction>({
    data: actions,
    columns,
    getRowId: (row: AiQuickAction) => row.id,
    enableSorting: false,
  });

  return (
    <div className={cn(className)}>
      <DataTable table={table}>
        <DataTable.Header rightSlot={<DataTable.RowCount />} />
        <DataTable.Body emptyMessage="No quick actions configured." rowClassName="mb-1" />
      </DataTable>
    </div>
  );
}
