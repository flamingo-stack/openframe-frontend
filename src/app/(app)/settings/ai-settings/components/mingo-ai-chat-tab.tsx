'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useHubDefaultQuickActions } from '../hooks/use-hub-default-quick-actions';
import { getProviderModelLabel, useSupportedModels } from '../hooks/use-supported-models';
import type { AgentAiConfig, AgentAiConfigInput } from '../types/ai-settings';
import {
  getMingoAiChatDefaults,
  MINGO_AI_CHAT_FORM_ID,
  type MingoAiChatFormValues,
  mingoAiChatSchema,
  toMingoAiChatSubmit,
} from '../types/mingo-ai-chat.types';
import { AiAnswerStyleFields, AiProviderModelFields } from './ai-config-fields';
import { AiSettingsAdminCard } from './ai-settings-admin-card';
import { AiSettingsQuickActionsSection, MINGO_QUICK_ACTIONS_CONFIG } from './ai-settings-quick-actions';
import { AiSettingsQuickActionsEditor } from './ai-settings-quick-actions-editor';

export { MINGO_AI_CHAT_FORM_ID } from '../types/mingo-ai-chat.types';

interface MingoAiChatTabProps {
  aiConfig: AgentAiConfig;
  isEditMode: boolean;
  onSubmit: (input: AgentAiConfigInput) => void;
}

export function MingoAiChatTab({ aiConfig, isEditMode, onSubmit }: MingoAiChatTabProps) {
  const form = useForm<MingoAiChatFormValues>({
    resolver: zodResolver(mingoAiChatSchema),
    defaultValues: getMingoAiChatDefaults(aiConfig),
  });

  const { modelsByProvider } = useSupportedModels();

  // OpenFrame defaults come straight from the Product Hub (the BE stores only
  // customs); shown in view mode and as the editor's dimmed preview/seed.
  const hubDefaults = useHubDefaultQuickActions(MINGO_QUICK_ACTIONS_CONFIG.agentSlug);

  const llmProvider = form.watch('llmProvider');
  const answerStyle = form.watch('answerStyle');

  const handleSubmit = form.handleSubmit(values => onSubmit(toMingoAiChatSubmit(values)));

  if (!isEditMode) {
    const modelLabel = getProviderModelLabel(modelsByProvider, aiConfig.llmProvider, aiConfig.providerModel);
    return (
      <div className="flex flex-col gap-[var(--spacing-system-l)]">
        <AiSettingsAdminCard aiConfig={aiConfig} providerModelLabel={modelLabel} />
        <AiSettingsQuickActionsSection
          title="Mingo Quick Actions"
          actions={aiConfig.quickActionsIsDefault ? hubDefaults.actions : aiConfig.quickActions}
          isDefault={aiConfig.quickActionsIsDefault}
          agentConfig={MINGO_QUICK_ACTIONS_CONFIG}
        />
      </div>
    );
  }

  return (
    <form id={MINGO_AI_CHAT_FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-[var(--spacing-system-l)]">
      <AiProviderModelFields
        control={form.control}
        llmProvider={llmProvider}
        modelsByProvider={modelsByProvider}
        onProviderChange={() => form.setValue('providerModel', '')}
        providerLabel="Mingo LLM Provider"
      />

      <AiAnswerStyleFields control={form.control} answerStyle={answerStyle} />

      <AiSettingsQuickActionsEditor
        control={form.control}
        title="Mingo Quick Actions"
        agentConfig={MINGO_QUICK_ACTIONS_CONFIG}
        defaultActions={hubDefaults.actions}
        className="mt-8"
      />
    </form>
  );
}
