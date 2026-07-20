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
  extractIncompleteTailState,
  type MessageSegment,
} from '@flamingo-stack/openframe-frontend-core';
import type { ChatStreamEvent } from '@flamingo-stack/openframe-frontend-core/chat-protocol';
import {
  type AssistantType,
  type ChatApprovalStatus,
  type ChatDialogSide,
  type ChatDialogStore,
  type ChatReducerEffect,
  type ChatReducerState,
  type ChatStreamReducer,
  type ChatStreamReducerOptions,
  type CreateChatDialogStoreOptions,
  createDeltaBatcher,
  type DeltaBatcher,
  type DeltaEvent,
  type EvictedReducerState,
  type InitializeExtras,
  type PendingEcho,
  type ProcessedMessage,
  type StreamingPhase,
  type UnifiedChatMessage,
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
 *  assistant identity + a stable timestamp stamped at first conversion.
 *  Module-private: the mirror is the only legitimate conversion point (it
 *  owns the per-key output-array reuse the reference-stability contract
 *  depends on), so hosts must not call this directly. */
function fromUnifiedMessage(unified: UnifiedChatMessage, defaults: ThreadIdentityDefaults): ChatMessage {
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
 * executing tools + trailing segments).
 *
 * The run-collecting walk lives in the lib (`extractIncompleteTailState`),
 * shared with the NATS adapter, so there is ONE incompleteness rule set.
 * This wrapper only adapts the app's `ChatMessage` rows to the lib's
 * `ProcessedMessage` shape.
 */
export function computeIncompleteTailState(messages: readonly ChatMessage[]): InitializeExtras | undefined {
  return extractIncompleteTailState(messages as unknown as readonly ProcessedMessage[]);
}

// ─── Optimistic-row helpers ─────────────────────────────────────────────────

/**
 * Id for a locally-authored chat row. Collision-resistant without a uuid dep
 * (time prefix orders, random suffix disambiguates within the same ms) and,
 * more importantly, ONE recipe: three call sites had grown their own copies
 * with drifting prefixes, and the reducer's echo consumption keys off rows
 * looking the way this send path makes them.
 */
export function makeChatRowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Display name for an operator-authored row. This app's operator IS the
 *  admin, hence the fallback. */
export function adminDisplayName(user?: { firstName?: string; lastName?: string } | null): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Admin';
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
  /**
   * Build the dialog store. A FACTORY, not a ready-made store, because the
   * mirror must inject its own `onEvict` at creation (the store takes it as a
   * creation option) — handing the mirror a finished store would leave every
   * host free to forget the wiring, and the mirror would be back to inferring
   * eviction. Hosts merge their own options (`defaultCreateOptions`, …) into
   * the ones passed in and return the instance; read it back off
   * `ReducerMirror.store` if the host needs to export it.
   */
  createStore: (storeOptions: CreateChatDialogStoreOptions) => ChatDialogStore;
  /**
   * Map a host mirror key to its (dialogId, side) + assistant identity.
   *
   * INVARIANT: a key must ALWAYS map to the SAME `(dialogId, side)` for the
   * mirror's lifetime. Everything keyed by `K` here — the retain handles in
   * `setActiveKeys`, the snapshot/conversion caches, the reseed parking — is
   * looked up by key and resolved through this function lazily. The reseed
   * path is the sharpest case: `keyForIdentity` translates the store's
   * eviction signal back to `K` by re-running this function, and the thread
   * `onEvict` parks in `reseedByKey` (taken from `lastConvertedThread`) is
   * replayed into whatever `(dialogId, side)` the key resolves to LATER — so
   * a key whose identity changed would park one thread and re-seed a
   * different reducer with it, or never match at all and silently lose the
   * re-seed. Encode any varying part in the key itself (mingo keys by
   * dialogId; tickets keys by side over a constant thread key).
   */
  identityFor: (key: K) => {
    dialogId: string;
    side: ChatDialogSide;
    defaults: ThreadIdentityDefaults;
  };
  /** Consulted ONLY when a (dialogId, side) reducer is first created. */
  options: (key: K) => ChatStreamReducerOptions;
  /** Host patch applied on every CHANGED snapshot (zustand setState, …). */
  onSnapshot: (key: K, snapshot: ReducerMirrorSnapshot) => void;
  /**
   * Keys whose reducers participate in the dialog store's CROSS-KEY
   * projections (approval resolution by requestId, tool-execution merge by
   * execId) — i.e. keys a non-delta event landing on `key` can also mutate.
   * Tickets returns both sides; mingo omits this (dialogs are independent).
   *
   * The mirror materializes them before the event lands (a projection needs
   * a target reducer even when that key has never streamed) and re-syncs
   * them after. Deltas are exempt: cross-key projections only fire on
   * non-delta frames, so batched text costs nothing extra.
   */
  siblingKeys?: (key: K) => readonly K[];
}

