'use client';

/**
 * OpenframeEmbeddableChatEntry — the EmbeddableChat surface for
 * openframe-frontend. Hosted inside AppLayout's in-layout drawer
 * (`AppLayoutDrawer`) rather than as a body-level overlay, so the header
 * and sidebar stay visible and interactive while the chat is open. The
 * drawer owns the shell; this component runs the chat shell-less
 * (`shell="none"`) and is open/close-controlled by the host via the
 * `open` / `onOpenChange` props it shares with the drawer.
 *
 * Mingo-mode state is NOT owned by the lib's built-in NATS adapter. Instead
 * `useMingoUnifiedChatState()` builds it from the same react-query + Zustand
 * stack the `/mingo` page uses, and we inject it via `mingoState`. Because
 * that state lives OUTSIDE this component (store + query cache), the drawer
 * can unmount on close and rehydrate instantly on reopen — no `keepMounted`,
 * no refetch, and realtime catches up via JetStream replay on resubscribe.
 *
 * Realtime is a rendered component (`<DialogSubscription>`), so we render it
 * here alongside `<EmbeddableChat>`, wired from the hook's `subscription`
 * bundle — exactly as the `/mingo` page does.
 *
 * Guide mode (the SSE hub integration) is RESTORED as the second transport
 * (Phase 5 of the chat unification): `modes.guide` activates the lib's
 * unified SSE adapter. Its endpoints were never removed — they still come
 * from `OpenframeChatRuntimeProvider`'s `/content/`-prefixed paths, which
 * the reverse proxy in front of this app forwards to the MPH origin,
 * attaching the chat secret and act-as identity. This app ships as a
 * static SPA (`output: 'export'`), so it has NO server of its own: the
 * proxy is the only place that rewrite and those credentials can live.
 * Re-enabling guide is therefore a one-line mode change, not new plumbing.
 * Both modes existing makes the lib show the in-panel guide↔mingo toggle;
 * `defaultActiveMode="mingo"` keeps Mingo the landing mode, and both
 * transports share ONE reader (`createChatStreamReducer`).
 *
 * Coexists with the old `/mingo` page route during migration.
 */

import type {
  ChatContextPickerConfig,
  MingoQuickAction,
} from '@flamingo-stack/openframe-frontend-core/components/chat';
import {
  EmbeddableChat,
  getAgentAccent,
  renderQuickActionIcon,
} from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useEffect, useMemo } from 'react';
import { featureFlags } from '@/lib/feature-flags';
import { getFullImageUrl } from '@/lib/image-url';
import { MINGO_CONTEXT_ENTITY_TYPES } from '../(app)/mingo/context/context-sources';
import { CONTEXT_ITEMS_MAX } from '../(app)/mingo/context/context-types';
import { renderMingoContextItem, renderMingoMention } from '../(app)/mingo/context/mention-chips/render-mention';
import { renderMingoContextItems } from '../(app)/mingo/context/render-context-items';
import { useMingoContextMemory } from '../(app)/mingo/context/use-context-memory';
import { useMingoQuickActions } from '../(app)/mingo/hooks/use-mingo-quick-actions';
import { DialogSubscription } from '../(app)/mingo/hooks/use-mingo-realtime-subscription';
import { useMingoUnifiedChatState } from '../(app)/mingo/hooks/use-mingo-unified-chat-state';
import { useMingoLauncherStore } from '../(app)/mingo/stores/mingo-launcher-store';
import { useAuthStore } from '../(auth)/auth/stores/auth-store';

interface OpenframeEmbeddableChatEntryProps {
  /** Controlled open state, shared with the host `AppLayoutDrawer`. */
  open: boolean;
  /** Change handler, shared with the host `AppLayoutDrawer`. The chat's own
   *  in-header X button calls this with `false` to close the drawer. */
  onOpenChange: (open: boolean) => void;
}

