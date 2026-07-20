import type { TokenUsageData } from '@flamingo-stack/openframe-frontend-core';
import {
  type ChatStreamReducer,
  createChatDialogStore,
  DEFAULT_DIALOG_SIDE,
  type StreamingPhase,
} from '@flamingo-stack/openframe-frontend-core/components/chat';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  type BoundMirror,
  createReducerMirror,
  type NatsMirrorHandlers,
  natsMirrorOptions,
  toUnifiedMessage,
} from '@/lib/chat-stream-thread';
import { featureFlags } from '@/lib/feature-flags';
import { useAuthStore } from '@/stores';
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

const MINGO_IDENTITY = { assistantName: 'Mingo', assistantType: 'mingo' as const };

const handlersByDialog = new Map<string, NatsMirrorHandlers>();

/** Creation options for a dialog's reducer. Shared by the mirror (which
 *  pre-creates with them) and the STORE-level default below. */
const mingoReducerOptions = natsMirrorOptions<string>(
  dialogId => handlersByDialog.get(dialogId),
  () => featureFlags.batchApproval.enabled(),
  () => useAuthStore.getState().user?.id,
);

/** All reducer-mirror scaffolding (create-or-get, retention, snapshot change
 *  detection, conversion cache, thread RMW, delta batching, approval-status
 *  merge) lives in the shared `createReducerMirror` factory, and the NATS
 *  options block in `natsMirrorOptions` — this host supplies only the key
 *  mapping and the zustand patch. Mirror key = dialogId (side is always
 *  'main'); no `siblingKeys` — mingo dialogs are independent, so nothing
 *  projects across keys. */
const mirror = createReducerMirror<string>({
  // The mirror builds the store so it can wire its own `onEvict`; this host
  // adds `defaultCreateOptions`, which closes the store-level hole: a reducer
  // first materialized by a bare `apply()` / `mutate()` (no per-call options)
  // would otherwise be built WITHOUT `ownEchoIncludesAdmin` / `selfUserId` and
  // keep those semantics missing for its whole life — creation options are
  // consulted once — so every message this user sends would render twice. The
  // mirror happens to always pre-create with options today; this makes the
  // guarantee structural rather than incidental. Mirror key = dialogId = the
  // store's `dialogId`, so the mapping back is the identity.
  createStore: storeOptions => createChatDialogStore({ ...storeOptions, defaultCreateOptions: mingoReducerOptions }),
  identityFor: dialogId => ({ dialogId, side: DEFAULT_DIALOG_SIDE, defaults: MINGO_IDENTITY }),
  options: mingoReducerOptions,
  onSnapshot: (dialogId, { messages, phase, streamingId, state: snap }) => {
    const usage = snap.dialogTokenUsage ?? null;
    useMingoMessagesStore.setState(state => {
      const newMessagesMap = new Map(state.messagesByDialog);
      newMessagesMap.set(dialogId, messages);
      const newPhaseMap = new Map(state.phaseByDialog);
      newPhaseMap.set(dialogId, phase);
      const newStreamingMap = new Map(state.streamingIdByDialog);
      newStreamingMap.set(dialogId, streamingId);

      const patch: Partial<MingoMessagesStore> = {
        messagesByDialog: newMessagesMap,
        phaseByDialog: newPhaseMap,
        streamingIdByDialog: newStreamingMap,
      };
      // ADDITIVE ON PURPOSE: a post-eviction re-seed restores `messages` only,
      // so the replacement reducer's first snapshot carries no token usage. A
      // blanking write here would drop counters the host still legitimately
      // holds — an empty/absent `usage` must never clear `tokenUsageByDialog`.
      if (usage && state.tokenUsageByDialog.get(dialogId) !== usage) {
        const newUsageMap = new Map(state.tokenUsageByDialog);
        newUsageMap.set(dialogId, usage as TokenUsageData);
        patch.tokenUsageByDialog = newUsageMap;
      }
      return patch;
    });
  },
});