/** Pre-curried per-key handle — see `ReducerMirror.bind`. */
export interface BoundMirror {
  apply: (event: ChatStreamEvent) => void;
  mutate: (fn: (reducer: ChatStreamReducer) => void) => void;
  /** MERGE (stream-learned wins) — see `ReducerMirror.mergeApprovalStatuses`. */
  mergeApprovalStatuses: (statuses: Record<string, string>) => void;
  /**
   * How many times THIS key's reducer has been LRU-evicted and replaced.
   * Snapshotted when the handle was built, and the handle is invalidated on
   * every eviction — so a changed epoch (or, equivalently, a changed handle
   * identity) is the signal a React consumer needs to RE-RUN the one-shot
   * work it did against the previous instance: the persisted approval-status
   * merge and the incomplete-turn accumulator seed both target a specific
   * reducer instance, and the replacement starts without either.
   */
  evictionEpoch: number;
}

export interface ReducerMirror<K extends string> {
  /** The dialog store this mirror built via `ReducerMirrorConfig.createStore`
   *  (with the mirror's `onEvict` wired in). Exposed so a host can export the
   *  instance it would otherwise have had to construct itself. */
  store: ChatDialogStore;
  /** Run reducer commands (non-wire mutations), then sync. Force-flushes deltas. */
  mutate: <T>(key: K, fn: (reducer: ChatStreamReducer) => T) => T;
  /** Read-modify-write on the app-shape thread, delegated to the reducer. */
  mutateThread: (key: K, op: (messages: ChatMessage[]) => ChatMessage[]) => void;
  /** Upsert by id: replace the row carrying `message.id`, else append. */
  upsertMessage: (key: K, message: ChatMessage) => void;
  /** Shallow-patch the row carrying `id`. No-op when it is absent. */
  patchMessage: (key: K, id: string, updates: Partial<ChatMessage>) => void;
  /** Drop the row carrying `id`. No-op when it is absent. */
  removeMessage: (key: K, id: string) => void;
  /**
   * Prepend an older history page, optionally shallow-patching the row that
   * straddles the page boundary (the merge both hosts run after fetching an
   * earlier page). No-op when nothing changes.
   */
  prependWithBoundaryMerge: (
    key: K,
    newMessages: ChatMessage[],
    boundaryMessageId?: string,
    boundaryUpdates?: Partial<ChatMessage>,
  ) => void;
  /**
   * Host typing indicator → the reducer's phase machine. Only 'idle' upgrades
   * to 'thinking': an open stream keeps ownership of the phase (this mirrors
   * the reducer's own agent-busy rule). Turning typing OFF always returns to
   * 'idle', which is what ends a host-driven indicator.
   */
  setTyping: (key: K, typing: boolean) => void;
  /**
   * Merge a host-held PERSISTED approval-status map into `key`'s reducer.
   * Delegates to the reducer's `mergeApprovalStatuses`, which bakes in
   * stream-learned precedence — both hosts previously spread the host map
   * LAST, which lets a stale persisted 'pending' downgrade an approval the
   * stream had just resolved (and re-arm its buttons).
   */
  mergeApprovalStatuses: (key: K, statuses: Record<string, string>) => void;
  /**
   * Land a host-authored optimistic user bubble THROUGH the reducer, so the
   * reducer records the pending echo text and consumes the backend's
   * MESSAGE_REQUEST echo itself (one-shot, text-matched) instead of the host
   * blanket-dropping every echo bearing its own user id.
   */
  pushOptimisticSend: (key: K, message: ChatMessage) => void;
  /** Pre-curried, per-key-stable `{ apply, mutate, mergeApprovalStatuses }`.
   *  Memoized inside the mirror so React hosts need no `useCallback`. */
  bind: (key: K) => BoundMirror;
  /**
   * Declare the key(s) currently DISPLAYED. Exactly those are pinned against
   * the dialog store's LRU eviction; any previously-active key not in `keys`
   * is released back to LRU protection-by-recency. Idempotent — call it on
   * every selection change.
   *
   * Retention tracks what is on screen, NOT what the mirror has ever seen:
   * pinning every touched key makes memory grow with dialogs-visited and
   * defeats the cap the LRU exists to enforce.
   */
  setActiveKeys: (keys: readonly K[]) => void;
  /** Drop the reducer + conversion caches for `key`. Force-flushes first. */
  drop: (key: K) => void;
  /** Every key this mirror has seen and not dropped. */
  knownKeys: () => K[];
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
 * RETENTION FOLLOWS WHAT IS DISPLAYED. The dialog store evicts
 * least-recently-used reducers past its cap (10) unless a key is RETAINED;
 * the React `useChatStreamReducer` hook retains for its lifetime, but this
 * factory is the only NON-React host and serves BOTH mingo (one key per
 * dialog) and tickets. The OPEN thread must be pinned — evict it and the next
 * `sync` recreates an EMPTY reducer whose changed snapshot patches the host
 * store with `messages: []`, blanking a visible thread. But pinning every key
 * the mirror has ever SEEN makes memory track dialogs-visited and defeats the
 * cap outright, so hosts declare the displayed key(s) via `setActiveKeys`
 * (mingo: its `activeDialogId`; the ticket host deliberately declares NOTHING
 * — see the retention note in `ticket-details-store.ts`: two sides against a
 * cap of ten means eviction can never fire there) and everything else falls
 * back to LRU protection-by-recency plus the store's own
 * `streamingPhase !== 'idle'` guard, which already refuses to evict a live
 * stream.
 *
 * EVICTION OF A NON-DISPLAYED KEY IS THEN SAFE because the store PUBLISHES
 * it: the mirror injects `onEvict` when it builds the store (hence
 * `createStore` being a factory), and on that signal it parks the key's last
 * converted thread TOGETHER WITH the `EvictedReducerState` the store hands
 * over. The next `getReducer` for the key — the call that materializes the
 * replacement instance — replays all three through `initializeWithState`
 * before anything reads it, so the fresh reducer starts out holding exactly
 * what the host is already showing.
 *
 * THE THREAD ALONE IS NOT ENOUGH, which is why the whole parked state rides
 * along. A recreated reducer starts with `approvalStatuses = {}` and
 * `lastAppliedSeq = -Infinity`; refetching history does not restore either.
 * Drop them and a resolved approval whose `APPROVAL_RESULT` row is older than
 * the refetched page re-renders ACTIONABLE (the operator can re-approve an
 * already-executed tool), and a catch-up replay from the host's own cursor
 * re-applies events the dropped instance had already consumed (duplicate
 * rows). Parking is therefore UNCONDITIONAL — an empty thread with an
 * advanced seq cursor is exactly the case a "only park a non-empty thread"
 * gate used to throw away.
 *
 * Re-seeding, rather than suppressing the pristine-empty snapshot, is what
 * makes this correct in both directions. Suppression (comparing reducer OBJECT
 * IDENTITY across `getReducer` calls, then swallowing empty snapshots until
 * something non-empty arrives) got two cases wrong: an evicted key that
 * RESUMES STREAMING before the user re-selects it produces a first non-empty
 * snapshot containing only the new turn, which then REPLACED the host's full
 * thread; and a host write that legitimately empties a thread
 * (`setMessages([])`, removing the last row) was swallowed for as long as the
 * flag stayed armed. With the thread restored up front, an empty snapshot once
 * again means exactly what it says and is projected unconditionally.
 *
 * DELTA BATCHING is NOT reimplemented here: the lib's framework-free
 * `createDeltaBatcher` is the single implementation, shared with the React
 * wrapper (`useChatStreamReducer`). It coalesces consecutive same-type
 * deltas and lands them ~once per animation frame (always-armed ≤50ms timer
 * fallback, because rAF pauses in background tabs) — Anthropic emits 30-60
 * deltas/sec, and applying each synchronously re-renders the whole thread
 * that many times. `push` returns FALSE for a non-delta event: the caller
 * then flushes and applies it itself, so ordering is preserved and turn
 * completion / dialog switch / unmount can never strand buffered text.
 */
/**
 * The store's `EvictedReducerState` with its thread swapped for the mirror's
 * already-converted app-shape one (the reducer-shape `messages` would only be
 * converted back on replay, defeating the identity caches).
 */
interface ParkedReducerState {
  messages: ChatMessage[];
  approvalStatuses: EvictedReducerState['approvalStatuses'];
  lastAppliedSeq: number;
  pendingEchoes: readonly PendingEcho[];
}

export function createReducerMirror<K extends string>(config: ReducerMirrorConfig<K>): ReducerMirror<K> {
  const { createStore, identityFor, options, onSnapshot, siblingKeys } = config;

  const knownKeys = new Set<K>();
  const lastSyncedSnapshot = new Map<K, ChatReducerState>();
  const lastConvertedThread = new Map<K, { source: readonly UnifiedChatMessage[]; out: ChatMessage[] }>();
  const boundByKey = new Map<K, BoundMirror>();
  /** Keys the host declared DISPLAYED, pushed to the store's policy-retain
   *  set — see the RETENTION note. */
  const activeKeys = new Set<K>();
  /** State parked by `onEvict`, replayed into the replacement reducer by the
   *  next `getReducer` — see the EVICTION note. */
  const reseedByKey = new Map<K, ParkedReducerState>();
  /** Per-key eviction counter published on `BoundMirror.evictionEpoch`. */
  const evictionEpochByKey = new Map<K, number>();

  /** Inverse of `identityFor`, over the keys this mirror knows. Only used to
   *  translate the store's `(dialogId, side)` eviction signal back into `K`;
   *  the sets involved are per-host and tiny (mingo caps at the store's ten
   *  reducers, tickets has two). */
  function keyForIdentity(dialogId: string, side: ChatDialogSide): K | undefined {
    for (const key of knownKeys) {
      const identity = identityFor(key);
      if (identity.dialogId === dialogId && identity.side === side) return key;
    }
    return undefined;
  }

  const store = createStore({
    onEvict: (dialogId: string, side: ChatDialogSide, parked: EvictedReducerState) => {
      const key = keyForIdentity(dialogId, side);
      if (key === undefined) return;
      // Park rather than re-seed here: `onEvict` fires from INSIDE the store's
      // `getReducer`, before the replacement instance for this key exists (and
      // possibly while another key is being resolved). The mirror's own
      // `getReducer` does the seeding.
      //
      // UNCONDITIONAL — see the EVICTION note. The approval statuses, the seq
      // cursor and the armed optimistic echoes are worth parking even when the
      // thread is empty, so the length check narrows to the messages field
      // alone.
      //
      // `parked.messages` is DELIBERATELY discarded in favour of the mirror's
      // own already-converted copy, which holds the SAME thread: every write
      // path (`apply` / `mutate` / the batcher's `onFlushed`) ends in `sync`,
      // which refreshes `lastConvertedThread` from the very snapshot
      // `parked.messages` was taken from — and `getReducer` re-seeds the entry
      // straight after a restore, so a key evicted twice with no `sync` in
      // between still parks its thread rather than an empty array. Keeping the
      // app-shape copy lets it survive replay without a round-trip through
      // `fromUnifiedMessage` (which would defeat the identity caches).
      // `parked.pendingEchoes` has no such app-shape twin and is passed through
      // verbatim — the reducer drops expired entries and re-caps on restore.
      reseedByKey.set(key, {
        messages: lastConvertedThread.get(key)?.out ?? [],
        approvalStatuses: parked.approvalStatuses,
        lastAppliedSeq: parked.lastAppliedSeq,
        pendingEchoes: parked.pendingEchoes,
      });
      // Bump BEFORE dropping the memoized handle: the next `bind(key)` builds
      // a fresh `BoundMirror` carrying the new epoch, which is what re-arms
      // the consumers' one-shot effects against the replacement instance.
      evictionEpochByKey.set(key, (evictionEpochByKey.get(key) ?? 0) + 1);
      boundByKey.delete(key);
      lastSyncedSnapshot.delete(key);
      lastConvertedThread.delete(key);
    },
  });

  // The batcher applies against the key it FLUSHED, which on a key change is
  // the PREVIOUS key — never assume it is the key currently being handled.
  // `applyOne` records it; `onFlushed` (which fires for explicit flushes AND
  // for the rAF/timer-scheduled ones) re-projects exactly that key.
  let flushedKey: K | null = null;

  const batcher: DeltaBatcher<K> = createDeltaBatcher<K>({
    applyOne: (delta: DeltaEvent, key: K | undefined) => {
      if (key === undefined) return;
      flushedKey = key;
      const { dialogId, side } = identityFor(key);
      // Through the MIRROR's `getReducer`, not `store.apply`'s implicit one:
      // that is the call that consumes a parked re-seed. A buffered key is by
      // definition still 'idle' (its deltas have not landed), hence evictable,
      // so a later `apply(otherKey, …)` can evict it and then replay this
      // buffer into a fresh EMPTY reducer — after which `onFlushed` → `sync`
      // WOULD find the parked thread and `setMessages` right over the delta
      // just applied. Seeding first makes "no store write for a key precedes
      // its re-seed" hold by construction rather than by call ordering.
      getReducer(key);
      store.apply(dialogId, side, delta);
    },
    onFlushed: () => {
      if (flushedKey === null) return;
      const key = flushedKey;
      flushedKey = null;
      sync(key);
    },
  });

  /** Land any pending batch (and re-project it) — see `onFlushed` above. */
  function flushDeltas(): void {
    batcher.flush();
  }

  function getReducer(key: K): ChatStreamReducer {
    knownKeys.add(key);
    const { dialogId, side, defaults } = identityFor(key);
    const reducer = store.getReducer(dialogId, side, () => options(key));
    // This is the first look at the replacement instance for an evicted key —
    // restore the parked state before any caller reads it, so the resumed
    // stream appends to the host's full thread instead of truncating it, a
    // resolved approval stays resolved, and the seq gate keeps rejecting the
    // events the dropped instance had already applied.
    const parked = reseedByKey.get(key);
    if (parked !== undefined) {
      reseedByKey.delete(key);
      // `null` keeps the fresh reducer's (empty) thread — the parked one had
      // nothing to restore, and the statuses/cursor/echoes still must be.
      reducer.initializeWithState(parked.messages.length > 0 ? parked.messages.map(m => toUnifiedMessage(m)) : null, {
        approvalStatuses: parked.approvalStatuses,
        lastAppliedSeq: parked.lastAppliedSeq,
        // Re-arms own-echo suppression for a send that was still in flight at
        // eviction time; without it the pending `MESSAGE_REQUEST` echo renders
        // a SECOND copy of the user's bubble. Expiry/cap are the reducer's job.
        pendingEchoes: parked.pendingEchoes,
      });
      // Re-establish the `lastConvertedThread` invariant that `onEvict` relies
      // on (it parks `lastConvertedThread.get(key)?.out ?? []`). Without this,
      // a key evicted a SECOND time BEFORE any `sync` — reachable through the
      // sibling-materialization window, since `onEvict` deleted the entry and
      // nothing between here and the next `sync` repopulates it — would park
      // `messages: []` and LOSE the restored thread.
      //
      // Deliberately the same expression `sync`'s cold path uses, over the same
      // snapshot, so the seeded pair is by construction what `sync` would have
      // produced. It is also a cache WARM rather than a re-conversion:
      // `fromUnifiedMessage` hits the `toAppCache` entry `toUnifiedMessage`
      // wrote on the way in, returning the very app-shape rows just parked.
      const seeded = store.getSnapshot(dialogId, side);
      lastConvertedThread.set(key, {
        source: seeded.messages,
        out: seeded.messages.map((u: UnifiedChatMessage) => fromUnifiedMessage(u, defaults)),
      });
    }
    return reducer;
  }

  /** Push `activeKeys` to the store's policy-retain set (which retains the
   *  additions before releasing the removals, so a key present across a swap
   *  never dips to zero retains). */
  function pushRetention(): void {
    store.setRetained(
      [...activeKeys].map(key => {
        const { dialogId, side } = identityFor(key);
        return { dialogId, side };
      }),
    );
  }

  function setActiveKeys(keys: readonly K[]): void {
    activeKeys.clear();
    for (const key of keys) activeKeys.add(key);
    pushRetention();
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

  function apply(key: K, event: ChatStreamEvent): void {
    // ORDER IS LOAD-BEARING: a pending batch must land BEFORE
    // `getReducer(key)`. The dialog store evicts least-recently-used
    // reducers, so resolving a NEW key's reducer first can evict the pending
    // key's — and the flush would then replay buffered text into a freshly
    // recreated, empty one. `batcher.push` performs the key-change flush
    // internally, which is exactly why it is called before `getReducer`.
    const queued = batcher.push(event, key);
    getReducer(key);
    if (queued) return;
    // `push` returned false: not a delta. Per the batcher contract the caller
    // flushes and applies it itself, so completion / approval / error frames
    // always land on fully-applied delta state.
    batcher.flush();
    // Non-delta frames are the only ones the store projects across keys, so
    // this is where (and the only place) siblings must exist and re-sync.
    // Materializing them AFTER the flush keeps the documented
    // flush-before-getReducer ordering intact for every key involved.
    const siblings = siblingKeys?.(key) ?? [];
    for (const sibling of siblings) {
      if (sibling !== key) getReducer(sibling);
    }
    const { dialogId, side } = identityFor(key);
    store.apply(dialogId, side, event);
    sync(key);
    // No-ops when a sibling's snapshot is unchanged (identity short-circuit).
    for (const sibling of siblings) {
      if (sibling !== key) sync(sibling);
    }
  }

  function mutate<T>(key: K, fn: (reducer: ChatStreamReducer) => T): T {
    // Flush FIRST, for the same eviction reason as `apply` — see the note there.
    flushDeltas();
    getReducer(key);
    const { dialogId, side } = identityFor(key);
    const result = store.mutate(dialogId, side, fn);
    sync(key);
    return result;
  }

  /**
   * Read-modify-write on the app-shape thread. `op` returning its INPUT array
   * unchanged is the no-op convention — every recipe below leans on it, which
   * is the whole reason they live here rather than being re-derived (with
   * drifting no-op handling) in each host store.
   */
  function mutateThread(key: K, op: (messages: ChatMessage[]) => ChatMessage[]): void {
    const { defaults } = identityFor(key);
    mutate(key, reducer => {
      const current = reducer.state.messages.map(u => fromUnifiedMessage(u, defaults));
      const next = op(current);
      if (next === current) return;
      reducer.setMessages(next.map(m => toUnifiedMessage(m)));
    });
  }

  function upsertMessage(key: K, message: ChatMessage): void {
    mutateThread(key, current => {
      const idx = current.findIndex(m => m.id === message.id);
      if (idx === -1) return [...current, message];
      const updated = [...current];
      updated[idx] = message;
      return updated;
    });
  }

  function patchMessage(key: K, id: string, updates: Partial<ChatMessage>): void {
    mutateThread(key, current => {
      const idx = current.findIndex(m => m.id === id);
      if (idx === -1) return current;
      const updated = [...current];
      updated[idx] = { ...updated[idx], ...updates };
      return updated;
    });
  }

  function removeMessage(key: K, id: string): void {
    mutateThread(key, current => {
      const filtered = current.filter(m => m.id !== id);
      return filtered.length === current.length ? current : filtered;
    });
  }

  function prependWithBoundaryMerge(
    key: K,
    newMessages: ChatMessage[],
    boundaryMessageId?: string,
    boundaryUpdates?: Partial<ChatMessage>,
  ): void {
    mutateThread(key, current => {
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
  }

  /** The typing→phase rule, owned once. See `ReducerMirror.setTyping`. */
  function setTyping(key: K, typing: boolean): void {
    mutate(key, reducer => {
      if (!typing) {
        reducer.setPhase('idle');
        return;
      }
      if (reducer.state.streamingPhase === 'idle') reducer.setPhase('thinking');
    });
  }

  /**
   * Delegated to the reducer's `mergeApprovalStatuses`, which fixes the
   * precedence at `{ ...persisted, ...streamLearned }` so no host can get it
   * backwards. Same name as the reducer method, same semantics — the two
   * used to differ, which is what made the old warnings necessary.
   */
  function mergeApprovalStatuses(key: K, statuses: Record<string, string>): void {
    mutate(key, reducer => {
      reducer.mergeApprovalStatuses(statuses as Record<string, ChatApprovalStatus>);
    });
  }

  /**
   * The reducer owns own-echo suppression (`pushOptimisticSend` records the
   * text; the MESSAGE_REQUEST handler consumes exactly ONE match). We route
   * the host's optimistic send through it purely for that bookkeeping, then
   * swap the reducer's two generic placeholder rows for the host's single
   * rich bubble — the host bubble carries name / avatar / contextItems the
   * reducer's bare row does not, and the hosts drive their own typing
   * indicator, so the trailing assistant placeholder (and the phase flip
   * `pushOptimisticSend` performs) must not leak into the mirror.
   */
  function pushOptimisticSend(key: K, message: ChatMessage): void {
    const text = typeof message.content === 'string' ? message.content : '';
    mutate(key, reducer => {
      const phaseBefore = reducer.state.streamingPhase;
      reducer.pushOptimisticSend(text);
      // `pushOptimisticSend` appended exactly [user bubble, assistant placeholder].
      const withoutPlaceholders = reducer.state.messages.slice(0, -2);
      reducer.setMessages([...withoutPlaceholders, toUnifiedMessage(message)]);
      reducer.setPhase(phaseBefore);
    });
  }

  function bind(key: K): BoundMirror {
    const existing = boundByKey.get(key);
    if (existing) return existing;
    const bound: BoundMirror = {
      apply: event => apply(key, event),
      mutate: fn => {
        mutate(key, fn);
      },
      mergeApprovalStatuses: statuses => mergeApprovalStatuses(key, statuses),
      evictionEpoch: evictionEpochByKey.get(key) ?? 0,
    };
    boundByKey.set(key, bound);
    return bound;
  }

  function drop(key: K): void {
    boundByKey.delete(key);
    // Land + cancel everything first: a batch belonging to ANOTHER key would
    // otherwise be stranded, and one belonging to THIS key must not fire on a
    // timer after `store.remove` has taken its reducer away.
    flushDeltas();
    const { dialogId, side } = identityFor(key);
    // Release BEFORE `remove`: a retained key is protected from eviction, and
    // leaving the retain behind would pin a reducer the mirror no longer knows.
    if (activeKeys.delete(key)) pushRetention();
    store.remove(dialogId, side);
    lastSyncedSnapshot.delete(key);
    lastConvertedThread.delete(key);
    // A dropped key is intentionally gone — the next `getReducer` builds a
    // fresh reducer that the host is expected to seed, so any state parked
    // by an earlier eviction must NOT be replayed into it.
    reseedByKey.delete(key);
    evictionEpochByKey.delete(key);
    knownKeys.delete(key);
  }

  // `getReducer` and `sync` stay module-private (`apply` is reachable only
  // pre-curried, via `bind`). An EXTERNAL `getReducer` would CONSUME a parked
  // post-eviction re-seed — `reseedByKey.delete` + `initializeWithState` — without the
  // `sync` that is supposed to follow it, so the host store would keep showing
  // its pre-eviction thread with no snapshot ever republishing it.
  return {
    store,
    setActiveKeys,
    mutate,
    mutateThread,
    upsertMessage,
    patchMessage,
    removeMessage,
    prependWithBoundaryMerge,
    setTyping,
    mergeApprovalStatuses,
    pushOptimisticSend,
    bind,
    drop,
    knownKeys: () => [...knownKeys],
  };
}

// ─── Shared reducer options ─────────────────────────────────────────────────

/** Late-bound, per-key host handlers (approve/reject + the model badge). */
export interface NatsMirrorHandlers {
  onApprove?: (requestId?: string) => void | Promise<void>;
  onReject?: (requestId?: string) => void | Promise<void>;
  onMetadata?: (metadata: ChatModelMetadata) => void;
}

/** Model-badge side-channel payload (kept outside the reducer state). */
export interface ChatModelMetadata {
  modelDisplayName: string;
  modelName: string;
  providerName: string;
  contextWindow: number;
}

interface ReducerMetadataEffectArgs {
  modelDisplayName?: string;
  modelName?: string;
  providerName?: string;
  contextWindow?: number;
}

/**
 * The `ChatStreamReducerOptions` block both NATS hosts had verbatim.
 * `handlersFor` is consulted at CALL time (not creation time), so hosts can
 * keep late-binding their handlers into a per-key Map.
 *
 * `onMetadata` rides the reducer's own `onMetadata` EFFECT rather than being
 * re-derived from the raw event by each host — the reducer already maps the
 * metadata frame to exactly this shape; only the app's non-optional string /
 * number fallbacks are applied here.
 */
export function natsMirrorOptions<K extends string>(
  handlersFor: (key: K) => NatsMirrorHandlers | undefined,
  // Thunk, not a value: reducer options are read lazily at reducer-creation
  // time, so the flag must be sampled then rather than frozen at wiring time.
  batchApprovalsEnabled: () => boolean,
  // Thunk, and PASSED THROUGH as one (see the `selfUserId` note in the
  // returned options) — the signed-in user is not known at module load.
  selfUserId: () => string | undefined = () => undefined,
): (key: K) => ChatStreamReducerOptions {
  return key => ({
    transport: 'nats',
    displayApprovalTypes: ['CLIENT', 'ADMIN'],
    batchApprovalsEnabled: batchApprovalsEnabled(),
    // This app's operator IS the admin: every optimistic send here is
    // admin-authored, so its MESSAGE_REQUEST echo comes back with
    // ownerType 'ADMIN'. Without this the reducer skips echo consumption
    // for ADMIN rows (correct on hosts where an ADMIN row is a
    // technician's reply) and every message we send renders twice.
    ownEchoIncludesAdmin: true,
    // Pairs with `ownEchoIncludesAdmin` above, which matches on RAW TEXT: the
    // author check is what keeps a stale pending echo from consuming a SECOND
    // technician's identical message on the ticket ADMIN side (that message
    // would then never render). The lib also ages entries out after
    // `OWN_ECHO_TTL_MS`, so a dropped echo cannot poison the thread forever.
    //
    // The THUNK is handed to the reducer verbatim, NOT invoked here: reducer
    // options are consulted once, at creation, and every reducer these hosts
    // create is long-lived (mingo's active dialog and both ticket sides are
    // retained for the store's lifetime). A reducer created before auth
    // rehydration — or surviving a logout / login-as-a-different-user without
    // a reload — would otherwise keep `undefined`/stale forever and silently
    // disable the author guard. The lib resolves it at EVENT time.
    selfUserId,
    callbacks: {
      onApprove: (id?: string) => handlersFor(key)?.onApprove?.(id),
      onReject: (id?: string) => handlersFor(key)?.onReject?.(id),
    },
    onEffect: (effect: ChatReducerEffect) => {
      if (effect.name !== 'onMetadata') return;
      const args = (effect.args[0] ?? {}) as ReducerMetadataEffectArgs;
      handlersFor(key)?.onMetadata?.({
        modelDisplayName: args.modelDisplayName ?? args.modelName ?? '',
        modelName: args.modelName ?? '',
        providerName: args.providerName ?? '',
        contextWindow: args.contextWindow ?? 0,
      });
    },
  });
}