export function OpenframeEmbeddableChatEntry({ open, onOpenChange }: OpenframeEmbeddableChatEntryProps) {
  const { state, subscription, sendInNewDialog, searchQuery, setSearchQuery, fetchArchivedDialogs, unarchiveDialog } =
    useMingoUnifiedChatState();

  // Signed-in user's display name for the chat header sub-line. The lib prefers
  // its server-resolved chat identity; this is the reliable host fallback (the
  // tenant identity route may not return a name) sourced from the auth store.
  const authUser = useAuthStore(s => s.user);
  const userDisplayName = useMemo(() => {
    if (!authUser) return undefined;
    const full = [authUser.firstName, authUser.lastName].filter(Boolean).join(' ').trim();
    return full || authUser.email?.trim() || undefined;
  }, [authUser]);
  // Header-avatar counterpart of the display name (New Chat compose view).
  const userAvatarUrl = getFullImageUrl(authUser?.image?.imageUrl, authUser?.image?.hash);

  // Queued launcher prompt (`sendToMingo(prompt)` — e.g. the onboarding "Meet
  // Mingo" quick-action chips): drain straight into a fresh Mingo dialog. The
  // drawer unmounts this entry on close and remounts on open, so this runs on
  // every open and re-fires if a new prompt is queued while the drawer is
  // already open. `consumePendingPrompt` nulls the prompt as it reads it, so a
  // header open (no prompt) and StrictMode's double-invoke are both no-ops.
  const pendingPrompt = useMingoLauncherStore(s => s.pendingPrompt);
  const consumePendingPrompt = useMingoLauncherStore(s => s.consumePendingPrompt);

  useEffect(() => {
    if (!pendingPrompt) return;
    const text = consumePendingPrompt();
    if (!text) return;
    void sendInNewDialog(text);
  }, [pendingPrompt, consumePendingPrompt, sendInNewDialog]);

  // Entity-context picker config (the `+` "Assign Item" menu + `@` trigger).
  // Stable so the lib's composer doesn't re-derive its icon map each render.
  // `renderMingoContextItems` maps each entity type to its data component
  // (Relay / TanStack hooks); the store-backed openView/recentViews are folded
  // in at send time by the unified hook.
  const contextPicker = useMemo<ChatContextPickerConfig>(
    () => ({
      entityTypes: MINGO_CONTEXT_ENTITY_TYPES,
      renderItems: renderMingoContextItems,
      maxItems: CONTEXT_ITEMS_MAX,
    }),
    [],
  );

  // Entity-context picker (the `+` / `@`-mention flow + selected chips) is
  // gated behind the `mingo-sidebar-context` flag. Passing `contextPicker`
  // undefined makes the lib's composer inert (no `+`, no `@`, no chips).
  const contextEnabled = featureFlags.mingoSidebarContext.enabled();

  // Context-memory strip above the composer: the navigation history Mingo
  // carries on every message (current page + previously viewed entities), each
  // droppable from the `⋯` dropdown.
  const contextMemory = useMingoContextMemory();

  // Admin-configured Mingo quick actions (AI Settings → "Mingo AI Chat" tab)
  // become starter chips in the empty state. Clicking one opens a new dialog
  // seeded with the action's instructions — same path the launcher prompt uses.
  const quickActions = useMingoQuickActions();
  const mingoQuickActions = useMemo<MingoQuickAction[]>(
    () =>
      quickActions.map(action => ({
        id: action.id,
        label: action.name,
        variant: 'outline',
        // Product Hub defaults carry a glyph (iconName/iconUrl/iconProps);
        // render it into the chip node. Tenant customs have none → undefined →
        // no icon. `mingo` accent tints registry glyphs unless the hub icon
        // sets its own color. The settings editor deliberately omits this.
        icon: renderQuickActionIcon({
          name: action.iconName ?? undefined,
          url: action.iconUrl ?? undefined,
          props: action.iconProps ?? undefined,
          accent: getAgentAccent('mingo'),
        }),
        // Hover/focus previews the full instruction (what's actually sent) as
        // ghost text in the composer; the chip `label` is just the short name.
        prompt: action.instructions,
        onClick: () => {
          void sendInNewDialog(action.instructions);
        },
      })),
    [quickActions, sendInNewDialog],
  );

  return (
    <>
      {/* Realtime tail for the active dialog — writes chunks into the shared
          store, exactly like the /mingo page. Gated on active + subscribed; on
          reopen it resubscribes and replays missed chunks from the stored
          sequence offset. */}
      {subscription.activeDialogId && subscription.isSubscribed && (
        <DialogSubscription
          key={subscription.activeDialogId}
          dialogId={subscription.activeDialogId}
          isActive
          onApprove={subscription.onApprove}
          onReject={subscription.onReject}
          approvalStatuses={subscription.approvalStatuses}
          onConnectionChange={subscription.onConnectionChange}
          onMetadata={subscription.onMetadata}
          initialOptStartSeq={subscription.initialOptStartSeq}
          isInitialOptStartSeqReady={subscription.isInitialOptStartSeqReady}
        />
      )}

      <EmbeddableChat
        // Shell-less: the host `AppLayoutDrawer` owns the panel chrome,
        // open/close, and positioning. `open` / `onOpenChange` are the same
        // state the drawer is bound to, so the chat's in-header X button and
        // the drawer close in lockstep.
        shell="none"
        open={open}
        onOpenChange={onOpenChange}
        // Signed-in user's name for the header sub-line under the chat title.
        // Fallback for the lib's server identity when the tenant identity route
        // returns no name — sourced from the host auth store.
        userDisplayName={userDisplayName}
        userAvatarUrl={userAvatarUrl}
        // Mingo mode is host-owned via `mingoState`, so we do NOT pass
        // `modes.mingo` — that keeps the lib's built-in NATS adapter idle.
        // `modes.guide` (re)enables Guide mode on the lib's unified SSE
        // adapter: endpoints come from `OpenframeChatRuntimeProvider`'s
        // existing `/content/`-prefixed paths (reverse-proxied to MPH by the
        // layer in front of this app — this SPA has no server of its own),
        // and the adapter's
        // baked-in `defaultTableIdForDocumentType` covers the hub's registered
        // document types, so no per-host config is required here. Guide +
        // Mingo both present → the lib renders the in-panel mode toggle;
        // `defaultActiveMode` keeps Mingo the landing mode (without it the
        // lib would default to Guide whenever `modes.guide` exists).
        modes={{ guide: {} }}
        defaultActiveMode="mingo"
        mingoState={state}
        // Dialog management for the host-injected Mingo state:
        //  - search: the chat-history search bar emits the debounced term into
        //    `setSearchQuery`, which rides the `useMingoDialogs` query key.
        //  - rename/archive: enable the row + header ⋯ menu (mutations live on
        //    `mingoState` via `useMingoDialogActions`).
        //  - archive page: `fetchArchivedDialogs` gates the clock-history button;
        //    `unarchiveDialog` enables restore.
        mingoDialogCapabilities={{
          searchQuery,
          onSearchChange: setSearchQuery,
          canRename: true,
          canArchive: true,
          fetchArchivedDialogs,
          unarchiveDialog,
        }}
        // Admin-configured Mingo quick actions rendered as chips in the Mingo
        // empty state. Omitted when none are configured so the lib keeps its
        // default welcome content.
        mingoWelcome={mingoQuickActions.length > 0 ? { quickActions: mingoQuickActions } : undefined}
        contextPicker={contextEnabled ? contextPicker : undefined}
        // Renders inline AI mentions (`@device:<machineId>` in Mingo's replies)
        // as self-fetching chips — the `@marker:id` analogue of `renderEntityCard`
        // for `[card://]`. Stable module-level fn so the message memo holds.
        renderMention={contextEnabled ? renderMingoMention : undefined}
        // Renders a user's ATTACHED context chips (`contextItems`) as the SAME
        // self-fetching chips as inline mentions — so manually attached context
        // resolves its live name + link instead of the lib's label-only pill.
        renderContextItem={contextEnabled ? renderMingoContextItem : undefined}
        // Context memory (Figma 271:38656): the strip at the top of the composer
        // card naming what Mingo remembers from this session's navigation — the
        // open entity page plus the recently viewed ones — with a `⋯` dropdown
        // to review and forget individual entries. Replaces the old under-the-
        // header page-context banner. The strip self-hides when memory is empty.
        contextMemory={contextEnabled ? contextMemory : undefined}
      />
    </>
  );
}
