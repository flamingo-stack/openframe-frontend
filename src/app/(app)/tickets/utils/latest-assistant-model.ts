import {
  getModelLabelByName,
  type SupportedModelsByProvider,
} from '@/app/(app)/settings/ai-settings/hooks/use-supported-models';
import type { MessagePage } from '../services/ticket-service.types';
import type { AssistantOwner } from '../types/dialog.types';

export interface AssistantModelInfo {
  provider: string;
  displayName: string;
}

/**
 * Model provenance of the newest assistant message across the fetched history
 * pages (pages and rows are newest-first). Ground truth for the "current
 * model" badge on reload — per-chat, unlike the tenant-wide config.
 */
export function latestAssistantModel(
  pages: MessagePage[] | undefined,
  modelsByProvider: SupportedModelsByProvider | undefined,
): AssistantModelInfo | null {
  if (!pages) return null;

  for (const page of pages) {
    for (const message of page.messages) {
      const owner = message.owner as Partial<AssistantOwner> | undefined;
      if (owner?.type === 'ASSISTANT' && owner.model && owner.providerName) {
        return { provider: owner.providerName, displayName: getModelLabelByName(modelsByProvider, owner.model) };
      }
    }
  }

  return null;
}
