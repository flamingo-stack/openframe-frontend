/**
 * View-models for the AI settings two-collection model (keep in sync with
 * ai-settings.graphqls):
 *  - AgentAiConfig — AI logic, tenant-wide per agent (CLIENT / ADMIN).
 *  - ClientView    — the client assistant's appearance (tenant-default + per-org override).
 */

import type { AIProvider } from '@/generated/schema-enums';

export type { AIProvider };
export type ApplicationTheme = 'DARK' | 'LIGHT' | 'SYSTEM';
export type AnswerStyle = 'SHORT' | 'STANDARD' | 'DETAILED' | 'CUSTOM';

/** Which assistant a config belongs to. CLIENT = customer-facing (Fae), ADMIN = Mingo. */
export type AgentType = 'CLIENT' | 'ADMIN';

export interface AiImage {
  id?: string;
  imageUrl: string;
  hash?: string;
}

export interface AiQuickAction {
  id: string;
  name: string;
  instructions: string;
  /**
   * Optional glyph, present only on Product Hub defaults (the hub agent config
   * carries `iconName`/`iconUrl`/`iconProps`). Tenant customs from the BE have
   * none yet. Rendered on the CHAT chip only - the settings editor omits it,
   * since edit mode can't persist icons back to the BE (SVG-icons follow-up).
   */
  iconName?: string | null;
  iconUrl?: string | null;
  iconProps?: Record<string, unknown> | null;
}

export interface AiQuickActionInput {
  id?: string;
  name: string;
  instructions: string;
}

/** AI logic for one agent, tenant-wide (no per-organization override). */
export interface AgentAiConfig {
  id: string;
  agentType: AgentType;
  llmProvider: AIProvider;
  providerModel: string;
  answerStyle: AnswerStyle | null;
  customPrompt: string | null;
  /** True → `quickActions` are the OpenFrame defaults (Product Hub, BE-resolved); false → org customs. */
  quickActionsIsDefault: boolean;
  quickActions: AiQuickAction[];
  createdAt: string;
  updatedAt: string | null;
}

/** AI logic input. The target agent (CLIENT/ADMIN) is chosen by the mutation, not this input. */
export interface AgentAiConfigInput {
  llmProvider?: AIProvider;
  providerModel?: string;
  answerStyle?: AnswerStyle;
  customPrompt?: string;
  quickActionsIsDefault?: boolean;
  quickActions?: AiQuickActionInput[];
}

/** Client assistant appearance. `organizationId === null` is the tenant-wide default. */
export interface ClientView {
  id: string;
  organizationId: string | null;
  assistantName: string;
  assistantAvatar: AiImage | null;
  applicationTheme: ApplicationTheme;
  accentColor: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ClientViewInput {
  assistantName?: string;
  applicationTheme?: ApplicationTheme;
  accentColor?: string;
}

/**
 * Fallbacks used when the backend has no record yet (query returns null). The
 * empty `id` signals "not persisted" — the first save creates it.
 */
export function getDefaultAgentAiConfig(agentType: AgentType): AgentAiConfig {
  return {
    id: '',
    agentType,
    llmProvider: 'ANTHROPIC',
    providerModel: '',
    answerStyle: 'STANDARD',
    customPrompt: null,
    quickActionsIsDefault: true,
    quickActions: [],
    createdAt: '',
    updatedAt: null,
  };
}

export function getDefaultClientView(organizationId: string | null = null): ClientView {
  return {
    id: '',
    organizationId,
    assistantName: 'AI',
    assistantAvatar: null,
    applicationTheme: 'DARK',
    accentColor: '#F357BB',
    createdAt: '',
    updatedAt: null,
  };
}
