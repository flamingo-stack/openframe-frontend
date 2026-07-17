import type { ApprovalLevel } from '@flamingo-stack/openframe-frontend-core';

/**
 * DTOs for the ai-agent policy REST API (`/chat/api/v1/policies`).
 * Guardrails policies are tenant-scoped today; when the backend adds
 * per-organization overrides (mirroring ClientAgentSettings), the scope enters
 * through `use-guardrails-policies.ts` — these shapes stay unchanged.
 */

export const CUSTOM_POLICY_TYPE = 'CUSTOM' as const;

/** Radio value for a custom policy that is being created and has no id yet. */
export const CUSTOM_CREATION_TEMPLATE_ID = 'CUSTOM_CREATION' as const;

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
