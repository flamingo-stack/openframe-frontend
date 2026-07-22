'use client';

import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { getFullImageUrl } from '@/lib/image-url';
import { deleteWithAuth, uploadWithAuth } from '@/lib/upload-with-auth';
import type { AgentAiConfig, ClientView } from '../types/ai-settings';
import {
  type CustomerAiAssistantFormValues,
  type CustomerAiAssistantSubmit,
  customerAiAssistantSchema,
  getCustomerAiAssistantDefaults,
  toCustomerAiAssistantSubmit,
} from '../types/customer-ai-assistant.types';

/** Flushes the staged avatar change to the saved ClientView id. */
export type CommitAvatar = (clientViewId: string) => Promise<void>;

interface UseCustomerAiAssistantFormOptions {
  aiConfig: AgentAiConfig;
  view: ClientView;
  onSubmit: (payload: CustomerAiAssistantSubmit, commitAvatar: CommitAvatar) => void;
}

/**
 * Form state for the global CLIENT screen. The avatar lives on the ClientView
 * via a separate REST endpoint, not the GraphQL config — and on a tenant with
 * no default ClientView yet, `view.id` is empty until the first save creates
 * the record. So the avatar change is STAGED locally and flushed via
 * `commitAvatar(savedViewId)` after the save resolves (same contract as the
 * per-customer form), never uploaded against a possibly-empty id.
 */
export function useCustomerAiAssistantForm({ aiConfig, view, onSubmit }: UseCustomerAiAssistantFormOptions) {
  const { toast } = useToast();
  const form = useForm<CustomerAiAssistantFormValues>({
    resolver: zodResolver(customerAiAssistantSchema),
    defaultValues: getCustomerAiAssistantDefaults(aiConfig, view),
  });

  // imageUrl from the API is relative, so resolve it for <img src>.
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

  // Re-sync form + avatar when either underlying record changes (e.g. the
  // post-save refetch lands, or the first save created the default records).
  const syncKey = `${aiConfig.id}:${aiConfig.updatedAt ?? ''}:${view.id}:${view.updatedAt ?? ''}`;
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSyncRef.current === syncKey) return;
    lastSyncRef.current = syncKey;
    clearPreview();
    pendingFileRef.current = null;
    pendingRemovalRef.current = false;
    form.reset(getCustomerAiAssistantDefaults(aiConfig, view));
    setAvatarUrl(getFullImageUrl(view.assistantAvatar?.imageUrl, view.assistantAvatar?.hash));
  }, [syncKey, aiConfig, view, form, clearPreview]);

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
  const commitAvatar: CommitAvatar = async clientViewId => {
    const imageEndpoint = `/api/client-agent-settings/${clientViewId}/image`;
    if (pendingFileRef.current) {
      const uploadedUrl = await uploadWithAuth(imageEndpoint, pendingFileRef.current);
      pendingFileRef.current = null;
      clearPreview();
      // The image endpoint URL is content-stable, so the browser would otherwise
      // serve the previously cached avatar. Bust the cache so the freshly
      // uploaded image actually loads.
      setAvatarUrl(getFullImageUrl(uploadedUrl, String(Date.now())));
      toast({ title: 'Avatar updated', description: 'Assistant avatar uploaded', variant: 'success' });
    } else if (pendingRemovalRef.current) {
      await deleteWithAuth(imageEndpoint);
      pendingRemovalRef.current = false;
      toast({ title: 'Avatar removed', description: 'Assistant avatar deleted', variant: 'success' });
    }
  };

  const handleSubmit = form.handleSubmit(values => onSubmit(toCustomerAiAssistantSubmit(values), commitAvatar));

  return {
    form,
    avatarUrl,
    handleAvatarChange,
    handleAvatarRemove,
    handleSubmit,
  };
}
