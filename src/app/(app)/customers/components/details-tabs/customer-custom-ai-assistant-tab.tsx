'use client';

import { LoadError, Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { AiSettingsOverview } from '@/app/(app)/settings/ai-settings/components/ai-settings-overview';
import { useClientView } from '@/app/(app)/settings/ai-settings/hooks/use-client-view';
import { useOrganizationClientAiConfig } from '@/app/(app)/settings/ai-settings/hooks/use-organization-ai-config';
import { getProviderModelLabel, useSupportedModels } from '@/app/(app)/settings/ai-settings/hooks/use-supported-models';
import {
  type AgentAiConfig,
  getDefaultAgentAiConfig,
  getDefaultClientView,
} from '@/app/(app)/settings/ai-settings/types/ai-settings';

interface CustomerCustomAiAssistantTabProps {
  organizationId: string;
}

/**
 * Read-only "Customer AI Configuration" tab on the customer details page.
 * Renders the same overview structure as the global AI settings CLIENT tab
 * (AiSettingsOverview: customer card + previews + quick actions), fed with the
 * customer's EFFECTIVE values — the org overrides where present, the tenant
 * defaults otherwise. Editing happens on /customers/edit.
 */
export function CustomerCustomAiAssistantTab({ organizationId }: CustomerCustomAiAssistantTabProps) {
  // Shares the react-query caches with the parent's visibility check.
  const { view: orgView, isLoading: isViewLoading } = useClientView(organizationId);
  const { view: defaultView } = useClientView(null);
  const {
    config: orgConfig,
    isLoading: isConfigLoading,
    error: configError,
    refetch: refetchConfig,
  } = useOrganizationClientAiConfig(organizationId);
  const { modelsByProvider } = useSupportedModels();

  if (isViewLoading || isConfigLoading) {
    return (
      <div className="flex flex-col gap-[var(--spacing-system-l)]">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  if (configError) {
    return (
      <LoadError
        message="Couldn't load the customer AI configuration. The service may be temporarily unavailable."
        onRetry={() => void refetchConfig()}
      />
    );
  }

  const effectiveView = orgView ?? defaultView ?? getDefaultClientView(organizationId);
  // AiSettingsOverview consumes the tenant-level AgentAiConfig shape; project
  // the effective org values onto it (nullable fields fall back like the
  // global screen's defaults).
  const aiConfig: AgentAiConfig = {
    ...getDefaultAgentAiConfig('CLIENT'),
    llmProvider: orgConfig?.llmProvider ?? 'ANTHROPIC',
    providerModel: orgConfig?.providerModel ?? '',
    answerStyle: orgConfig?.answerStyle ?? null,
    customPrompt: orgConfig?.customPrompt ?? null,
    quickActions: orgConfig?.quickActions ?? [],
  };

  return (
    <AiSettingsOverview
      aiConfig={aiConfig}
      view={effectiveView}
      providerModelLabel={getProviderModelLabel(modelsByProvider, aiConfig.llmProvider, aiConfig.providerModel)}
      quickActions={aiConfig.quickActions}
    />
  );
}
