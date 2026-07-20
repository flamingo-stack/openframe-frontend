'use client';

import { useAdminAiConfig } from '@/app/(app)/settings/ai-settings/hooks/use-agent-ai-config';
import { getProviderModelLabel, useSupportedModels } from '@/app/(app)/settings/ai-settings/hooks/use-supported-models';

export interface AiModel {
  provider: string;
  displayName: string;
}

/**
 * Tenant-wide ADMIN (Mingo) assistant model, from the GraphQL `adminAiConfig`
 * (the ADMIN agent has no per-organization override). Replaces the deprecated
 * REST `/chat/api/v1/ai-configuration` read. For CLIENT chats use the
 * per-message AssistantOwner provenance / `organizationClientAiConfig`
 * instead — the effective client model is per-customer.
 */
export function useAiModelStatus() {
  const { config, isLoading: isConfigLoading } = useAdminAiConfig();
  const { modelsByProvider, isLoading: isModelsLoading } = useSupportedModels();

  const aiModel: AiModel | null = config?.providerModel
    ? {
        provider: config.llmProvider,
        displayName: getProviderModelLabel(modelsByProvider, config.llmProvider, config.providerModel),
      }
    : null;

  return { aiModel, isLoading: isConfigLoading || isModelsLoading };
}

export function useAiModel() {
  return useAiModelStatus().aiModel;
}
