'use client';

import {
  type ChunkData,
  type NatsMessageType,
  useJetStreamDialogSubscription,
} from '@flamingo-stack/openframe-frontend-core';
import type { ChatStreamEvent } from '@flamingo-stack/openframe-frontend-core/chat-protocol';
import type { ChatStreamReducer } from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerActiveDialogView } from '@/lib/active-dialog-views';
import { featureFlags } from '@/lib/feature-flags';
import { useNatsAppConfig } from '@/lib/nats/nats-app-config';
import { type ChatModelMetadata, useChatChunkProcessor } from '@/lib/use-chat-chunk-processor';
import { useAuthStore } from '@/stores';
import {
  applyMingoChatEvent,
  mutateMingoDialog,
  setMingoApprovalHandlers,
  syncMingoApprovalStatuses,
  useMingoMessagesStore,
} from '../stores/mingo-messages-store';
import type { DialogNode } from '../types/dialog.types';

const MINGO_JETSTREAM_TOPIC: NatsMessageType = 'admin-message';
const CHAT_CHUNKS_STREAM = 'CHAT_CHUNKS';

interface UseMingoRealtimeSubscriptionOptions {
  onChunkReceived?: (dialogId: string, chunk: ChunkData, messageType: NatsMessageType) => void;
}

interface DialogSubscriptionState {
  isSubscribed: boolean;
  isConnected: boolean;
  hasCaughtUp: boolean;
}

interface UseMingoRealtimeSubscription {
  subscribeToDialog: (dialogId: string) => void;
  unsubscribeFromDialog: (dialogId: string) => void;
  getSubscriptionState: (dialogId: string) => DialogSubscriptionState;
  subscribedDialogs: Set<string>;
  connectionState: 'connected' | 'disconnected' | 'connecting';
  onConnectionChange: (dialogId: string, connected: boolean) => void;
}

export function useMingoRealtimeSubscription(
  activeDialogId: string | null,
  options: UseMingoRealtimeSubscriptionOptions = {},
): UseMingoRealtimeSubscription {
  const { onChunkReceived } = options;

  const [subscribedDialogs, setSubscribedDialogs] = useState<Set<string>>(new Set());
  const [dialogStates, setDialogStates] = useState<Map<string, DialogSubscriptionState>>(new Map());
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');

  const onChunkReceivedRef = useRef(onChunkReceived);
  const catchupRefs = useRef<Map<string, any>>(new Map());

  const { resetUnread } = useMingoMessagesStore();

  useEffect(() => {
    onChunkReceivedRef.current = onChunkReceived;
  }, [onChunkReceived]);

  const onConnectionChange = useCallback((dialogId: string, connected: boolean) => {
    setConnectionState(connected ? 'connected' : 'disconnected');
    setDialogStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(dialogId);
      if (existing) {
        newMap.set(dialogId, { ...existing, isConnected: connected });
      }
      return newMap;
    });
  }, []);

  const getSubscriptionState = useCallback(
    (dialogId: string): DialogSubscriptionState => {
      return (
        dialogStates.get(dialogId) || {
          isSubscribed: false,
          isConnected: false,
          hasCaughtUp: false,
        }
      );
    },
    [dialogStates],
  );

  const subscribeToDialog = useCallback(
    (dialogId: string) => {
      if (subscribedDialogs.has(dialogId)) return;

      setSubscribedDialogs(prev => new Set(prev).add(dialogId));
      setDialogStates(prev => {
        const newMap = new Map(prev);
        newMap.set(dialogId, {
          isSubscribed: true,
          isConnected: false,
          hasCaughtUp: false,
        });
        return newMap;
      });

      if (dialogId === activeDialogId) {
        resetUnread(dialogId);
      }
    },
    [subscribedDialogs, activeDialogId, resetUnread],
  );

  const unsubscribeFromDialog = useCallback((dialogId: string) => {
    setSubscribedDialogs(prev => {
      const newSet = new Set(prev);
      newSet.delete(dialogId);
      return newSet;
    });

    setDialogStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(dialogId);
      return newMap;
    });

    catchupRefs.current.delete(dialogId);
  }, []);

  useEffect(() => {
    if (activeDialogId && !subscribedDialogs.has(activeDialogId)) {
      subscribeToDialog(activeDialogId);
    }
  }, [activeDialogId, subscribedDialogs, subscribeToDialog]);

  return {
    subscribeToDialog,
    unsubscribeFromDialog,
    getSubscriptionState,
    subscribedDialogs,
    connectionState,
    onConnectionChange,
  };
}

