'use client';

import type { ApprovalLevel } from '@flamingo-stack/openframe-frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { type GraphqlResponse, type MutationPayloadGql, throwOnErrors } from '../../hooks/chat-graphql';
import type { PolicyRule } from './guardrails.types';

/**
 * Per-organization guardrails via the ai-agent GraphQL API (`/chat/graphql`,
 * raw-POST by design — the saas-ai-agent schema is not in `schema.graphql`).
 * The query returns the EFFECTIVE view: when `inheritDefault` is true the
 * rules are the tenant defaults; otherwise the org's own materialized policy.
 * Tenant-level templates stay on the REST hooks (`use-guardrails-policies.ts`).
 */

export const organizationGuardrailsQueryKeys = {
  detail: (organizationId: string) => ['organization-guardrails', { organizationId }] as const,
};

const GUARDRAIL_RULE_FIELDS = `
  tool
  function
  policyGroup
  category
  operation
  commandPattern
  approvalLevel
  naturalKey
`;

const GET_ORGANIZATION_GUARDRAILS_QUERY = `
  query GetOrganizationGuardrails($organizationId: ID!) {
    organizationGuardrails(organizationId: $organizationId) {
      organizationId
      inheritDefault
      sourceTemplate
      active
      rules {
        ${GUARDRAIL_RULE_FIELDS}
      }
      overrides {
        naturalKey
        approvalLevel
      }
    }
  }
`;

interface GuardrailRuleGql {
  tool: string;
  function: string | null;
  policyGroup: string | null;
  category: string | null;
  operation: string | null;
  commandPattern: string | null;
  approvalLevel: ApprovalLevel;
  naturalKey: string;
}

interface OrganizationGuardrailsGql {
  organizationId: string;
  inheritDefault: boolean;
  sourceTemplate: string | null;
  active: boolean;
  rules: GuardrailRuleGql[];
  overrides: { naturalKey: string; approvalLevel: ApprovalLevel }[];
}

export interface OrganizationGuardrails extends Omit<OrganizationGuardrailsGql, 'rules'> {
  rules: PolicyRule[];
}

// GuardrailRule has nullable descriptive fields; PolicyRule (shared with the
// tenant REST hooks and buildPolicyGroups) uses empty strings instead.
function toPolicyRule(rule: GuardrailRuleGql): PolicyRule {
  return {
    tool: rule.tool,
    function: rule.function ?? '',
    policyGroup: rule.policyGroup ?? '',
    category: rule.category ?? '',
    operation: rule.operation ?? '',
    commandPattern: rule.commandPattern ?? '',
    approvalLevel: rule.approvalLevel,
    naturalKey: rule.naturalKey,
  };
}

export function useOrganizationGuardrails(organizationId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: organizationGuardrailsQueryKeys.detail(organizationId),
    queryFn: async (): Promise<OrganizationGuardrails> => {
      const response = await apiClient.post<GraphqlResponse<{ organizationGuardrails: OrganizationGuardrailsGql }>>(
        '/chat/graphql',
        { query: GET_ORGANIZATION_GUARDRAILS_QUERY, variables: { organizationId } },
      );

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to load organization guardrails');
      }
      if (response.data.errors?.length) {
        throw new Error(response.data.errors.map(e => e.message).join(', '));
      }

      const raw = response.data.data?.organizationGuardrails;
      if (!raw) {
        throw new Error('Failed to load organization guardrails');
      }

      return { ...raw, rules: raw.rules.map(toPolicyRule) };
    },
    enabled: enabled && !!organizationId,
  });

  return {
    guardrails: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

const UPDATE_ORGANIZATION_GUARDRAILS_MUTATION = `
  mutation UpdateOrganizationGuardrails($organizationId: ID!, $input: OrganizationGuardrailsInput!) {
    updateOrganizationGuardrails(organizationId: $organizationId, input: $input) {
      guardrails {
        organizationId
        inheritDefault
        sourceTemplate
        active
      }
      userErrors {
        message
      }
    }
  }
`;

const RESET_ORGANIZATION_GUARDRAILS_MUTATION = `
  mutation ResetOrganizationGuardrails($organizationId: ID!) {
    resetOrganizationGuardrails(organizationId: $organizationId) {
      userErrors {
        message
      }
    }
  }
`;

export interface OrganizationGuardrailsInput {
  /** Server id of the base TEMPLATE policy from the tenant preset list. */
  templateId: string;
  overrides: { naturalKey: string; approvalLevel: ApprovalLevel }[];
}

/**
 * Materializes the org's own guardrails from a preset template + overrides.
 * Feedback is owned by the caller ("Save Customer" flow).
 */
export function useUpdateOrganizationGuardrails(organizationId: string) {
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async (input: OrganizationGuardrailsInput) => {
      const response = await apiClient.post<GraphqlResponse<Record<string, MutationPayloadGql>>>('/chat/graphql', {
        query: UPDATE_ORGANIZATION_GUARDRAILS_MUTATION,
        variables: { organizationId, input },
      });
      throwOnErrors(response, 'Failed to save customer guardrails');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationGuardrailsQueryKeys.detail(organizationId) });
    },
  });

  return { update: result.mutateAsync, isPending: result.isPending };
}

/**
 * Resets the org to inherit the tenant default guardrails. Feedback is owned
 * by the caller (confirm dialog on the customer edit page).
 */
export function useResetOrganizationGuardrails(organizationId: string) {
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<GraphqlResponse<Record<string, MutationPayloadGql>>>('/chat/graphql', {
        query: RESET_ORGANIZATION_GUARDRAILS_MUTATION,
        variables: { organizationId },
      });
      throwOnErrors(response, 'Failed to reset customer guardrails');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationGuardrailsQueryKeys.detail(organizationId) });
    },
  });

  return { reset: result.mutateAsync, isPending: result.isPending };
}
