'use client';

import { featureFlags } from '@/lib/feature-flags';
import { getFullImageUrl } from '@/lib/image-url';
import type { AgentAiConfig, AiQuickAction, ClientView } from '../types/ai-settings';
import { AiSettingsCustomerCard } from './ai-settings-customer-card';
import {
  AiSettingsQuickActionsSection,
  ASSISTANT_QUICK_ACTIONS_CONFIG,
  type QuickActionsBannerCopy,
} from './ai-settings-quick-actions';
import { AiSettingsPreviews } from './previews/ai-settings-previews';

interface AiSettingsOverviewProps {
  /** AI logic config for the active agent. */
  aiConfig?: AgentAiConfig;
  /** Client view (appearance). Present only for the CLIENT tab. */
  view?: ClientView;
  /** Display label for the provider model (resolved via useSupportedModels). */
  providerModelLabel?: string;
  /** Renders the quick actions list when provided. */
  quickActions?: AiQuickAction[];
  /**
   * Overrides the quick-actions source banner. The per-customer view passes it
   * because there the banner must read "inherited from the global config", not
   * the tenant-screen "your custom actions" wording.
   */
  quickActionsBanner?: QuickActionsBannerCopy;
}

/**
 * Shared read-only view for the CLIENT (customer) AI settings tab: the full
 * customer card plus previews. The ADMIN/Mingo tab renders its own read-only
 * view (AiSettingsAdminCard + quick actions table).
 */
export function AiSettingsOverview({
  aiConfig,
  view,
  providerModelLabel,
  quickActions,
  quickActionsBanner,
}: AiSettingsOverviewProps) {
  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      {aiConfig && view && (
        <>
          <AiSettingsCustomerCard aiConfig={aiConfig} view={view} providerModelLabel={providerModelLabel} />
          {/* Previews are part of the not-yet-released AI customization. */}
          {featureFlags.customerAiAssistantSettings.enabled() && (
            <AiSettingsPreviews
              assistantName={view.assistantName}
              avatarUrl={getFullImageUrl(view.assistantAvatar?.imageUrl, view.assistantAvatar?.hash)}
              accentColor={view.accentColor}
              theme={view.applicationTheme}
              providerName={aiConfig.llmProvider}
              modelDisplayName={providerModelLabel ?? aiConfig.providerModel}
            />
          )}
        </>
      )}
      {/* Quick actions are part of the not-yet-released AI customization. */}
      {featureFlags.customerAiAssistantSettings.enabled() && quickActions && aiConfig && (
        <AiSettingsQuickActionsSection
          title="Assistant Quick Actions"
          actions={quickActions}
          isDefault={aiConfig.quickActionsIsDefault}
          agentConfig={ASSISTANT_QUICK_ACTIONS_CONFIG}
          bannerCopy={quickActionsBanner}
        />
      )}
    </div>
  );
}