interface UseDialogChunkProcessorOptions {
  onApprove?: (requestId?: string) => void | Promise<void>;
  onReject?: (requestId?: string) => void | Promise<void>;
  approvalStatuses?: Record<string, any>;
  onMetadata?: (metadata: ChatModelMetadata) => void;
}

/**
 * Phase 4: chunks feed the lib's master stream reducer directly
 * (`decodeNatsChunk` → `dialogStore.apply`). The reducer owns EVERY
 * accumulation rule that used to live in the ~270-LOC callback glue here
 * (stream windows, segment routing, cross-message tool merges, approval
 * flips, participant dedup, typing phase); the store mirrors its snapshot.
 * The residual side concerns (own-echo suppression, the metadata
 * side-channel, approval-status sync, the keyed incomplete-turn seed) are
 * shared with the tickets processor via `useChatChunkProcessor`; only the
 * approval-handler binding is mingo-specific.
 */
function useDialogChunkProcessor(dialogId: string, options: UseDialogChunkProcessorOptions = {}) {
  const { onApprove, onReject, approvalStatuses, onMetadata } = options;

  const currentUserId = useAuthStore(state => state.user?.id);

  useEffect(() => {
    if (onApprove || onReject) {
      setMingoApprovalHandlers(dialogId, { onApprove, onReject });
    }
  }, [dialogId, onApprove, onReject]);

  const messages = useMingoMessagesStore(s => s.messagesByDialog.get(dialogId));

  const apply = useCallback((event: ChatStreamEvent) => applyMingoChatEvent(dialogId, event), [dialogId]);
  const mutate = useCallback(
    (fn: (reducer: ChatStreamReducer) => void) => {
      mutateMingoDialog(dialogId, fn);
    },
    [dialogId],
  );
  const syncApprovalStatuses = useCallback(
    (statuses: Record<string, string>) => syncMingoApprovalStatuses(dialogId, statuses),
    [dialogId],
  );

  const processChunk = useChatChunkProcessor({
    apply,
    mutate,
    messages,
    seedKey: dialogId,
    currentUserId,
    onMetadata,
    approvalStatuses,
    syncApprovalStatuses,
  });

  return { processChunk };
}

interface DialogSubscriptionProps {
  dialogId: string;
  isActive: boolean;
  onApprove?: (requestId?: string) => void;
  onReject?: (requestId?: string) => void;
  approvalStatuses?: Record<string, any>;
  onConnectionChange?: (dialogId: string, connected: boolean) => void;
  onMetadata?: (metadata: {
    modelDisplayName: string;
    modelName: string;
    providerName: string;
    contextWindow: number;
  }) => void;
  initialOptStartSeq: number | null;
  isInitialOptStartSeqReady: boolean;
}

