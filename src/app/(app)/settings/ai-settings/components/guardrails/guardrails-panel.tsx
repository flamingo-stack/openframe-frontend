'use client';

import { LoadError, NoData, Skeleton } from '@flamingo-stack/openframe-frontend-core';
import { ShieldCheckIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { EmptyState } from '@/app/components/shared/empty-state';
import { GuardrailsPolicyGroups } from './guardrails-policy-groups';
import { GuardrailsPresetCard } from './guardrails-preset-card';
import { GuardrailsTemplatePicker } from './guardrails-template-picker';
import type { GuardrailsEditor } from './use-guardrails-editor';

interface GuardrailsPanelProps {
  editor: GuardrailsEditor;
  isEditMode: boolean;
}

/**
 * Tenant-level guardrails panel: read-only preset summary or the edit-mode
 * template picker, plus the grouped policy rules. Hosted by the AI Settings
 * guardrails tab. The customer details page composes the same building blocks
 * (GuardrailsPresetCard, GuardrailsPolicyGroups) over the per-organization
 * GraphQL data instead — see `customer-guardrails-tab.tsx`.
 */
export function GuardrailsPanel({ editor, isEditMode }: GuardrailsPanelProps) {
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
        <GuardrailsPresetCard label={editor.activePresetLabel} />
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
        <GuardrailsPolicyGroups
          groups={editor.policyGroups}
          editMode={editor.canEditRules}
          onPolicyPermissionChange={editor.setPolicyPermission}
          onCategoryPermissionChange={editor.applyCategoryPermission}
        />
      )}
    </div>
  );
}
