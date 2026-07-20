'use client';

import type { ApprovalLevel } from '@flamingo-stack/openframe-frontend-core';
import { Button, CheckboxBlock, LoadError, NoData, Skeleton } from '@flamingo-stack/openframe-frontend-core';
import { PenEditIcon, ShieldCheckIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { buildPolicyGroups } from '@/app/(app)/settings/ai-settings/components/guardrails/build-policy-groups';
import {
  CUSTOM_POLICY_DESCRIPTION,
  CUSTOM_POLICY_TYPE,
} from '@/app/(app)/settings/ai-settings/components/guardrails/guardrails.types';
import { GuardrailsPolicyGroups } from '@/app/(app)/settings/ai-settings/components/guardrails/guardrails-policy-groups';
import { GuardrailsPresetCard } from '@/app/(app)/settings/ai-settings/components/guardrails/guardrails-preset-card';
import {
  type GuardrailsTemplateOption,
  GuardrailsTemplatePicker,
} from '@/app/(app)/settings/ai-settings/components/guardrails/guardrails-template-picker';
import {
  applyEditsToRules,
  buildBaseLevels,
  withCategoryEdits,
  withPolicyEdit,
} from '@/app/(app)/settings/ai-settings/components/guardrails/rule-edits';
import {
  useGuardrailsTemplate,
  useGuardrailsTemplates,
} from '@/app/(app)/settings/ai-settings/components/guardrails/use-guardrails-policies';
import {
  useOrganizationGuardrails,
  useResetOrganizationGuardrails,
  useUpdateOrganizationGuardrails,
} from '@/app/(app)/settings/ai-settings/components/guardrails/use-organization-guardrails';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import { routes } from '@/lib/routes';

/** Imperative API the parent ("Save Customer") drives to persist this block. */
export interface CustomerGuardrailsHandle {
  /** Persists the per-org guardrails selection. No-op when inheriting or unchanged. */
  commit: () => Promise<void>;
}

interface CustomerGuardrailsSettingsProps {
  organizationId: string;
}

/** Radio value for the synthetic "Custom" option (the org has no server-side custom template). */
const ORG_CUSTOM_OPTION_ID = 'ORG_CUSTOM';

/**
 * What the user picked this session. `custom.edits` are approval-level
 * overrides diffed against the base TEMPLATE rules — exactly what
 * `updateOrganizationGuardrails` persists.
 */
type OrgGuardrailsSelection =
  | { kind: 'template'; templateId: string }
  | { kind: 'custom'; baseTemplateId: string; edits: Map<string, ApprovalLevel> };

/**
 * "Customer AI Guardrails" tab on the customer edit page. Mirrors the
 * AI-Assistant appearance block: no own Save button — the page's
 * "Save Customer" persists via the `commit()` ref handle. "Use the default
 * guardrails settings" ON means the org inherits the tenant defaults (an
 * existing org policy is reset immediately once the user confirms); OFF edits
 * the org's own policy: a stock preset as-is, or a custom set of per-operation
 * approval overrides on top of one.
 */
export const CustomerGuardrailsSettings = forwardRef<CustomerGuardrailsHandle, CustomerGuardrailsSettingsProps>(
  function CustomerGuardrailsSettings({ organizationId }, ref) {
    const router = useRouter();
    const { toast } = useToast();

    const { guardrails, isLoading: isGuardrailsLoading, error, refetch } = useOrganizationGuardrails(organizationId);
    const {
      templates,
      activeTemplateId,
      isLoading: isTemplatesLoading,
      error: templatesError,
      refetch: refetchTemplates,
    } = useGuardrailsTemplates();
    const { update } = useUpdateOrganizationGuardrails(organizationId);
    const { reset, isPending: isResetting } = useResetOrganizationGuardrails(organizationId);

    const [useDefault, setUseDefault] = useState(true);
    const [selection, setSelection] = useState<OrgGuardrailsSelection | null>(null);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);

    // Org guardrails are always materialized from a stock TEMPLATE — the
    // tenant's own custom policy is not a valid base.
    const stockTemplates = useMemo(() => templates.filter(t => t.type !== CUSTOM_POLICY_TYPE), [templates]);

    // Seed toggle + selection once both queries have loaded: an org with its
    // own policy starts on it (preset or custom), otherwise on the tenant's
    // active preset so unchecking the toggle has a sensible starting point.
    const seededRef = useRef(false);
    useEffect(() => {
      if (seededRef.current || isGuardrailsLoading || isTemplatesLoading || !guardrails || !stockTemplates.length) {
        return;
      }
      seededRef.current = true;

      setUseDefault(guardrails.inheritDefault);
      const fallbackId = (stockTemplates.find(t => t.id === activeTemplateId) ?? stockTemplates[0]).id;
      if (guardrails.inheritDefault) {
        setSelection({ kind: 'template', templateId: fallbackId });
      } else {
        const baseTemplateId = guardrails.sourceTemplate ?? fallbackId;
        setSelection(
          guardrails.overrides.length > 0
            ? {
                kind: 'custom',
                baseTemplateId,
                edits: new Map(guardrails.overrides.map(o => [o.naturalKey, o.approvalLevel])),
              }
            : { kind: 'template', templateId: baseTemplateId },
        );
      }
    }, [isGuardrailsLoading, isTemplatesLoading, guardrails, stockTemplates, activeTemplateId]);

    // Rules preview/editing always renders from the base TEMPLATE's rules
    // (react-query caches make preset switching instant).
    const displayTemplateId = selection
      ? selection.kind === 'template'
        ? selection.templateId
        : selection.baseTemplateId
      : null;
    const { template: displayTemplate, isLoading: isDetailLoading } = useGuardrailsTemplate(
      useDefault ? null : displayTemplateId,
    );

    const baseLevels = useMemo(() => buildBaseLevels(displayTemplate?.rules ?? []), [displayTemplate]);

    const editorGroups = useMemo(() => {
      const edits = selection?.kind === 'custom' ? selection.edits : null;
      return buildPolicyGroups(applyEditsToRules(displayTemplate?.rules ?? [], edits));
    }, [displayTemplate, selection]);

    // Inherited view (toggle ON): the org query already returns the effective
    // tenant rules while inheriting.
    const inheritedGroups = useMemo(() => buildPolicyGroups(guardrails?.rules ?? []), [guardrails]);

    const templateOptions = useMemo<GuardrailsTemplateOption[]>(
      () => [
        ...stockTemplates.map(t => ({
          id: t.id,
          label: t.displayName,
          description: t.description,
          isCustom: false,
        })),
        { id: ORG_CUSTOM_OPTION_ID, label: 'Custom', description: CUSTOM_POLICY_DESCRIPTION, isCustom: true },
      ],
      [stockTemplates],
    );

    const selectOption = useCallback((templateId: string) => {
      setSelection(prev => {
        if (templateId !== ORG_CUSTOM_OPTION_ID) return { kind: 'template', templateId };
        if (!prev || prev.kind === 'custom') return prev;
        return { kind: 'custom', baseTemplateId: prev.templateId, edits: new Map() };
      });
    }, []);

    const createCustomPolicyFrom = useCallback((baseTemplateId: string) => {
      setSelection({ kind: 'custom', baseTemplateId, edits: new Map() });
    }, []);

    const setPolicyPermission = useCallback(
      (_categoryId: string, policyId: string, level: ApprovalLevel) => {
        setSelection(prev => {
          if (prev?.kind !== 'custom') return prev;
          return { ...prev, edits: withPolicyEdit(prev.edits, baseLevels, policyId, level) };
        });
      },
      [baseLevels],
    );

    const allCategories = useMemo(() => Array.from(editorGroups.values()).flat(), [editorGroups]);

    const applyCategoryPermission = useCallback(
      (categoryId: string, level: ApprovalLevel) => {
        const category = allCategories.find(c => c.id === categoryId);
        if (!category) return;
        setSelection(prev => {
          if (prev?.kind !== 'custom') return prev;
          return { ...prev, edits: withCategoryEdits(prev.edits, baseLevels, category, level) };
        });
      },
      [allCategories, baseLevels],
    );

    const isDirty = useMemo(() => {
      if (useDefault || !guardrails || !selection) return false;
      if (guardrails.inheritDefault) return true; // creating the org's own policy
      if (selection.kind === 'template') {
        return selection.templateId !== guardrails.sourceTemplate || guardrails.overrides.length > 0;
      }
      if (selection.baseTemplateId !== guardrails.sourceTemplate) return true;
      if (selection.edits.size !== guardrails.overrides.length) return true;
      return guardrails.overrides.some(o => selection.edits.get(o.naturalKey) !== o.approvalLevel);
    }, [useDefault, guardrails, selection]);

    useImperativeHandle(
      ref,
      () => ({
        commit: async () => {
          // Inheriting: an existing org policy was already reset when the user
          // confirmed the toggle, so there is nothing to persist here.
          if (useDefault || !selection || !isDirty) return;
          await update(
            selection.kind === 'template'
              ? { templateId: selection.templateId, overrides: [] }
              : {
                  templateId: selection.baseTemplateId,
                  overrides: Array.from(selection.edits, ([naturalKey, approvalLevel]) => ({
                    naturalKey,
                    approvalLevel,
                  })),
                },
          );
        },
      }),
      [useDefault, selection, isDirty, update],
    );

    const handleToggle = (checked: boolean) => {
      if (!checked) {
        setUseDefault(false);
        return;
      }
      // Switching back to defaults: confirm first; the org policy is reset on confirm.
      if (guardrails && !guardrails.inheritDefault) {
        setConfirmResetOpen(true);
        return;
      }
      setUseDefault(true);
    };

    if (isGuardrailsLoading || isTemplatesLoading) {
      return (
        <div className="flex flex-col gap-[var(--spacing-system-sf)]">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    // The templates list drives seeding, the picker, and preset labels — a
    // failure there would otherwise misrender the org as "using defaults"
    // with a dead picker, so it is as fatal as the org query failing.
    if (error || templatesError || !guardrails) {
      return (
        <LoadError
          message="Couldn't load customer guardrails. The service may be temporarily unavailable."
          onRetry={() => {
            void refetch();
            void refetchTemplates();
          }}
        />
      );
    }

    const activePresetLabel = templates.find(t => t.id === activeTemplateId)?.displayName || 'None';
    const selectedRadioValue = selection?.kind === 'custom' ? ORG_CUSTOM_OPTION_ID : (selection?.templateId ?? '');

    return (
      <div className="flex flex-col gap-[var(--spacing-system-l)]">
        <CheckboxBlock
          id="use-default-guardrails"
          label="Use the default guardrails settings"
          description="This customer follows guardrails defaults."
          checked={useDefault}
          onCheckedChange={checked => handleToggle(Boolean(checked))}
          trailing={
            <Button
              type="button"
              variant="outline"
              onClick={e => {
                e.preventDefault();
                router.push(routes.settings.aiSettings({ tab: 'guardrails', edit: true }));
              }}
              leftIcon={<PenEditIcon className="size-5 text-ods-text-secondary" />}
              className="w-full md:w-auto"
            >
              Edit Default Guardrails
            </Button>
          }
        />

        {useDefault ? (
          <>
            <GuardrailsPresetCard label={activePresetLabel} muted />
            {inheritedGroups.size > 0 && <GuardrailsPolicyGroups groups={inheritedGroups} />}
          </>
        ) : (
          <>
            <GuardrailsTemplatePicker
              options={templateOptions}
              value={selectedRadioValue}
              disabled={isDetailLoading}
              onSelect={selectOption}
              onCreateCustomPolicyFrom={createCustomPolicyFrom}
            />

            {isDetailLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : editorGroups.size === 0 ? (
              <NoData
                icon={<ShieldCheckIcon />}
                title="This policy template has no rules"
                className="py-[var(--spacing-system-xxl)]"
              />
            ) : (
              <GuardrailsPolicyGroups
                groups={editorGroups}
                editMode={selection?.kind === 'custom'}
                onPolicyPermissionChange={setPolicyPermission}
                onCategoryPermissionChange={applyCategoryPermission}
              />
            )}
          </>
        )}

        <ConfirmDialog
          open={confirmResetOpen}
          onOpenChange={setConfirmResetOpen}
          title="Default Guardrails"
          description="The custom guardrails for this customer will be removed. They will follow the tenant default guardrails instead."
          confirmLabel="Use default"
          variant="destructive"
          isPending={isResetting}
          pendingLabel="Removing..."
          onConfirm={async () => {
            try {
              await reset();
              setUseDefault(true);
              setConfirmResetOpen(false);
              toast({
                title: 'Saved',
                description: 'Customer now follows the default guardrails',
                variant: 'success',
              });
            } catch (err) {
              toast({
                title: 'Save failed',
                description: err instanceof Error ? err.message : 'Failed to remove the custom guardrails',
                variant: 'destructive',
              });
            }
          }}
        />
      </div>
    );
  },
);
