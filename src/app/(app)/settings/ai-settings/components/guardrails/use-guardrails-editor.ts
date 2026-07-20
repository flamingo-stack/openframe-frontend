'use client';

import type { ApprovalLevel } from '@flamingo-stack/openframe-frontend-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildPolicyGroups } from './build-policy-groups';
import { CUSTOM_CREATION_TEMPLATE_ID, CUSTOM_POLICY_DESCRIPTION, CUSTOM_POLICY_TYPE } from './guardrails.types';
import type { GuardrailsTemplateOption } from './guardrails-template-picker';
import { applyEditsToRules, buildBaseLevels, withCategoryEdits, withPolicyEdit } from './rule-edits';
import {
  useActivateGuardrailsTemplate,
  useGuardrailsTemplate,
  useGuardrailsTemplates,
  useSaveCustomGuardrailsPolicy,
} from './use-guardrails-policies';

/**
 * Everything the user changed during an edit session. Server state stays in
 * react-query; cancelling an edit is just dropping the draft — no snapshots.
 *
 * - `template`        a stock template is selected (activated on save)
 * - `existing-custom` the tenant's custom policy is selected; `edits` are
 *                     merged into its overrides on save
 * - `new-custom`      "Use for Custom Policy" re-bases (or creates) the custom
 *                     policy on `baseTemplateId`; `edits` become its overrides
 */
type GuardrailsDraft =
  | { kind: 'template'; templateId: string }
  | { kind: 'existing-custom'; edits: Map<string, ApprovalLevel> }
  | { kind: 'new-custom'; baseTemplateId: string; edits: Map<string, ApprovalLevel> };

interface UseGuardrailsEditorArgs {
  /** Edit session driver: entering builds a draft, leaving discards it. */
  isEditMode: boolean;
}

