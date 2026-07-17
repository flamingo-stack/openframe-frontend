'use client';

import {
  type ChunkData,
  type NatsMessageType,
  useJetStreamDialogSubscription,
} from '@flamingo-stack/openframe-frontend-core';
import { useCallback, useEffect, useRef } from 'react';
import { useNatsAppConfig } from '@/lib/nats/nats-app-config';
import { NATS_TOPICS } from '../constants';

const CHAT_CHUNKS_STREAM = 'CHAT_CHUNKS';

interface TicketDialogSubscriptionProps {
  dialogId: string | null;
  /** Dispatch a chunk directly to side processors. */
  dispatchChunk: (chunk: ChunkData, messageType: NatsMessageType) => void;
  /** Resume sequence for the CLIENT topic; 0 = replay from stream start (per-dialog filter). */
  clientInitialOptStartSeq: number;
  /** Resume sequence for the ADMIN topic; 0 = replay from stream start (per-dialog filter). */
  adminInitialOptStartSeq: number;
  /** Gates JetStream consumer creation until both sides' history has loaded. */
  isInitialOptStartSeqReady: boolean;
  /** Gates the ADMIN (technician) topic consumer; off when the technician chat is hidden. */
  subscribeAdmin: boolean;
  /** Fired once per NATS reconnect. The CHAT_CHUNKS stream retains ~10
   *  minutes, so an outage longer than that leaves a gap JetStream replay
   *  cannot fill — the parent must refetch persisted history to cover it. */
  onReconnected?: () => void;
}

export function TicketDialogSubscription({
  dialogId,
  dispatchChunk,
  clientInitialOptStartSeq,
  adminInitialOptStartSeq,
  isInitialOptStartSeqReady,
  subscribeAdmin,
  onReconnected,
}: TicketDialogSubscriptionProps) {
  const { getWsUrl, onBeforeReconnect } = useNatsAppConfig();

  const dispatchRef = useRef(dispatchChunk);
  useEffect(() => {
    dispatchRef.current = dispatchChunk;
  }, [dispatchChunk]);

  // JetStream redeliveries may repeat a streamSeq during reconnect; drop any
  // we've already applied. Tracked per topic.
  const lastClientStreamSeqRef = useRef<number>(-1);
  const lastAdminStreamSeqRef = useRef<number>(-1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: dialogId change is the reset trigger
  useEffect(() => {
    lastClientStreamSeqRef.current = -1;
    lastAdminStreamSeqRef.current = -1;
  }, [dialogId]);

  const handleClientJsEvent = useCallback((payload: unknown) => {
    const chunk = payload as ChunkData;
    if (typeof chunk.streamSeq === 'number') {
      if (chunk.streamSeq <= lastClientStreamSeqRef.current) return;
      lastClientStreamSeqRef.current = chunk.streamSeq;
    }
    dispatchRef.current(chunk, NATS_TOPICS.MESSAGE);
  }, []);

  const handleAdminJsEvent = useCallback((payload: unknown) => {
    const chunk = payload as ChunkData;
    if (typeof chunk.streamSeq === 'number') {
      if (chunk.streamSeq <= lastAdminStreamSeqRef.current) return;
      lastAdminStreamSeqRef.current = chunk.streamSeq;
    }
    dispatchRef.current(chunk, NATS_TOPICS.ADMIN_MESSAGE);
  }, []);

  const { reconnectionCount: clientReconnectionCount } = useJetStreamDialogSubscription({
    enabled: !!dialogId && isInitialOptStartSeqReady,
    dialogId,
    streamName: CHAT_CHUNKS_STREAM,
    topic: NATS_TOPICS.MESSAGE,
    optStartSeq: clientInitialOptStartSeq,
    onEvent: handleClientJsEvent,
    onBeforeReconnect,
    getNatsWsUrl: getWsUrl,
  });

  const { reconnectionCount: adminReconnectionCount } = useJetStreamDialogSubscription({
    enabled: !!dialogId && isInitialOptStartSeqReady && subscribeAdmin,
    dialogId,
    streamName: CHAT_CHUNKS_STREAM,
    topic: NATS_TOPICS.ADMIN_MESSAGE,
    optStartSeq: adminInitialOptStartSeq,
    onEvent: handleAdminJsEvent,
    onBeforeReconnect,
    getNatsWsUrl: getWsUrl,
  });

  const onReconnectedRef = useRef(onReconnected);
  useEffect(() => {
    onReconnectedRef.current = onReconnected;
  }, [onReconnected]);

  // Both subscriptions share one NATS connection, so a reconnect bumps both
  // counters together — collapse to a single parent notification per event.
  const lastNotifiedReconnectRef = useRef(0);
  const reconnectTotal = Math.max(clientReconnectionCount, adminReconnectionCount);
  useEffect(() => {
    if (reconnectTotal <= lastNotifiedReconnectRef.current) return;
    lastNotifiedReconnectRef.current = reconnectTotal;
    onReconnectedRef.current?.();
  }, [reconnectTotal]);

  return null;
}
