'use client';

import { InfoCircleIcon, PenEditIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button, EntityImage, LoadError, Skeleton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import { useRouter } from 'next/navigation';
import { AiSettingsOverview } from '@/app/(app)/settings/ai-settings/components/ai-settings-overview';
import { ASSISTANT_QUICK_ACTIONS_CONFIG } from '@/app/(app)/settings/ai-settings/components/ai-settings-quick-actions';
import { AiSettingsPreviews } from '@/app/(app)/settings/ai-settings/components/previews/ai-settings-previews';
import { useClientAiConfig } from '@/app/(app)/settings/ai-settings/hooks/use-agent-ai-config';
import { useClientView } from '@/app/(app)/settings/ai-settings/hooks/use-client-view';
import { useHubDefaultQuickActions } from '@/app/(app)/settings/ai-settings/hooks/use-hub-default-quick-actions';
import { useOrganizationClientAiConfig } from '@/app/(app)/settings/ai-settings/hooks/use-organization-ai-config';
import { getProviderModelLabel, useSupportedModels } from '@/app/(app)/settings/ai-settings/hooks/use-supported-models';
import {
  type AgentAiConfig,
  type AiQuickAction,
  getDefaultAgentAiConfig,
  getDefaultClientView,
} from '@/app/(app)/settings/ai-settings/types/ai-settings';
import { APPLICATION_THEME_LABEL } from '@/app/(app)/settings/ai-settings/utils/ai-settings-display';
import { InfoCell } from '@/app/components/shared/info-cell';
import { featureFlags } from '@/lib/feature-flags';
import { getFullImageUrl } from '@/lib/image-url';
import { routes } from '@/lib/routes';

interface CustomerCustomAiAssistantTabProps {
  organizationId: string;
}

/**
 * Positional name+instructions equality. Quick actions carry no id that's stable
 * across the override snapshot, and the org config exposes no "is default" flag
 * (see organization-ai-settings.graphqls), so "custom vs inherited" can only be
 * derived by comparing the effective list against the tenant default's.
 */
function sameQuickActions(a: AiQuickAction[], b: AiQuickAction[]): boolean {
  return a.length === b.length && a.every((x, i) => x.name === b[i].name && x.instructions === b[i].instructions);
}

/**
 * Read-only "Customer AI Configuration" tab on the customer details page.
 * `customer-ai-configuration` switches the presentation: off (default) → the
 * legacy appearance-only view (pre-session); on → the full overview that
 * mirrors the global AI settings CLIENT tab. Editing happens on /customers/edit.
 */
export function CustomerCustomAiAssistantTab({ organizationId }: CustomerCustomAiAssistantTabProps) {
  return featureFlags.customerAiConfiguration.enabled() ? (
    <CustomerAiConfigurationReadOnly organizationId={organizationId} />
  ) : (
    <CustomerAiAppearanceReadOnly organizationId={organizationId} />
  );
}

/**
 * New flow: the full AiSettingsOverview (customer card + previews + quick
 * actions), fed with the customer's EFFECTIVE values — the org overrides where
 * present, the tenant defaults otherwise. Always shown (like the guardrails
 * tab): when the customer inherits everything, a banner surfaces that and links
 * to the tenant defaults.
 */
function CustomerAiConfigurationReadOnly({ organizationId }: CustomerCustomAiAssistantTabProps) {
  const router = useRouter();
  const { view: orgView, isLoading: isViewLoading } = useClientView(organizationId);
  const { view: defaultView } = useClientView(null);
  const {
    config: orgConfig,
    isLoading: isConfigLoading,
    error: configError,
    refetch: refetchConfig,
  } = useOrganizationClientAiConfig(organizationId);
  const { modelsByProvider } = useSupportedModels();
  // OpenFrame default quick actions from the Product Hub (the BE stores only
  // customs), shown when the customer inherits the default action set — same
  // source the settings CLIENT tab uses. Gated by the customization flag that
  // governs the quick-actions section inside AiSettingsOverview.
  const hubDefaults = useHubDefaultQuickActions(ASSISTANT_QUICK_ACTIONS_CONFIG.agentSlug, {
    enabled: featureFlags.customerAiAssistantSettings.enabled(),
  });
  // Tenant CLIENT default config — the source of truth for what an inheriting
  // customer's quick actions are (and whether they're OpenFrame's set or the
  // tenant's own customs). The org config alone can't tell those apart.
  const { config: clientAiConfig, isLoading: isClientConfigLoading } = useClientAiConfig({
    enabled: featureFlags.customerAiAssistantSettings.enabled(),
  });

  if (isViewLoading || isConfigLoading || isClientConfigLoading || hubDefaults.loading) {
    return (
      <div className="flex flex-col gap-[var(--spacing-system-l)]">
        <Skeleton className="h-16 w-full rounded-md" />
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

  // Fully inheriting = no appearance override AND the AI logic inherits.
  const inheritsDefault = !orgView && (orgConfig?.inheritDefault ?? true);
  const effectiveView = orgView ?? defaultView ?? getDefaultClientView(organizationId);
  // The tenant CLIENT default's effective quick actions — what a customer that
  // inherits actually runs. null quickActions / quickActionsIsDefault → the
  // built-in MPH set.
  const tenantUsesMph = clientAiConfig?.quickActionsIsDefault ?? true;
  const tenantDefaultQuickActions = tenantUsesMph
    ? hubDefaults.actions
    : (clientAiConfig?.quickActions ?? hubDefaults.actions);
  // When the AI config inherits, the applied actions are the tenant default's —
  // show THOSE, not orgConfig.quickActions, which can still echo this customer's
  // old override snapshot (view would then disagree with what's applied). With an
  // override, the org's own self-contained list is what runs.
  const aiConfigInherits = orgConfig?.inheritDefault ?? true;
  const quickActions = aiConfigInherits ? tenantDefaultQuickActions : (orgConfig?.quickActions ?? hubDefaults.actions);
  // No org-level "is default" flag exists (see organization-ai-settings.graphqls),
  // so custom-vs-default is decided by comparing the shown list to the tenant
  // default's — inheriting matches by construction.
  const usesGlobalDefault = sameQuickActions(quickActions, tenantDefaultQuickActions);
  // Only when the effective list is OpenFrame's built-in set does the shared
  // "OpenFrame …" header + "curated by OpenFrame" banner apply.
  const isOpenFrameSet = usesGlobalDefault && tenantUsesMph;

  // AiSettingsOverview consumes the tenant-level AgentAiConfig shape; project
  // the effective org values onto it (nullable fields fall back like the
  // global screen's defaults).
  const aiConfig: AgentAiConfig = {
    ...getDefaultAgentAiConfig('CLIENT'),
    llmProvider: orgConfig?.llmProvider ?? 'ANTHROPIC',
    providerModel: orgConfig?.providerModel ?? '',
    answerStyle: orgConfig?.answerStyle ?? null,
    customPrompt: orgConfig?.customPrompt ?? null,
    quickActionsIsDefault: isOpenFrameSet,
    quickActions,
  };

  // Banner: OpenFrame set keeps the shared "curated by OpenFrame" copy; a list
  // matching the (customized) tenant default reads as inherited; anything else
  // is this customer's own set.
  const quickActionsBanner = isOpenFrameSet
    ? undefined
    : usesGlobalDefault
      ? { value: 'Using default quick actions', label: 'Inherited from your global AI-Assistant configuration.' }
      : { value: 'Using custom actions', label: 'These quick actions were configured for this customer.' };

  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      {inheritsDefault && (
        <div className="bg-ods-card border border-ods-border rounded-md flex flex-col md:flex-row md:items-center gap-[var(--spacing-system-s)] p-[var(--spacing-system-s)]">
          <div className="flex items-center gap-[var(--spacing-system-s)] flex-1 min-w-0">
            <InfoCircleIcon className="size-6 text-ods-text-primary shrink-0" />
            <div className="flex flex-col min-w-0">
              <p className="text-h4 text-ods-text-primary">Using default AI-Assistant configuration</p>
              <p className="text-h6 text-ods-text-secondary">
                Inherits all AI-Assistant settings from your global configuration.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push(routes.settings.aiSettings({ tab: 'customer', edit: true }))}
            leftIcon={<PenEditIcon className="size-5 text-ods-text-secondary" />}
            className="shrink-0 self-start md:self-auto"
          >
            Edit Default Configuration
          </Button>
        </div>
      )}

      <AiSettingsOverview
        aiConfig={aiConfig}
        view={effectiveView}
        providerModelLabel={getProviderModelLabel(modelsByProvider, aiConfig.llmProvider, aiConfig.providerModel)}
        quickActions={quickActions}
        quickActionsBanner={quickActionsBanner}
      />
    </div>
  );
}

const CELL = 'flex items-center gap-2 min-h-14 md:min-h-20 px-3 md:px-4 py-3 md:py-4';

/**
 * Legacy flow: read-only view of the customer's custom AI-Assistant appearance
 * (org-scoped ClientView override) — assistant name, avatar, theme, accent.
 */
function CustomerAiAppearanceReadOnly({ organizationId }: CustomerCustomAiAssistantTabProps) {
  // Shares the react-query cache with the parent's visibility check.
  const { view, isLoading } = useClientView(organizationId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[var(--spacing-system-l)]">
        <Skeleton className="h-40 w-full rounded-md" />
        <Skeleton className="h-64 w-full rounded-md" />
      </div>
    );
  }

  // The tab is only mounted when an override exists, but guard defensively.
  if (!view) {
    return null;
  }

  const avatarUrl = getFullImageUrl(view.assistantAvatar?.imageUrl, view.assistantAvatar?.hash);

  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      <div className="rounded-md border border-ods-border bg-ods-card">
        <div className={cn(CELL, 'border-b border-ods-border')}>
          {/* EntityImage defaults to size-[52px] md:size-[60px]; override both
              breakpoints so the avatar stays 40×40. */}
          <EntityImage src={avatarUrl} alt={view.assistantName} className="size-10 md:size-10 rounded-full" />
          <InfoCell value={view.assistantName} label="Custom Assistant Name" />
        </div>

        <div className="grid grid-cols-2">
          <div className={CELL}>
            <InfoCell value={APPLICATION_THEME_LABEL[view.applicationTheme]} label="Custom Application Theme" />
          </div>
          <div className={CELL}>
            <InfoCell value={view.accentColor?.toUpperCase()} label="Custom Accent Color" />
          </div>
        </div>
      </div>

      <AiSettingsPreviews
        assistantName={view.assistantName}
        avatarUrl={avatarUrl}
        accentColor={view.accentColor}
        theme={view.applicationTheme}
      />
    </div>
  );
}
