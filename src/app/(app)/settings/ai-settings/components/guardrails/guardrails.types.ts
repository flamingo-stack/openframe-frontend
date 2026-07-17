import type { ApprovalLevel } from '@flamingo-stack/openframe-frontend-core';

/**
 * DTOs for the ai-agent tenant policy REST API (`/chat/api/v1/policies`).
 * Per-organization guardrails use the ai-agent GraphQL API instead — see
 * `use-organization-guardrails.ts` (its rules normalize to `PolicyRule`).
 */

export const CUSTOM_POLICY_TYPE = 'CUSTOM' as const;

/** Radio value for a custom policy that is being created and has no id yet. */
export const CUSTOM_CREATION_TEMPLATE_ID = 'CUSTOM_CREATION' as const;

/** Picker description for the Custom option (custom policies carry no backend description). */
export const CUSTOM_POLICY_DESCRIPTION =
  'Complete flexibility to configure every functional area individually. Set specific permissions for each ' +
  'category, customize tool implementations, and define approval workflows based on your exact operational needs.';

export interface PolicyTemplateSummary {
  id: string;
  displayName: string;
  description?: string;
  type: 'TEMPLATE' | 'CUSTOM' | string;
  isActive: boolean;
  customOverridesCount: number;
}

export interface PolicyRule {
  tool: string;
  function: string;
  policyGroup: string;
  category: string;
  operation: string;
  commandPattern: string;
  approvalLevel: ApprovalLevel;
  naturalKey: string;
}

export interface PolicyTemplateDetail {
  id: string;
  displayName: string;
  type: 'TEMPLATE' | 'CUSTOM' | string;
  /** For CUSTOM policies: id of the template the overrides are based on. */
  sourceTemplate?: string;
  rules: PolicyRule[];
  customOverrides: Record<string, ApprovalLevel>;
  active: boolean;
}

export interface CustomPolicyRequest {
  templateId: string;
  overrides: Record<string, ApprovalLevel>;
}
