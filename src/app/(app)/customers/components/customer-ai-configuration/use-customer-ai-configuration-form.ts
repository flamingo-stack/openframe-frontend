'use client';

import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { OrganizationClientAiConfig } from '@/app/(app)/settings/ai-settings/hooks/use-organization-ai-config';
import { type ClientView, getDefaultAgentAiConfig } from '@/app/(app)/settings/ai-settings/types/ai-settings';
import {
  type CustomerAiAssistantFormValues,
  customerAiAssistantSchema,
} from '@/app/(app)/settings/ai-settings/types/customer-ai-assistant.types';
import { getFullImageUrl } from '@/lib/image-url';
import { deleteWithAuth, uploadWithAuth } from '@/lib/upload-with-auth';

interface UseCustomerAiConfigurationFormOptions {
  /** Effective appearance (org override, or tenant default while inheriting). */
  view: ClientView;
  /** Effective per-org AI config (tenant values while inheriting). */
  config: OrganizationClientAiConfig | null;
}

/** Form defaults from the effective appearance + AI config. */
function getCustomerAiConfigurationDefaults(
  view: ClientView,
  config: OrganizationClientAiConfig | null,
): CustomerAiAssistantFormValues {
  const baseConfig = getDefaultAgentAiConfig('CLIENT');
  return {
    assistantName: view.assistantName,
    applicationTheme: view.applicationTheme,
    accentColor: view.accentColor,
    llmProvider: config?.llmProvider ?? baseConfig.llmProvider,
    providerModel: config?.providerModel ?? baseConfig.providerModel,
    answerStyle: config?.answerStyle ?? baseConfig.answerStyle ?? 'STANDARD',
    customPrompt: config?.customPrompt ?? '',
    // The org config has no explicit flag — a null action list means "no
    // customs" (hub defaults apply). Mirrors getAiLogicDefaults: rows stay
    // empty while defaults are active; the editor seeds them on uncheck.
    quickActionsIsDefault: !config?.quickActions,
    quickActions: (config?.quickActions ?? []).map(q => ({ id: q.id, name: q.name, instructions: q.instructions })),
  };
}

/**
 * Form state for the per-customer AI configuration block. Reuses the global
 * CLIENT screen's schema (appearance + AI logic + quick actions); the avatar
 * is deferred to `commitAvatar` so it targets the customer's own ClientView
 * id, not the tenant default `view` borrowed while editing.
 */
export function useCustomerAiConfigurationForm({ view, config }: UseCustomerAiConfigurationFormOptions) {
  const { toast } = useToast();
  const form = useForm<CustomerAiAssistantFormValues>({
    resolver: zodResolver(customerAiAssistantSchema),
    defaultValues: getCustomerAiConfigurationDefaults(view, config),
  });

  const [avatarUrl, setAvatarUrl] = useState(
    getFullImageUrl(view.assistantAvatar?.imageUrl, view.assistantAvatar?.hash),
  );

  const pendingFileRef = useRef<File | null>(null);
  const pendingRemovalRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  // Re-sync form + avatar when either underlying record changes.
  const syncKey = `${view.id}:${view.updatedAt ?? ''}:${config?.inheritDefault ?? ''}:${config?.updatedAt ?? ''}`;
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSyncRef.current === syncKey) return;
    lastSyncRef.current = syncKey;
    clearPreview();
    pendingFileRef.current = null;
    pendingRemovalRef.current = false;
    form.reset(getCustomerAiConfigurationDefaults(view, config));
    setAvatarUrl(getFullImageUrl(view.assistantAvatar?.imageUrl, view.assistantAvatar?.hash));
  }, [syncKey, view, config, form, clearPreview]);

  useEffect(() => () => clearPreview(), [clearPreview]);

  const handleAvatarChange = (file: File) => {
    clearPreview();
    const preview = URL.createObjectURL(file);
    previewUrlRef.current = preview;
    pendingFileRef.current = file;
    pendingRemovalRef.current = false;
    setAvatarUrl(preview);
  };

  const handleAvatarRemove = () => {
    clearPreview();
    pendingFileRef.current = null;
    // Delete on the backend only if there is a persisted avatar.
    pendingRemovalRef.current = Boolean(view.assistantAvatar);
    setAvatarUrl(undefined);
  };

  // Flush the pending avatar change to the saved ClientView id. Throws on failure.
  const commitAvatar = async (clientViewId: string) => {
    const imageEndpoint = `/api/client-agent-settings/${clientViewId}/image`;
    if (pendingFileRef.current) {
      const uploadedUrl = await uploadWithAuth(imageEndpoint, pendingFileRef.current);
      pendingFileRef.current = null;
      clearPreview();
      // Bust the content-stable endpoint URL so the new image loads.
      setAvatarUrl(getFullImageUrl(uploadedUrl, String(Date.now())));
      toast({ title: 'Avatar updated', description: 'Assistant avatar uploaded', variant: 'success' });
    } else if (pendingRemovalRef.current) {
      await deleteWithAuth(imageEndpoint);
      pendingRemovalRef.current = false;
      toast({ title: 'Avatar removed', description: 'Assistant avatar deleted', variant: 'success' });
    }
  };

  return {
    form,
    avatarUrl,
    handleAvatarChange,
    handleAvatarRemove,
    commitAvatar,
  };
}
