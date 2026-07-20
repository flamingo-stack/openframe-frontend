/**
 * Shared shape bridge between the app's legacy chat `Message` (content:
 * string | MessageSegment[]) and the lib master reducer's
 * `UnifiedChatMessage` (content: string, segments?: MessageSegment[]).
 *
 * Phase 4 of the chat unification: the lib's `createChatDialogStore`
 * reducers own ALL message accumulation; the app stores keep only a
 * converted read-mirror. Conversion is cached BIDIRECTIONALLY by object
 * identity so the reducer's referential-stability contract survives the
 * round-trip — an untouched reducer message always converts back to the
 * SAME app message instance, which is what keeps the per-message React
 * memoization (and the history merge's reference reuse) intact.
 */

import {
  type Message as ChatMessage,
  extractIncompleteMessageState,
  type MessageSegment,
} from '@flamingo-stack/openframe-frontend-core';
import type { ChatStreamEvent } from '@flamingo-stack/openframe-frontend-core/chat-protocol';
import type {
  AssistantType,
  ChatDialogSide,
  ChatDialogStore,
  ChatReducerState,
  ChatStreamReducer,
  ChatStreamReducerOptions,
  InitializeExtras,
  StreamingPhase,
  UnifiedChatMessage,
} from '@flamingo-stack/openframe-frontend-core/components/chat';

export interface ThreadIdentityDefaults {
  assistantName?: string;
  assistantType?: AssistantType;
}

const toUnifiedCache = new WeakMap<object, UnifiedChatMessage>();
const toAppCache = new WeakMap<object, ChatMessage>();

/** App `Message` → reducer `UnifiedChatMessage` (segments field). */
export function toUnifiedMessage(message: ChatMessage): UnifiedChatMessage {
  const cached = toUnifiedCache.get(message);
  if (cached) return cached;

  const { content, ...rest } = message;
  // Double cast is load-bearing, NOT laziness: the two shapes are genuinely
  // incompatible on `role` — app `Message.role` admits `'error'`, which
  // `UnifiedChatMessage.role` ('user' | 'assistant') does not. `rest` also
  // carries the app-only `assistantType`, which the round-trip must preserve
  // (see `fromUnifiedMessage`) even though the reducer never reads it.
  const unified = (Array.isArray(content)
    ? { ...rest, content: '', segments: content }
    : { ...rest, content: content ?? '' }) as unknown as UnifiedChatMessage;

  toUnifiedCache.set(message, unified);
  // Round-trip stability: reading this row back yields the ORIGINAL object.
  toAppCache.set(unified, message);
  return unified;
}

/** Reducer `UnifiedChatMessage` → app `Message` (content array). Rows the
 *  reducer created itself (turn bubbles, participant rows) get the side's
 *  assistant identity + a stable timestamp stamped at first conversion. */
export function fromUnifiedMessage(unified: UnifiedChatMessage, defaults: ThreadIdentityDefaults): ChatMessage {
  const cached = toAppCache.get(unified);
  if (cached) return cached;

  const { segments, content, ...rest } = unified as UnifiedChatMessage & {
    segments?: MessageSegment[];
  };
  const source = rest as Partial<ChatMessage>;
  const message = {
    ...rest,
    content: (segments ?? content ?? '') as ChatMessage['content'],
    timestamp: source.timestamp ?? new Date(),
    ...(unified.role === 'assistant'
      ? {
          name: unified.name ?? defaults.assistantName,
          assistantType: source.assistantType ?? defaults.assistantType,
        }
      : {}),
  } as ChatMessage;

  toAppCache.set(unified, message);
  toUnifiedCache.set(message, unified);
  return message;
}

/**
 * Incomplete-turn tail of a hydrated thread → the reducer's
 * `initializeWithState` extras (accumulator seed: pending approvals +
 * executing tools + trailing segments). Collects the trailing ASSISTANT
 * run (consecutive assistant rows), exactly like the pre-Phase-4 per-side
 * `incompleteState` memos did.
 *
 * TODO(lib-export): replace this local copy with the lib's run-collecting
 * `extractIncompleteTailState` once it ships —
 *   import { extractIncompleteTailState } from '@flamingo-stack/openframe-frontend-core/components/chat'
 * — so the NATS adapter and this app share one implementation. Not yet
 * exported by the pinned lib, hence the duplicate.
 */
