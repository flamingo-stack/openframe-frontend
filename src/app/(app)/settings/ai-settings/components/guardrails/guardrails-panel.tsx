'use client';

import { LoadError, NoData, Skeleton } from '@flamingo-stack/openframe-frontend-core';
import { PolicyConfigurationPanel } from '@flamingo-stack/openframe-frontend-core/components/features';
import { ShieldCheckIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { EmptyState } from '@/app/components/shared/empty-state';
import { InfoCell } from '@/app/components/shared/info-cell';
import { GuardrailsTemplatePicker } from './guardrails-template-picker';
import type { GuardrailsEditor } from './use-guardrails-editor';

interface GuardrailsPanelProps {
  editor: GuardrailsEditor;
  isEditMode: boolean;
  /**
   * Renders the preset value muted — the shown policies are tenant-wide
   * defaults inherited by the current scope (customer details usage).
   */
  inheritedPreset?: boolean;
}

/**
 * Host-agnostic guardrails policy panel: read-only preset summary or the
 * edit-mode template picker, plus the grouped policy rules. Hosted by the AI
 * Settings guardrails tab today; designed to be mounted on the customer
 * details page once the backend supports per-organization policies (the org
 * scope enters via the data hooks, not here).
 */
export function GuardrailsPanel({ editor, isEditMode, inheritedPreset = false }: GuardrailsPanelProps) {
  if (editor.isLoading) {
    return (
      <div className="flex flex-col gap-[var(--spacing-system-sf)]">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (editor.loadError) {
    return (
      <LoadError
        message="Couldn't load guardrails policies. The service may be temporarily unavailable."
        onRetry={() => void editor.refetch()}
      />
    );
  }

  if (!editor.hasTemplates) {
    return (
      <EmptyState
        icon={<ShieldCheckIcon />}
        title="No policy templates available"
        description="Guardrails policy templates will appear here once the AI service provides them."
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      {isEditMode ? (
        <GuardrailsTemplatePicker
          options={editor.templateOptions}
          value={editor.selectedTemplateId}
          disabled={editor.isDetailLoading}
          onSelect={editor.selectTemplate}
          onCreateCustomPolicyFrom={editor.createCustomPolicyFrom}
        />
      ) : (
        <div className="bg-ods-card border border-ods-border rounded-md flex items-center px-[var(--spacing-system-mf)] min-h-20">
          <InfoCell
            value={
              inheritedPreset ? (
                <span className="text-ods-text-secondary">{editor.activePresetLabel}</span>
              ) : (
                editor.activePresetLabel
              )
            }
            label="Guardrails Preset"
          />
        </div>
      )}

      {editor.isDetailLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : editor.policyGroups.size === 0 ? (
        <NoData
          icon={<ShieldCheckIcon />}
          title="This policy template has no rules"
          className="py-[var(--spacing-system-xxl)]"
        />
      ) : (
        <div className="flex flex-col gap-[var(--spacing-system-l)]">
          {Array.from(editor.policyGroups.entries()).map(([policyGroupName, categories]) => (
            <div key={policyGroupName} className="flex flex-col gap-[var(--spacing-system-xxs)]">
              <p className="text-h5 text-ods-text-secondary truncate">{policyGroupName}</p>
              <PolicyConfigurationPanel
                categories={categories}
                editMode={editor.canEditRules}
                onPolicyPermissionChange={editor.setPolicyPermission}
                onCategoryPermissionChange={editor.applyCategoryPermission}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
