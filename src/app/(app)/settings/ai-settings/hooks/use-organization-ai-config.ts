'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { AgentAiConfigInput, AIProvider, AiQuickAction, AnswerStyle } from '../types/ai-settings';
import { type GraphqlResponse, type MutationPayloadGql, throwOnErrors } from './chat-graphql';

/**
 * Per-organization CLIENT AI config via the ai-agent GraphQL API
 * (`/chat/graphql`, raw-POST by design). The query returns the EFFECTIVE
 * config: tenant default values while `inheritDefault` is true, the org's own
 * override otherwise. The appearance part (name/avatar/theme/accent) lives on
 * ClientView with its own per-org override — see `use-client-view.ts`.
 */

export const organizationAiConfigQueryKeys = {
  detail: (organizationId: string) => ['organization-client-ai-config', { organizationId }] as const,
};

const ORGANIZATION_CLIENT_AI_CONFIG_FIELDS = `
  organizationId
  inheritDefault
  llmProvider
  providerModel
  answerStyle
  customPrompt
  quickActions {
    id
    name
    instructions
  }
  quickActionsIsDefault
  updatedAt
`;

const GET_ORGANIZATION_CLIENT_AI_CONFIG_QUERY = `
  query GetOrganizationClientAiConfig($organizationId: ID!) {
    organizationClientAiConfig(organizationId: $organizationId) {
      ${ORGANIZATION_CLIENT_AI_CONFIG_FIELDS}
    }
  }
`;

const UPDATE_ORGANIZATION_CLIENT_AI_CONFIG_MUTATION = `
  mutation UpdateOrganizationClientAiConfig($organizationId: ID!, $input: AgentAiConfigInput!) {
    updateOrganizationClientAiConfig(organizationId: $organizationId, input: $input) {
      config {
        organizationId
        inheritDefault
        updatedAt
      }
      userErrors {
        message
      }
    }
  }
`;

const RESET_ORGANIZATION_CLIENT_AI_CONFIG_MUTATION = `
  mutation ResetOrganizationClientAiConfig($organizationId: ID!) {
    resetOrganizationClientAiConfig(organizationId: $organizationId) {
      userErrors {
        message
      }
    }
  }
`;

const RESET_ORGANIZATION_CLIENT_AI_QUICK_ACTIONS_MUTATION = `
  mutation ResetOrganizationClientAiQuickActions($organizationId: ID!) {
    resetOrganizationClientAiQuickActions(organizationId: $organizationId) {
      userErrors {
        message
      }
    }
  }
`;

export interface OrganizationClientAiConfig {
  organizationId: string;
  /** True when the org has no override and the values are the tenant defaults. */
  inheritDefault: boolean;
  llmProvider: AIProvider | null;
  providerModel: string | null;
  answerStyle: AnswerStyle | null;
  customPrompt: string | null;
  /** Effective quick actions: the org's own list when customized, else the tenant's current one; null means nothing configured anywhere (bundled fallback). */
  quickActions: AiQuickAction[] | null;
  /** True while the org follows the tenant's quick actions live (no own list stored). */
  quickActionsIsDefault: boolean;
  updatedAt: string | null;
}

export function useOrganizationClientAiConfig(organizationId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const result = useQuery({
    queryKey: organizationAiConfigQueryKeys.detail(organizationId),
    queryFn: async (): Promise<OrganizationClientAiConfig> => {
      const response = await apiClient.post<
        GraphqlResponse<{ organizationClientAiConfig: OrganizationClientAiConfig | null }>
      >('/chat/graphql', { query: GET_ORGANIZATION_CLIENT_AI_CONFIG_QUERY, variables: { organizationId } });

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to load customer AI configuration');
      }
      if (response.data.errors?.length) {
        throw new Error(response.data.errors.map(e => e.message).join(', '));
      }

      const raw = response.data.data?.organizationClientAiConfig;
      if (!raw) {
        throw new Error('Failed to load customer AI configuration');
      }
      return raw;
    },
    enabled: enabled && !!organizationId,
  });

  return {
    config: result.data ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

/**
 * Gives the org its own CLIENT AI config (breaks inheritance). Feedback is
 * owned by the caller ("Save Customer" flow).
 */
export function useUpdateOrganizationClientAiConfig(organizationId: string) {
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async (input: AgentAiConfigInput) => {
      const response = await apiClient.post<GraphqlResponse<Record<string, MutationPayloadGql>>>('/chat/graphql', {
        query: UPDATE_ORGANIZATION_CLIENT_AI_CONFIG_MUTATION,
        variables: { organizationId, input },
      });
      throwOnErrors(response, 'Failed to save customer AI configuration');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationAiConfigQueryKeys.detail(organizationId) });
    },
  });

  return { update: result.mutateAsync, isPending: result.isPending };
}

/**
 * Removes the org's override so it inherits the tenant default again.
 * Feedback is owned by the caller (confirm dialog on the customer edit page).
 */
export function useResetOrganizationClientAiConfig(organizationId: string) {
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<GraphqlResponse<Record<string, MutationPayloadGql>>>('/chat/graphql', {
        query: RESET_ORGANIZATION_CLIENT_AI_CONFIG_MUTATION,
        variables: { organizationId },
      });
      throwOnErrors(response, 'Failed to reset customer AI configuration');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationAiConfigQueryKeys.detail(organizationId) });
    },
  });

  return { reset: result.mutateAsync, isPending: result.isPending };
}

/**
 * Clears the org's own quick actions so it follows the tenant's live again
 * (`quickActionsIsDefault` becomes true), keeping the rest of the override
 * intact — the backend ignores `quickActionsIsDefault` on org updates, so
 * re-checking "use defaults" must go through this mutation. Feedback is owned
 * by the caller.
 */
export function useResetOrganizationClientAiQuickActions(organizationId: string) {
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<GraphqlResponse<Record<string, MutationPayloadGql>>>('/chat/graphql', {
        query: RESET_ORGANIZATION_CLIENT_AI_QUICK_ACTIONS_MUTATION,
        variables: { organizationId },
      });
      throwOnErrors(response, 'Failed to reset customer quick actions');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationAiConfigQueryKeys.detail(organizationId) });
    },
  });

  return { resetQuickActions: result.mutateAsync, isPending: result.isPending };
}
