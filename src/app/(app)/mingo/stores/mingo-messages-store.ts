import type { TokenUsageData } from '@flamingo-stack/openframe-frontend-core';
import type { ChatStreamEvent } from '@flamingo-stack/openframe-frontend-core/chat-protocol';
import {
  type ChatApprovalStatus,
  type ChatStreamReducer,
  createChatDialogStore,
  DEFAULT_DIALOG_SIDE,
  type StreamingPhase,
} from '@flamingo-stack/openframe-frontend-core/components/chat';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createReducerMirror, toUnifiedMessage } from '@/lib/chat-stream-thread';
import { featureFlags } from '@/lib/feature-flags';
import type { DialogNode, Message } from '../types';

/**
 * Phase 4 of the chat unification: message ACCUMULATION lives in the lib's
 * `createChatDialogStore` reducers (one per dialogId, side 'main'). This
 * zustand store survives as persistence/cache + identity only — dialog
 * list, active id, unread counts, loading/pagination, per-dialog seq
 * bookkeeping — plus a converted READ MIRROR of each reducer's snapshot
 * (messages / streaming phase / streaming bubble id / token usage) so
 * existing selectors keep working unchanged. Thread commands (history
 * hydration, optimistic sends, welcome rows) delegate to the reducer.
 */

// ─── Lib reducer registry (module-level, outlives React) ────────────────────

export const mingoChatDialogStore = createChatDialogStore();

const MINGO_IDENTITY = { assistantName: 'Mingo', assistantType: 'mingo' as const };

const approvalHandlersByDialog = new Map<
  string,
  { onApprove?: (requestId?: string) => void | Promise<void>; onReject?: (requestId?: string) => void | Promise<void> }
>();

/** All reducer-mirror scaffolding (create-or-get, snapshot change detection,
 *  conversion cache, thread RMW, delta batching) lives in the shared
 *  `createReducerMirror` factory — this host supplies only the key mapping
 *  and the zustand patch. Mirror key = dialogId (side is always 'main'). */
const mirror = createReducerMirror<string>({
  store: mingoChatDialogStore,
  identityFor: dialogId => ({ dialogId, side: DEFAULT_DIALOG_SIDE, defaults: MINGO_IDENTITY }),
  options: dialogId => ({
    transport: 'nats',
    displayApprovalTypes: ['CLIENT', 'ADMIN'],
    batchApprovalsEnabled: featureFlags.batchApproval.enabled(),
    callbacks: {
      onApprove: id => approvalHandlersByDialog.get(dialogId)?.onApprove?.(id),
      onReject: id => approvalHandlersByDialog.get(dialogId)?.onReject?.(id),
    },
  }),
  onSnapshot: (dialogId, { messages, phase, streamingId, state: snap }) => {
    const usage = snap.dialogTokenUsage ?? null;
    useMingoMessagesStore.setState(state => {
      const newMessagesMap = new Map(state.messagesByDialog);
      newMessagesMap.set(dialogId, messages as Message[]);
      const newPhaseMap = new Map(state.phaseByDialog);
      newPhaseMap.set(dialogId, phase);
      const newStreamingMap = new Map(state.streamingIdByDialog);
      newStreamingMap.set(dialogId, streamingId);

      const patch: Partial<MingoMessagesStore> = {
        messagesByDialog: newMessagesMap,
        phaseByDialog: newPhaseMap,
        streamingIdByDialog: newStreamingMap,
      };
      if (usage && state.tokenUsageByDialog.get(dialogId) !== usage) {
        const newUsageMap = new Map(state.tokenUsageByDialog);
        newUsageMap.set(dialogId, usage as TokenUsageData);
        patch.tokenUsageByDialog = newUsageMap;
      }
      return patch;
    });
  },
});

/** Late-bind approve/reject handlers (stamped onto approval segments). */
export function setMingoApprovalHandlers(
  dialogId: string,
  handlers: {
    onApprove?: (requestId?: string) => void | Promise<void>;
    onReject?: (requestId?: string) => void | Promise<void>;
  },
): void {
  approvalHandlersByDialog.set(dialogId, handlers);
}

/** Apply one decoded stream event to a dialog's reducer, then mirror. */
export function applyMingoChatEvent(dialogId: string, event: ChatStreamEvent): void {
  mirror.apply(dialogId, event);
}

