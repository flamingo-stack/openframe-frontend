'use client';

import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  CUSTOM_POLICY_TYPE,
  type CustomPolicyRequest,
  type PolicyTemplateDetail,
  type PolicyTemplateSummary,
} from './guardrails.types';

/**
 * React-query data layer for guardrails policy templates
 * (`/chat/api/v1/policies`, tenant-scoped). A future per-organization scope
 * (customer details page) extends these hooks and their query keys — the
 * editor and panel components stay unchanged.
 */

export const guardrailsQueryKeys = {
  all: ['guardrails-policies'] as const,
  templates: () => [...guardrailsQueryKeys.all, 'templates'] as const,
  template: (id: string) => [...guardrailsQueryKeys.all, 'template', id] as const,
};

export function useGuardrailsTemplates() {
  const result = useQuery({
    queryKey: guardrailsQueryKeys.templates(),
    queryFn: async (): Promise<PolicyTemplateSummary[]> => {
      const res = await apiClient.get<PolicyTemplateSummary[]>('/chat/api/v1/policies');
      if (!res.ok) throw new Error(res.error || 'Failed to fetch policy templates');
      // Stock templates first, the tenant's custom policy last.
      return (res.data || []).sort((a, b) => {
        if (a.type === CUSTOM_POLICY_TYPE && b.type !== CUSTOM_POLICY_TYPE) return 1;
        if (a.type !== CUSTOM_POLICY_TYPE && b.type === CUSTOM_POLICY_TYPE) return -1;
        return 0;
      });
    },
  });

  const templates = useMemo(() => result.data ?? [], [result.data]);
  const activeTemplateId = useMemo(() => templates.find(t => t.isActive)?.id ?? null, [templates]);
  const customTemplate = useMemo(() => templates.find(t => t.type === CUSTOM_POLICY_TYPE) ?? null, [templates]);

  return {
    templates,
    activeTemplateId,
    customTemplate,
    isLoading: result.isLoading,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useGuardrailsTemplate(templateId: string | null) {
  const result = useQuery({
    queryKey: guardrailsQueryKeys.template(templateId ?? ''),
    queryFn: async (): Promise<PolicyTemplateDetail> => {
      const res = await apiClient.get<PolicyTemplateDetail>(
        `/chat/api/v1/policies/${encodeURIComponent(templateId as string)}`,
      );
      if (!res.ok || !res.data) throw new Error(res.error || 'Failed to fetch policy template');
      return res.data;
    },
    enabled: !!templateId,
  });

  return {
    template: result.data ?? null,
    isLoading: !!templateId && result.isLoading,
    error: result.error,
  };
}

export function useActivateGuardrailsTemplate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiClient.post(`/chat/api/v1/policies/${encodeURIComponent(templateId)}/activate`);
      if (!res.ok) throw new Error(res.error || 'Failed to activate policy template');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guardrailsQueryKeys.all });
      toast({
        title: 'Guardrails Saved',
        description: 'Policy template activated successfully',
        variant: 'success',
        duration: 4000,
      });
    },
    onError: err => {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Unable to activate policy template',
        variant: 'destructive',
        duration: 5000,
      });
    },
  });

  return { activate: result.mutateAsync, isPending: result.isPending };
}

export function useSaveCustomGuardrailsPolicy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const result = useMutation({
    mutationFn: async (request: CustomPolicyRequest) => {
      const res = await apiClient.put('/chat/api/v1/policies/custom', request);
      if (!res.ok) throw new Error(res.error || 'Failed to save custom policy');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: guardrailsQueryKeys.all });
      toast({
        title: 'Custom Policy Saved',
        description: 'Your custom policy has been saved successfully',
        variant: 'success',
        duration: 4000,
      });
    },
    onError: err => {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Unable to save custom policy',
        variant: 'destructive',
        duration: 5000,
      });
    },
  });

  return { saveCustomPolicy: result.mutateAsync, isPending: result.isPending };
}
