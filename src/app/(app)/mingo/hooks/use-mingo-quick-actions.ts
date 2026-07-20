'use client';

import { featureFlags } from '@/lib/feature-flags';
import { useAdminAiConfig } from '../../settings/ai-settings/hooks/use-agent-ai-config';
import { useHubDefaultQuickActions } from '../../settings/ai-settings/hooks/use-hub-default-quick-actions';
import type { AiQuickAction } from '../../settings/ai-settings/types/ai-settings';

/**
 * Mingo quick actions for the chat's empty-state chip row.
 *
 * Source follows the ADMIN config's `quickActionsIsDefault`: on → the OpenFrame
 * defaults fetched from the Product Hub (`agent-mingo` public config via the
 * gateway's `/chat/content/**` proxy); off → the org's customized actions from
 * the tenant BE — the same record the AI Settings "Mingo AI Chat" tab edits.
 * Gated by the same `mingo-ai-chat-settings` flag that gates that tab, so the
 * feature toggles together (and the queries stay idle when off).
 */
export function useMingoQuickActions(): AiQuickAction[] {
  const enabled = featureFlags.mingoAiChatSettings.enabled();
  const { config } = useAdminAiConfig({ enabled });
  const isDefault = config?.quickActionsIsDefault ?? true;
  const hubDefaults = useHubDefaultQuickActions('mingo', { enabled: enabled && isDefault });

  if (!enabled) return [];
  return isDefault ? hubDefaults.actions : (config?.quickActions ?? []);
}