export function DialogSubscription({
  dialogId,
  onApprove,
  onReject,
  approvalStatuses,
  onConnectionChange,
  onMetadata,
  initialOptStartSeq,
  isInitialOptStartSeqReady,
}: DialogSubscriptionProps) {
  const { getWsUrl, onBeforeReconnect } = useNatsAppConfig();

  // While this live tail is mounted the user is watching the dialog, so the
  // notifications pipeline suppresses popups / auto-reads for it.
  useEffect(() => registerActiveDialogView(dialogId), [dialogId]);

  const recordHighestStreamSeq = useMingoMessagesStore(s => s.recordHighestStreamSeq);
  const storedHighestSeq = useMingoMessagesStore(s => s.highestStreamSeqByDialog.get(dialogId) ?? 0);
  const effectiveOptStartSeq = Math.max(initialOptStartSeq ?? 0, storedHighestSeq);

  const { processChunk: processorProcessChunk } = useDialogChunkProcessor(dialogId, {
    onApprove,
    onReject,
    approvalStatuses,
    onMetadata,
  });

  const processorRef = useRef(processorProcessChunk);
  useEffect(() => {
    processorRef.current = processorProcessChunk;
  }, [processorProcessChunk]);

  const queryClient = useQueryClient();

  // Rejects out-of-order JetStream redeliveries.
  const lastAppliedStreamSeqRef = useRef<number>(-1);

  // Dispatch-level redelivery gate (mirrors the tickets subscription):
  // JetStream is at-least-once, so a chunk with an equal-or-older streamSeq
  // has already been processed — letting it through duplicates accumulator
  // text / participant rows. The streamState guard above only protects the
  // query-cache write, not the processor.
  const lastDispatchedStreamSeqRef = useRef<number>(-1);
  useEffect(() => {
    lastDispatchedStreamSeqRef.current = -1;
  }, [dialogId]);

  const syncStreamStateFromChunk = useCallback(
    (chunk: ChunkData) => {
      if (typeof chunk.streamSeq === 'number') {
        recordHighestStreamSeq(dialogId, chunk.streamSeq);
      }
      const next = chunk.streamState;
      if (!next) return;
      if (typeof chunk.streamSeq === 'number') {
        if (chunk.streamSeq < lastAppliedStreamSeqRef.current) return;
        lastAppliedStreamSeqRef.current = chunk.streamSeq;
      }
      queryClient.setQueryData<DialogNode | null | undefined>(['mingo-dialog', dialogId], prev =>
        prev ? { ...prev, streamState: next } : prev,
      );
    },
    [queryClient, dialogId, recordHighestStreamSeq],
  );

  const handleJetStreamEvent = useCallback(
    (payload: unknown, _messageType: NatsMessageType) => {
      const chunk = payload as ChunkData;
      if (featureFlags.debugNatsChunks.enabled()) {
        console.log('[mingo-js] chunk received', { dialogId, streamSeq: chunk.streamSeq, chunk });
      }
      if (typeof chunk.streamSeq === 'number') {
        if (chunk.streamSeq <= lastDispatchedStreamSeqRef.current) return;
        lastDispatchedStreamSeqRef.current = chunk.streamSeq;
      }
      syncStreamStateFromChunk(chunk);
      processorRef.current(chunk);
    },
    [syncStreamStateFromChunk, dialogId],
  );

  const handleConnect = useCallback(() => {
    onConnectionChange?.(dialogId, true);
  }, [dialogId, onConnectionChange]);

  const handleDisconnect = useCallback(() => {
    onConnectionChange?.(dialogId, false);
  }, [dialogId, onConnectionChange]);

  const { reconnectionCount } = useJetStreamDialogSubscription({
    enabled: isInitialOptStartSeqReady,
    dialogId,
    streamName: CHAT_CHUNKS_STREAM,
    topic: MINGO_JETSTREAM_TOPIC,
    optStartSeq: effectiveOptStartSeq,
    onEvent: handleJetStreamEvent,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onBeforeReconnect,
    getNatsWsUrl: getWsUrl,
  });

  // NATS reconnect: JetStream replays only ~10 minutes of CHAT_CHUNKS, so an
  // outage longer than that leaves a gap the resume-by-seq cannot fill.
  // Refetch persisted history — the merge layer dedupes what replay covers.
  const lastHandledReconnectRef = useRef(0);
  useEffect(() => {
    if (reconnectionCount <= lastHandledReconnectRef.current) return;
    lastHandledReconnectRef.current = reconnectionCount;
    void queryClient.invalidateQueries({ queryKey: ['mingo-dialog-messages', dialogId] });
    void queryClient.invalidateQueries({ queryKey: ['mingo-dialog', dialogId] });
  }, [reconnectionCount, queryClient, dialogId]);

  return null;
}
