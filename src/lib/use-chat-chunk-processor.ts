'use client';

/**
 * useChatChunkProcessor — the NATS chunk→reducer glue shared by both chat
 * hosts (the mingo dialog subscription and the tickets per-side processor).
 *
 * Phase 4 pushed message ACCUMULATION into the lib's master stream reducer,
 * which left both hosts with the same residual side concerns — and two
 * verbatim copies of them. They live here now:
 *
 *   1. ref-mirrors for the current user id + the metadata callback, so the
 *      returned `processChunk` identity does not churn per render;
 *   2. the approval-status sync effect (the lookup the reducer consults when
 *      an APPROVAL_REQUEST replays);
 *   3. the KEYED one-shot incomplete-turn seed after history hydration;
 *   4. the `metadata` side-channel for the model badge;
 *   5. own-echo suppression for the caller's own MESSAGE_REQUEST.
 *
 * Host-specific behaviour arrives via `interceptEvent` (tickets uses it for
 * client-authored DIRECT_MESSAGE rows, which the lib reducer would otherwise
 * render as admin-authored).
 */

import type { Message as ChatMessage } from '@flamingo-stack/openframe-frontend-core';
import { type ChatStreamEvent, decodeNatsChunk } from '@flamingo-stack/openframe-frontend-core/chat-protocol';
import type { ChatStreamReducer } from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useCallback, useEffect, useRef } from 'react';
import { computeIncompleteTailState } from '@/lib/chat-stream-thread';

export interface ChatModelMetadata {
  modelDisplayName: string;
  modelName: string;
  providerName: string;
  contextWindow: number;
}

export interface UseChatChunkProcessorOptions {
  /** Apply one decoded event to the bound dialog/side (store mirror path). */
  apply: (event: ChatStreamEvent) => void;
  /** Run reducer commands against the bound dialog/side. */
  mutate: (fn: (reducer: ChatStreamReducer) => void) => void;
  /** Hydrated thread of the bound dialog/side (drives the seeding guard). */
  messages: readonly ChatMessage[] | undefined;
  /**
   * Identity of the thread currently bound. The incomplete-turn seed is a
   * ONE-SHOT PER KEY: neither host remounts this hook on dialog/side switch
   * (tickets clears chat state on `ticketId` change rather than unmounting),
   * so an unkeyed boolean guard would latch after the first thread and every
   * later thread with a pending approval or an executing tool would replay
   * its continuation chunks into a fresh bubble — duplicated approval card,
   * duplicated tool rows, and a hydrated pending approval that never
   * resolves. Key on dialogId (mingo) / `${ticketId}:${side}` (tickets).
   */
  seedKey: string;
  /** Signed-in user id — used to drop this client's own MESSAGE_REQUEST echo. */
  currentUserId?: string;
  /** Model-badge side-channel (kept outside the reducer). */
  onMetadata?: (metadata: ChatModelMetadata) => void;
  /** Approval statuses the reducer consults when an APPROVAL_REQUEST replays. */
  approvalStatuses?: Record<string, string>;
  /** Merge `approvalStatuses` into the bound reducer's lookup. */
  syncApprovalStatuses?: (statuses: Record<string, string>) => void;
  /** Host hook, run after metadata + own-echo handling. Return `true` to
   *  claim the event (the shared path then skips `apply`). */
  interceptEvent?: (event: ChatStreamEvent) => boolean;
}

export function useChatChunkProcessor({
  apply,
  mutate,
  messages,
  seedKey,
  currentUserId,
  onMetadata,
  approvalStatuses,
  syncApprovalStatuses,
  interceptEvent,
}: UseChatChunkProcessorOptions): (chunk: unknown) => void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  const onMetadataRef = useRef(onMetadata);
  onMetadataRef.current = onMetadata;
  const interceptEventRef = useRef(interceptEvent);
  interceptEventRef.current = interceptEvent;

  // Status lookup the reducer consults when an APPROVAL_REQUEST replays.
  useEffect(() => {
    if (approvalStatuses && Object.keys(approvalStatuses).length > 0) {
      syncApprovalStatuses?.(approvalStatuses);
    }
  }, [approvalStatuses, syncApprovalStatuses]);

  // One-shot-PER-KEY incomplete-turn seed: once the hydrated thread shows an
  // unfinished trailing assistant run (pending approvals / executing tools),
  // seed the reducer's per-turn kernel so continuation chunks merge instead
  // of replaying into a fresh bubble. See `seedKey` above for why the guard
  // is keyed rather than a plain boolean.
  const seededKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (seededKeyRef.current === seedKey || !messages || messages.length === 0) return;
    const extras = computeIncompleteTailState(messages);
    if (!extras) return;
    seededKeyRef.current = seedKey;
    mutate(r => r.initializeWithState(null, extras));
  }, [seedKey, messages, mutate]);

  return useCallback((chunk: unknown) => {
    const event = decodeNatsChunk(chunk);
    if (!event) return;

    // Side-channel: model badge refinement (kept outside the reducer).
    if (event.type === 'metadata') {
      onMetadataRef.current?.({
        modelDisplayName: event.modelLabel ?? event.modelName ?? '',
        modelName: event.modelName ?? '',
        providerName: event.provider ?? '',
        contextWindow: event.contextWindowMaxTokens ?? 0,
      });
    }

    // Own MESSAGE_REQUEST echo — the optimistic send already rendered it
    // (with the sender's name/avatar, which the wire echo doesn't carry).
    if (
      event.type === 'participant' &&
      event.kind === 'message-request' &&
      event.userId &&
      event.userId === currentUserIdRef.current
    ) {
      return;
    }

    if (interceptEventRef.current?.(event)) return;

    applyRef.current(event);
  }, []);
}