/** The dialog store behind this host's reducers (built by the mirror). */
export const mingoChatDialogStore = mirror.store;

/** Late-bind approve/reject + model-badge handlers (approve/reject are
 *  stamped onto approval segments; onMetadata rides the reducer effect). */
export function setMingoChatHandlers(dialogId: string, handlers: NatsMirrorHandlers): void {
  // MERGE, don't replace: approve/reject and `onMetadata` are registered by
  // separate effects, so a wholesale set would let the later one clobber the
  // earlier one.
  handlersByDialog.set(dialogId, { ...handlersByDialog.get(dialogId), ...handlers });
}

/** Pre-curried `{ apply, mutate, mergeApprovalStatuses }` for one dialog.
 *  Identity is stable per dialogId (memoized inside the mirror). */
export function bindMingoDialog(dialogId: string): BoundMirror {
  return mirror.bind(dialogId);
}

/** Run reducer commands (non-wire mutations) against a dialog, then mirror. */
export function mutateMingoDialog<T>(dialogId: string, fn: (reducer: ChatStreamReducer) => T): T {
  return mirror.mutate(dialogId, fn);
}

function dropDialogCaches(dialogId: string): void {
  mirror.drop(dialogId);
  handlersByDialog.delete(dialogId);
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
  /** Optimistic local send. Routed through the reducer so IT owns own-echo
   *  suppression (text-matched, one-shot) — a blanket "drop every echo with
   *  my user id" would also hide this user's sends from other tabs. */
  pushOptimisticSend: (dialogId: string, message: Message) => void;
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
        // The active dialog is the only DISPLAYED thread, so it is the only
        // one pinned against the reducer LRU. Every other visited dialog
        // falls back to protection-by-recency (plus the store's own
        // mid-stream guard); if one is evicted, the store PUBLISHES that via
        // `onEvict` and the mirror parks the key's last converted thread,
        // re-seeding the replacement reducer with it on the next `getReducer`.
        mirror.setActiveKeys(dialogId ? [dialogId] : []);
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
        mirror.prependWithBoundaryMerge(dialogId, newMessages, boundaryMessageId, boundaryUpdates);
      },

      addMessage: (dialogId, message) => {
        mirror.upsertMessage(dialogId, message);
      },

      pushOptimisticSend: (dialogId, message) => {
        mirror.pushOptimisticSend(dialogId, message);
      },

      updateMessage: (dialogId, messageId, updates) => {
        mirror.patchMessage(dialogId, messageId, updates);
      },

      removeMessage: (dialogId, messageId) => {
        mirror.removeMessage(dialogId, messageId);
      },

      updateApprovalStatusInMessages: (dialogId, requestId, status, resolvedByName?) => {
        mutateMingoDialog(dialogId, r => r.updateApprovalStatus(requestId, status, resolvedByName));
      },

      getMessages: (dialogId: string) => {
        return get().messagesByDialog.get(dialogId) || [];
      },

      removeWelcomeMessages: (dialogId: string) => {
        mirror.mutateThread(dialogId, current => {
          const filtered = current.filter(m => !m.id.startsWith('welcome-'));
          return filtered.length === current.length ? current : filtered;
        });
      },

      // Typing / phase
      setTyping: (dialogId, typing) => {
        mirror.setTyping(dialogId, typing);
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

      // Routed through the REDUCER, not written straight into the mirror map:
      // the reducer's `onTokenUsage` frames already own `dialogTokenUsage`, so
      // a direct `set` here made two writers for one field with no stated
      // precedence — a persisted seed landing after a live frame would silently
      // roll the counters back. Going through the reducer means the same
      // last-write-wins rule applies to both, and the mirror stays the only
      // writer of `tokenUsageByDialog`.
      setTokenUsage: (dialogId: string, data: TokenUsageData) => {
        mutateMingoDialog(dialogId, r => r.setDialogTokenUsage(data));
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
        // Nothing is displayed after a reset — release any surviving pin.
        mirror.setActiveKeys([]);
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
