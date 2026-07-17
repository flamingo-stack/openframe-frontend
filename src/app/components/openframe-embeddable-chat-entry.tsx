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
 * Mingo is the ONLY transport: Guide mode (the SSE hub integration) has been
 * removed, so there is no in-panel mode toggle and no `modes.guide` wiring.
 *
 * Coexists with the old `/mingo` page route during migration.
 */

import type {
  ChatContextPickerConfig,
  MingoQuickAction,
} from '@flamingo-stack/openframe-frontend-core/components/chat';
import { EmbeddableChat } from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useEffect, useMemo } from 'react';
import { featureFlags } from '@/lib/feature-flags';
import { MINGO_CONTEXT_ENTITY_TYPES } from '../(app)/mingo/context/context-sources';
import { CONTEXT_ITEMS_MAX } from '../(app)/mingo/context/context-types';
import { renderMingoContextItem, renderMingoMention } from '../(app)/mingo/context/mention-chips/render-mention';
import { MingoPageContextTag } from '../(app)/mingo/context/page-context-tag';
import { renderMingoContextItems } from '../(app)/mingo/context/render-context-items';
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
        // Mingo mode is host-owned via `mingoState`, so we do NOT pass
        // `modes.mingo` — that keeps the lib's built-in NATS adapter idle.
        // The EXPLICIT empty object matters: omitting `modes` entirely makes
        // the lib fall back to its legacy guide-only default, resurrecting the
        // removed Guide (SSE hub) mode. With no `modes.guide`, the panel is
        // Mingo-only: no mode toggle, no "Start Guide Chat" entry point, and
        // the uncontrolled active mode defaults to 'mingo'.
        modes={{}}
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
        // Mingo-mode "current page context" banner (Figma 192:51006): names the
        // entity detail page the user is on now (read from the navigation-context
        // store). The lib renders it under the header in Mingo mode only; the tag
        // self-hides when there's no open view.
        mingoContextBanner={<MingoPageContextTag />}
      />
    </>
  );
}