/** Run reducer commands (non-wire mutations) against a dialog, then mirror. */
export function mutateMingoDialog<T>(dialogId: string, fn: (reducer: ChatStreamReducer) => T): T {
  return mirror.mutate(dialogId, fn);
}

/** Read-modify-write on the app-shape thread, delegated to the reducer. */
function mutateThread(dialogId: string, op: (messages: Message[]) => Message[]): void {
  mirror.mutateThread(dialogId, current => op(current as Message[]));
}

function dropDialogCaches(dialogId: string): void {
  mirror.drop(dialogId);
  approvalHandlersByDialog.delete(dialogId);
}

// ─── Zustand store (persistence/cache + identity + read mirror) ─────────────

interface MingoMessagesStore {
  // Read mirror of the lib reducer state — key is dialogId
  messagesByDialog: Map<string, Message[]>;
  phaseByDialog: Map<string, StreamingPhase>;
  /** Id of the assistant bubble an open stream writes into (merge exemption). */
  streamingIdByDialog: Map<string, string | null>;
  tokenUsageByDialog: Map<string, TokenUsageData>;

  // Dialog state
  activeDialogId: string | null;
  dialogs: DialogNode[];

  unreadCounts: Map<string, number>;
  // Highest JetStream streamSeq observed per dialog. Persists across
  // DialogSubscription remounts.
  highestStreamSeqByDialog: Map<string, number>;

  // Loading states
  isLoadingDialog: boolean;
  isLoadingMessages: boolean;
  isCreatingDialog: boolean;

  // Error states
  dialogError: string | null;
  messagesError: string | null;

  // Pagination
  hasMoreMessages: boolean;
  messagesCursor: string | null;
  newestMessageCursor: string | null;

  // Core Actions
  setActiveDialogId: (dialogId: string | null) => void;
  setDialogs: (dialogs: DialogNode[]) => void;

  // Thread commands (delegate to the lib reducer)
  setMessages: (dialogId: string, messages: Message[]) => void;
  prependMessages: (dialogId: string, messages: Message[]) => void;
  prependWithBoundaryMerge: (
    dialogId: string,
    newMessages: Message[],
    boundaryMessageId?: string,
    boundaryUpdates?: Partial<Message>,
  ) => void;
  addMessage: (dialogId: string, message: Message) => void;
  updateMessage: (dialogId: string, messageId: string, updates: Partial<Message>) => void;
  removeMessage: (dialogId: string, messageId: string) => void;
  /** Cross-message approval flip (reducer accumulator + projection). */
  updateApprovalStatusInMessages: (
    dialogId: string,
    requestId: string,
    status: 'approved' | 'rejected',
    resolvedByName?: string | null,
  ) => void;
  getMessages: (dialogId: string) => Message[];
  removeWelcomeMessages: (dialogId: string) => void;

  // Typing / phase (delegates to the reducer's phase machine)
  setTyping: (dialogId: string, typing: boolean) => void;
  getTyping: (dialogId: string) => boolean;
  getStreamingId: (dialogId: string) => string | null;

  // Unread
  incrementUnread: (dialogId: string) => void;
  resetUnread: (dialogId: string) => void;
  getUnread: (dialogId: string) => number;

  // Token Usage
  setTokenUsage: (dialogId: string, data: TokenUsageData) => void;
  getTokenUsage: (dialogId: string) => TokenUsageData | null;

  // Stream sequence tracking
  recordHighestStreamSeq: (dialogId: string, seq: number) => void;
  getHighestStreamSeq: (dialogId: string) => number;

  // Utility Actions
  clearDialog: (dialogId: string) => void;
  resetAll: () => void;

  // Loading States
  setLoadingDialog: (loading: boolean) => void;
  setLoadingMessages: (loading: boolean) => void;
  setCreatingDialog: (creating: boolean) => void;

  // Error States
  setDialogError: (error: string | null) => void;
  setMessagesError: (error: string | null) => void;

  // Pagination
  setPagination: (hasMore: boolean, cursor: string | null, newestCursor: string | null) => void;
}