export function useGuardrailsEditor({ isEditMode }: UseGuardrailsEditorArgs) {
  const { templates, activeTemplateId, customTemplate, isLoading, error, refetch } = useGuardrailsTemplates();
  const { activate, isPending: isActivating } = useActivateGuardrailsTemplate();
  const { saveCustomPolicy, isPending: isSavingCustom } = useSaveCustomGuardrailsPolicy();

  const [draft, setDraft] = useState<GuardrailsDraft | null>(null);

  // What the read-only view shows (and the edit draft starts from).
  const defaultTemplateId = activeTemplateId ?? templates[0]?.id ?? null;
  const customTemplateId = customTemplate?.id ?? null;

  useEffect(() => {
    if (!isEditMode) {
      setDraft(null);
      return;
    }
    if (!defaultTemplateId) return; // templates still loading
    setDraft(
      prev =>
        prev ??
        (customTemplateId === defaultTemplateId
          ? { kind: 'existing-custom', edits: new Map() }
          : { kind: 'template', templateId: defaultTemplateId }),
    );
  }, [isEditMode, defaultTemplateId, customTemplateId]);

  // Which template's rules are on screen. For `existing-custom` that's the
  // custom policy itself (rules arrive pre-merged); for `new-custom` the base
  // template — react-query caches make switching back and forth instant.
  const displayTemplateId = useMemo(() => {
    if (!isEditMode || !draft) return defaultTemplateId;
    if (draft.kind === 'template') return draft.templateId;
    if (draft.kind === 'existing-custom') return customTemplateId;
    return draft.baseTemplateId;
  }, [isEditMode, draft, defaultTemplateId, customTemplateId]);

  const { template: displayTemplate, isLoading: isDetailLoading } = useGuardrailsTemplate(displayTemplateId);

  // Approval levels as the server knows them — edits that return to these are
  // dropped from the draft instead of being sent as overrides.
  const baseLevels = useMemo(() => buildBaseLevels(displayTemplate?.rules ?? []), [displayTemplate]);

  const policyGroups = useMemo(() => {
    const edits = draft && draft.kind !== 'template' ? draft.edits : null;
    return buildPolicyGroups(applyEditsToRules(displayTemplate?.rules ?? [], edits));
  }, [displayTemplate, draft]);

  const allCategories = useMemo(() => Array.from(policyGroups.values()).flat(), [policyGroups]);

  const activePresetLabel = templates.find(t => t.id === defaultTemplateId)?.displayName || 'None';

  const templateOptions = useMemo<GuardrailsTemplateOption[]>(() => {
    const basedOnId =
      draft?.kind === 'new-custom'
        ? draft.baseTemplateId
        : draft?.kind === 'existing-custom'
          ? displayTemplate?.sourceTemplate
          : undefined;
    const basedOnLabel = templates.find(t => t.id === basedOnId)?.displayName;
    const suffix = basedOnLabel ? ` (based on ${basedOnLabel})` : '';

    const options: GuardrailsTemplateOption[] = templates.map(t => {
      const isCustom = t.type === CUSTOM_POLICY_TYPE;
      return {
        id: t.id,
        label: isCustom ? `${t.displayName}${suffix}` : t.displayName,
        // Custom policies carry no backend description — use the shared copy
        // so the row reads the same as on the customer edit page.
        description: isCustom ? t.description || CUSTOM_POLICY_DESCRIPTION : t.description,
        isCustom,
      };
    });

    // No custom policy saved yet: the one being drafted gets a synthetic row.
    if (draft?.kind === 'new-custom' && !customTemplate) {
      options.push({
        id: CUSTOM_CREATION_TEMPLATE_ID,
        label: `Custom Policy${suffix}`,
        description: CUSTOM_POLICY_DESCRIPTION,
        isCustom: true,
      });
    }

    return options;
  }, [templates, draft, displayTemplate, customTemplate]);

  const selectedTemplateId =
    !draft || draft.kind === 'template'
      ? (draft?.templateId ?? defaultTemplateId ?? '')
      : (customTemplateId ?? CUSTOM_CREATION_TEMPLATE_ID);

  const canEditRules = isEditMode && !!draft && draft.kind !== 'template';

  const selectTemplate = useCallback(
    (templateId: string) => {
      if (templateId === CUSTOM_CREATION_TEMPLATE_ID) return; // synthetic row for the drafted custom policy
      setDraft(
        templateId === customTemplateId
          ? { kind: 'existing-custom', edits: new Map() }
          : { kind: 'template', templateId },
      );
    },
    [customTemplateId],
  );

  const createCustomPolicyFrom = useCallback((baseTemplateId: string) => {
    setDraft({ kind: 'new-custom', baseTemplateId, edits: new Map() });
  }, []);

  const setPolicyPermission = useCallback(
    (_categoryId: string, policyId: string, level: ApprovalLevel) => {
      setDraft(prev => {
        if (!prev || prev.kind === 'template') return prev;
        return { ...prev, edits: withPolicyEdit(prev.edits, baseLevels, policyId, level) };
      });
    },
    [baseLevels],
  );

  const applyCategoryPermission = useCallback(
    (categoryId: string, level: ApprovalLevel) => {
      const category = allCategories.find(c => c.id === categoryId);
      if (!category) return;
      setDraft(prev => {
        if (!prev || prev.kind === 'template') return prev;
        return { ...prev, edits: withCategoryEdits(prev.edits, baseLevels, category, level) };
      });
    },
    [allCategories, baseLevels],
  );

  // Ref guard: isPending flips asynchronously, a double form submit would
  // otherwise fire two mutations.
  const isSavingRef = useRef(false);

  /** Persists the draft. Resolves true when the host may exit edit mode. */
  const save = useCallback(async (): Promise<boolean> => {
    if (isSavingRef.current) return false;
    if (!draft) return true; // nothing editable (e.g. no templates)

    isSavingRef.current = true;
    try {
      if (draft.kind === 'template') {
        if (draft.templateId !== activeTemplateId) await activate(draft.templateId);
      } else if (draft.kind === 'new-custom') {
        await saveCustomPolicy({
          templateId: draft.baseTemplateId,
          overrides: Object.fromEntries(draft.edits),
        });
      } else if (draft.edits.size > 0) {
        const baseTemplateId =
          displayTemplate?.sourceTemplate || templates.find(t => t.type !== CUSTOM_POLICY_TYPE)?.id || 'DEFAULT';
        await saveCustomPolicy({
          templateId: baseTemplateId,
          overrides: { ...(displayTemplate?.customOverrides ?? {}), ...Object.fromEntries(draft.edits) },
        });
      } else if (customTemplateId && customTemplateId !== activeTemplateId) {
        // Custom policy re-selected without rule edits — just activate it.
        await activate(customTemplateId);
      }
      return true;
    } catch {
      return false; // mutation hooks own the error toasts
    } finally {
      isSavingRef.current = false;
    }
  }, [draft, activeTemplateId, activate, saveCustomPolicy, displayTemplate, templates, customTemplateId]);

  return {
    // Server state
    hasTemplates: templates.length > 0,
    activePresetLabel,
    policyGroups,
    isLoading,
    loadError: error,
    refetch,
    isDetailLoading,
    // Edit session
    templateOptions,
    selectedTemplateId,
    canEditRules,
    isSaving: isActivating || isSavingCustom,
    selectTemplate,
    createCustomPolicyFrom,
    setPolicyPermission,
    applyCategoryPermission,
    save,
  };
}

export type GuardrailsEditor = ReturnType<typeof useGuardrailsEditor>;