export function computeIncompleteTailState(messages: readonly ChatMessage[]): InitializeExtras | undefined {
  const tail: MessageSegment[] = [];
  let lastAssistantId = '';
  let lastAssistantTimestamp = new Date();

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') break;
    if (!lastAssistantId) {
      lastAssistantId = msg.id;
      lastAssistantTimestamp = msg.timestamp || new Date();
    }
    if (Array.isArray(msg.content)) {
      tail.unshift(...msg.content);
    } else if (typeof msg.content === 'string' && msg.content) {
      tail.unshift({ type: 'text', text: msg.content } as MessageSegment);
    }
  }

  if (!tail.length || !lastAssistantId) return undefined;

  return (
    extractIncompleteMessageState({
      id: lastAssistantId,
      role: 'assistant',
      content: tail,
      name: 'assistant',
      timestamp: lastAssistantTimestamp,
    } as Parameters<typeof extractIncompleteMessageState>[0]) ?? undefined
  );
}

// ─── Reducer → store mirror factory ─────────────────────────────────────────

/** One converted read-mirror snapshot of a reducer side. */
export interface ReducerMirrorSnapshot {
  /** App-shape thread. Reference-stable while the reducer thread is untouched. */
  messages: ChatMessage[];
  phase: StreamingPhase;
  /** Id of the assistant bubble an open stream writes into (merge exemption). */
  streamingId: string | null;
  /** Raw reducer snapshot, for host-specific fields (token usage, approvals). */
  state: ChatReducerState;
}

export interface ReducerMirrorConfig<K extends string> {
  store: ChatDialogStore;
  /** Map a host mirror key to its (dialogId, side) + assistant identity. */
  identityFor: (key: K) => {
    dialogId: string;
    side: ChatDialogSide;
    defaults: ThreadIdentityDefaults;
  };
  /** Consulted ONLY when a (dialogId, side) reducer is first created. */
  options: (key: K) => ChatStreamReducerOptions;
  /** Host patch applied on every CHANGED snapshot (zustand setState, …). */
  onSnapshot: (key: K, snapshot: ReducerMirrorSnapshot) => void;
}

export interface ReducerMirror<K extends string> {
  /** Create-or-get the reducer behind `key` (registers it as known). */
  getReducer: (key: K) => ChatStreamReducer;
  /** Re-project `key`'s reducer snapshot into the host store (no-op when unchanged). */
  sync: (key: K) => void;
  /** Apply one decoded stream event, then sync. Deltas are batched (see below). */
  apply: (key: K, event: ChatStreamEvent) => void;
  /** Run reducer commands (non-wire mutations), then sync. Force-flushes deltas. */
  mutate: <T>(key: K, fn: (reducer: ChatStreamReducer) => T) => T;
  /** Read-modify-write on the app-shape thread, delegated to the reducer. */
  mutateThread: (key: K, op: (messages: ChatMessage[]) => ChatMessage[]) => void;
  /** Synchronously land any pending delta batch. */
  flushDeltas: () => void;
  /** Drop the reducer + conversion caches for `key`. Force-flushes first. */
  drop: (key: K) => void;
  /** Every key this mirror has seen and not dropped. */
  knownKeys: () => K[];
}

const DELTA_FLUSH_FALLBACK_MS = 50;

function isDeltaEvent(event: ChatStreamEvent): boolean {
  return event.type === 'text-delta' || event.type === 'thinking-delta';
}

/**
 * createReducerMirror — the reducer-mirror scaffold both chat hosts (mingo
 * dialogs, ticket sides) share. Only the key type and the host's zustand
 * patch differ, so everything else lives here: reducer create-or-get,
 * snapshot-identity change detection, the app-shape conversion cache, the
 * streamingId derivation, thread read-modify-write and cache teardown.
 *
 * REFERENCE STABILITY is the contract that matters. Two guards preserve it,
 * and both must stay: (1) an unchanged reducer snapshot short-circuits
 * before any conversion, and (2) an unchanged `snap.messages` array reuses
 * the previously converted output array verbatim. Break either and every
 * inline approval/tool card remounts on each chunk.
 *
 * DELTA BATCHING mirrors `useChatStreamReducer`'s policy for the non-React
 * store path: `text-delta` / `thinking-delta` events coalesce and land ~once
 * per animation frame (with an always-armed ≤50ms timer fallback, because
 * rAF pauses in background tabs). Anthropic emits 30-60 deltas/sec; applying
 * each one synchronously re-renders the whole thread that many times. Any
 * NON-delta event, any `mutate`, and any `drop` force-flush the pending
 * batch FIRST, so ordering is preserved and turn completion / dialog switch
 * / unmount can never strand buffered text.
 */