export const useMingoMessagesStore = create<MingoMessagesStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      messagesByDialog: new Map(),
      phaseByDialog: new Map(),
      streamingIdByDialog: new Map(),
      tokenUsageByDialog: new Map(),
      activeDialogId: null,
      dialogs: [],
      unreadCounts: new Map(),
      highestStreamSeqByDialog: new Map(),

      isLoadingDialog: false,
      isLoadingMessages: false,
      isCreatingDialog: false,

      dialogError: null,
      messagesError: null,

      hasMoreMessages: false,
      messagesCursor: null,
      newestMessageCursor: null,

      // Core Actions
      setActiveDialogId: (dialogId: string | null) => {
        set({ activeDialogId: dialogId });
      },

      setDialogs: (dialogs: DialogNode[]) => {
        set({ dialogs });
      },

      // Thread commands — the lib reducer owns the mutation semantics
      setMessages: (dialogId, messages) => {
        mutateMingoDialog(dialogId, r => r.setMessages(messages.map(m => toUnifiedMessage(m))));
      },

      prependMessages: (dialogId, messages) => {
        mutateMingoDialog(dialogId, r => r.prependMessages(messages.map(m => toUnifiedMessage(m))));
      },

      prependWithBoundaryMerge: (dialogId, newMessages, boundaryMessageId?, boundaryUpdates?) => {
        mutateThread(dialogId, current => {
          let messages = current;
          if (boundaryMessageId && boundaryUpdates) {
            const idx = messages.findIndex(m => m.id === boundaryMessageId);
            if (idx !== -1) {
              messages = [...messages];
              messages[idx] = { ...messages[idx], ...boundaryUpdates };
            }
          }
          return newMessages.length > 0 ? [...newMessages, ...messages] : messages;
        });
      },

      addMessage: (dialogId, message) => {
        mutateThread(dialogId, current => {
          const existingIndex = current.findIndex(m => m.id === message.id);
          if (existingIndex !== -1) {
            const updated = [...current];
            updated[existingIndex] = message;
            return updated;
          }
          return [...current, message];
        });
      },

      updateMessage: (dialogId, messageId, updates) => {
        mutateThread(dialogId, current => {
          const idx = current.findIndex(m => m.id === messageId);
          if (idx === -1) return current;
          const updated = [...current];
          updated[idx] = { ...updated[idx], ...updates };
          return updated;
        });
      },

      removeMessage: (dialogId, messageId) => {
        mutateThread(dialogId, current => {
          const filtered = current.filter(m => m.id !== messageId);
          return filtered.length === current.length ? current : filtered;
        });
      },

      updateApprovalStatusInMessages: (dialogId, requestId, status, resolvedByName?) => {
        mutateMingoDialog(dialogId, r => r.updateApprovalStatus(requestId, status, resolvedByName));
      },

      getMessages: (dialogId: string) => {
        return get().messagesByDialog.get(dialogId) || [];
      },

      removeWelcomeMessages: (dialogId: string) => {
        mutateThread(dialogId, current => {
          const filtered = current.filter(m => !m.id.startsWith('welcome-'));
          return filtered.length === current.length ? current : filtered;
        });
      },

      // Typing / phase
      setTyping: (dialogId, typing) => {
        mutateMingoDialog(dialogId, r => {
          if (typing) {
            // Only 'idle' upgrades to 'thinking' — an open stream keeps
            // ownership of the phase (mirrors the reducer's agent-busy rule).
            if (r.state.streamingPhase === 'idle') r.setPhase('thinking');
          } else {
            r.setPhase('idle');
          }
        });
      },

      getTyping: (dialogId: string) => {
        return (get().phaseByDialog.get(dialogId) ?? 'idle') !== 'idle';
      },

      getStreamingId: (dialogId: string) => {
        return get().streamingIdByDialog.get(dialogId) ?? null;
      },

      incrementUnread: (dialogId: string) => {
        set(state => {
          if (state.activeDialogId === dialogId) return state;

          const newMap = new Map(state.unreadCounts);
          const currentCount = newMap.get(dialogId) || 0;
          newMap.set(dialogId, currentCount + 1);
          return { unreadCounts: newMap };
        });
      },

      resetUnread: (dialogId: string) => {
        set(state => {
          const newMap = new Map(state.unreadCounts);
          newMap.set(dialogId, 0);
          return { unreadCounts: newMap };
        });
      },

      getUnread: (dialogId: string) => {
        return get().unreadCounts.get(dialogId) || 0;
      },

      setTokenUsage: (dialogId: string, data: TokenUsageData) => {
        set(state => {
          const newMap = new Map(state.tokenUsageByDialog);
          newMap.set(dialogId, data);
          return { tokenUsageByDialog: newMap };
        });
      },

      getTokenUsage: (dialogId: string) => {
        return get().tokenUsageByDialog.get(dialogId) || null;
      },

      recordHighestStreamSeq: (dialogId: string, seq: number) => {
        set(state => {
          const current = state.highestStreamSeqByDialog.get(dialogId) ?? 0;
          if (seq <= current) return state;
          const newMap = new Map(state.highestStreamSeqByDialog);
          newMap.set(dialogId, seq);
          return { highestStreamSeqByDialog: newMap };
        });
      },

      getHighestStreamSeq: (dialogId: string) => {
        return get().highestStreamSeqByDialog.get(dialogId) ?? 0;
      },

      clearDialog: (dialogId: string) => {
        dropDialogCaches(dialogId);
        set(state => {
          const newMessagesMap = new Map(state.messagesByDialog);
          const newPhaseMap = new Map(state.phaseByDialog);
          const newStreamingMap = new Map(state.streamingIdByDialog);
          const newUnreadMap = new Map(state.unreadCounts);
          const newTokenUsageMap = new Map(state.tokenUsageByDialog);
          const newHighestSeqMap = new Map(state.highestStreamSeqByDialog);

          newMessagesMap.delete(dialogId);
          newPhaseMap.delete(dialogId);
          newStreamingMap.delete(dialogId);
          newUnreadMap.delete(dialogId);
          newTokenUsageMap.delete(dialogId);
          newHighestSeqMap.delete(dialogId);

          return {
            messagesByDialog: newMessagesMap,
            phaseByDialog: newPhaseMap,
            streamingIdByDialog: newStreamingMap,
            unreadCounts: newUnreadMap,
            tokenUsageByDialog: newTokenUsageMap,
            highestStreamSeqByDialog: newHighestSeqMap,
          };
        });
      },

      resetAll: () => {
        for (const dialogId of mirror.knownKeys()) dropDialogCaches(dialogId);
        set({
          messagesByDialog: new Map(),
          phaseByDialog: new Map(),
          streamingIdByDialog: new Map(),
          tokenUsageByDialog: new Map(),
          activeDialogId: null,
          dialogs: [],
          unreadCounts: new Map(),
          highestStreamSeqByDialog: new Map(),
          isLoadingDialog: false,
          isLoadingMessages: false,
          isCreatingDialog: false,
          dialogError: null,
          messagesError: null,
          hasMoreMessages: false,
          messagesCursor: null,
          newestMessageCursor: null,
        });
      },

      setLoadingDialog: (loading: boolean) => {
        set({ isLoadingDialog: loading });
      },

      setLoadingMessages: (loading: boolean) => {
        set({ isLoadingMessages: loading });
      },

      setCreatingDialog: (creating: boolean) => {
        set({ isCreatingDialog: creating });
      },

      // Error States
      setDialogError: (error: string | null) => {
        set({ dialogError: error });
      },

      setMessagesError: (error: string | null) => {
        set({ messagesError: error });
      },

      // Pagination
      setPagination: (hasMore: boolean, cursor: string | null, newestCursor: string | null) => {
        set({
          hasMoreMessages: hasMore,
          messagesCursor: cursor,
          newestMessageCursor: newestCursor,
        });
      },
    }),
    {
      name: 'mingo-messages-store',
    },
  ),
);

/** Merge the app's approval-status map into a dialog reducer's lookup
 *  (used when replaying APPROVAL_REQUEST chunks). Merge — never replace —
 *  so statuses the reducer learned from realtime events survive. */
export function syncMingoApprovalStatuses(dialogId: string, statuses: Record<string, string>): void {
  mutateMingoDialog(dialogId, r =>
    r.syncApprovalStatuses({
      ...r.state.approvalStatuses,
      ...(statuses as Record<string, ChatApprovalStatus>),
    }),
  );
}