export function createReducerMirror<K extends string>(config: ReducerMirrorConfig<K>): ReducerMirror<K> {
  const { store, identityFor, options, onSnapshot } = config;

  const knownKeys = new Set<K>();
  const lastSyncedSnapshot = new Map<K, ChatReducerState>();
  const lastConvertedThread = new Map<K, { source: readonly UnifiedChatMessage[]; out: ChatMessage[] }>();

  let pendingDeltas: ChatStreamEvent[] = [];
  let pendingKey: K | null = null;
  let rafHandle: number | null = null;
  let timerHandle: ReturnType<typeof setTimeout> | null = null;

  function getReducer(key: K): ChatStreamReducer {
    knownKeys.add(key);
    const { dialogId, side } = identityFor(key);
    return store.getReducer(dialogId, side, () => options(key));
  }

  function sync(key: K): void {
    getReducer(key);
    const { dialogId, side, defaults } = identityFor(key);
    const snap = store.getSnapshot(dialogId, side);
    if (lastSyncedSnapshot.get(key) === snap) return;
    lastSyncedSnapshot.set(key, snap);

    const prevConverted = lastConvertedThread.get(key);
    const messages =
      prevConverted && prevConverted.source === snap.messages
        ? prevConverted.out
        : snap.messages.map(u => fromUnifiedMessage(u, defaults));
    lastConvertedThread.set(key, { source: snap.messages, out: messages });

    const phase = snap.streamingPhase;
    const last = messages[messages.length - 1];
    const streamingId = phase === 'streaming' && last?.role === 'assistant' ? last.id : null;

    onSnapshot(key, { messages, phase, streamingId, state: snap });
  }

  function flushDeltas(): void {
    if (rafHandle !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (timerHandle !== null) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }
    if (pendingDeltas.length === 0) return;
    const batch = pendingDeltas;
    const key = pendingKey as K;
    pendingDeltas = [];
    pendingKey = null;
    const { dialogId, side } = identityFor(key);
    for (const delta of batch) store.apply(dialogId, side, delta);
    sync(key);
  }

  function scheduleFlush(): void {
    if (rafHandle !== null || timerHandle !== null) return;
    if (typeof requestAnimationFrame === 'function') {
      rafHandle = requestAnimationFrame(() => {
        rafHandle = null;
        flushDeltas();
      });
    }
    // Timer fallback ALWAYS armed: rAF pauses in background tabs and a
    // hidden chat panel must still keep its thread current.
    timerHandle = setTimeout(() => {
      timerHandle = null;
      flushDeltas();
    }, DELTA_FLUSH_FALLBACK_MS);
  }

  function apply(key: K, event: ChatStreamEvent): void {
    getReducer(key);
    // A pending batch belonging to another key must land on ITS reducer
    // before we start queueing for this one.
    if (!isDeltaEvent(event) || (pendingKey !== null && pendingKey !== key)) {
      flushDeltas();
    }
    if (isDeltaEvent(event)) {
      pendingKey = key;
      pendingDeltas.push(event);
      scheduleFlush();
      return;
    }
    const { dialogId, side } = identityFor(key);
    store.apply(dialogId, side, event);
    sync(key);
  }

  function mutate<T>(key: K, fn: (reducer: ChatStreamReducer) => T): T {
    getReducer(key);
    flushDeltas();
    const { dialogId, side } = identityFor(key);
    const result = store.mutate(dialogId, side, fn);
    sync(key);
    return result;
  }

  function mutateThread(key: K, op: (messages: ChatMessage[]) => ChatMessage[]): void {
    const { defaults } = identityFor(key);
    mutate(key, reducer => {
      const current = reducer.state.messages.map(u => fromUnifiedMessage(u, defaults));
      const next = op(current);
      if (next === current) return;
      reducer.setMessages(next.map(m => toUnifiedMessage(m)));
    });
  }

  function drop(key: K): void {
    if (pendingKey === key) {
      // Buffered text for a dialog being torn down is dead weight, but the
      // timers are not — cancel them rather than replaying into a reducer
      // that is about to be removed.
      pendingDeltas = [];
      pendingKey = null;
    }
    flushDeltas();
    const { dialogId, side } = identityFor(key);
    store.remove(dialogId, side);
    lastSyncedSnapshot.delete(key);
    lastConvertedThread.delete(key);
    knownKeys.delete(key);
  }

  return {
    getReducer,
    sync,
    apply,
    mutate,
    mutateThread,
    flushDeltas,
    drop,
    knownKeys: () => [...knownKeys],
  };
}
