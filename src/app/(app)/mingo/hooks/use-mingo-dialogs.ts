'use client';

import { type DialogItem, useOptionalNotifications } from '@flamingo-stack/openframe-frontend-core';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import { getFullImageUrl } from '@/lib/image-url';
import { GET_MINGO_DIALOGS_QUERY } from '../queries/dialogs-queries';
import type { DialogNode, DialogsResponse, UseMingoDialogsOptions } from '../types';

// TODO(unread-from-entity): re-enable per-dialog unread highlighting once the backend exposes
// unread counts on the dialog entity itself. Matching unread notifications to dialogs by id is a
// temporary workaround — disabled for now; flip this flag to restore it.
const HIGHLIGHT_UNREAD_FROM_NOTIFICATIONS: boolean = false;

// Statuses shown in the active "Current Chats" list — every DialogStatus except
// ARCHIVED. The backend returns archived dialogs when no statuses are passed, so
// list them explicitly; archived dialogs live in the separate Chat Archive page.
const ACTIVE_DIALOG_STATUSES = ['ACTIVE', 'ACTION_REQUIRED', 'ON_HOLD', 'RESOLVED'] as const;

function transformToDialogItem(dialog: DialogNode, unreadCount: number = 0): DialogItem {
  // Admin owner → trailing avatar in the chat-history rows (Figma 113:63224).
  // Client-owned dialogs (machine) carry no admin user — no avatar.
  const ownerUser = dialog.owner?.user;
  const ownerName = [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(' ');
  return {
    id: dialog.id,
    title: dialog.title || 'Untitled Dialog',
    timestamp: new Date(dialog.createdAt),
    unreadMessagesCount: unreadCount,
    owner: dialog.owner?.userId
      ? {
          name: ownerName || 'Admin',
          avatarUrl: getFullImageUrl(ownerUser?.image?.imageUrl, ownerUser?.image?.hash) ?? null,
        }
      : undefined,
  };
}

export function useMingoDialogs(options: UseMingoDialogsOptions = {}) {
  const { enabled = true, search, limit = 20, scope = 'all' } = options;
  const notifications = useOptionalNotifications();

  // Per-dialog unread badge = count of unread notifications (mingo message / approval request)
  // that carry this dialog's id. Opening a dialog marks those read (EntityViewAutoReader),
  // which clears the badge in lockstep with the drawer and the sidebar nav count.
  const unreadByDialog = useMemo(() => {
    const counts = new Map<string, number>();
    if (!HIGHLIGHT_UNREAD_FROM_NOTIFICATIONS) return counts;
    for (const notification of notifications?.notifications ?? []) {
      if (notification.read) continue;
      const dialogId = notification.meta?.dialogId;
      if (typeof dialogId === 'string') counts.set(dialogId, (counts.get(dialogId) ?? 0) + 1);
    }
    return counts;
  }, [notifications?.notifications]);

  const query = useInfiniteQuery({
    // `scope` is part of the key: MY/ALL are different server-side datasets
    // with their own cursors, so they must not share cached pages.
    queryKey: ['mingo-dialogs', { search, limit, scope }],
    queryFn: async ({
      pageParam,
    }): Promise<{ dialogs: DialogNode[]; pageInfo: { hasNextPage: boolean; endCursor?: string } }> => {
      const variables = {
        filter: {
          agentTypes: ['ADMIN'],
          statuses: ACTIVE_DIALOG_STATUSES,
          // Server-side ownership filter (ChatScope enum): MY = only the
          // signed-in admin's dialogs. Keeps cursor pages dense — no
          // client-side re-filtering needed.
          scope: scope === 'my' ? 'MY' : 'ALL',
        },
        pagination: {
          limit,
          cursor: pageParam,
        },
        search,
      };

      const response = await apiClient.post<DialogsResponse>('/chat/graphql', {
        query: GET_MINGO_DIALOGS_QUERY,
        variables,
      });

      if (!response.ok || !response.data) {
        throw new Error(response.error || 'Failed to fetch dialogs');
      }

      const { edges, pageInfo } = response.data.data.dialogs;
      return {
        dialogs: edges.map(edge => edge.node),
        pageInfo,
      };
    },
    getNextPageParam: lastPage => {
      return lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled,
    // The Mingo drawer UNMOUNTS on close, so this query remounts on every open.
    // A short staleTime made each reopen refetch (and, once the cache was GC'd,
    // re-flash the loading skeleton). Keep the list cached for the session so
    // reopening is instant: a long staleTime means reopen-within-window doesn't
    // refetch on mount, and a long gcTime keeps the data (no skeleton) across
    // closed periods. Freshness still comes from the 60s poll while open, the
    // realtime subscription, and mutation invalidations (rename/archive/new).
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 60 * 1000,
    // Keep the current list visible while a new `search` term refetches, so
    // typing doesn't flash an empty list / "No chats found" between keystrokes.
    placeholderData: keepPreviousData,
  });

  const dialogsWithUnread = useMemo(() => {
    if (!query.data?.pages) return [];

    const allDialogs = query.data.pages.flatMap(page => page.dialogs);
    return allDialogs.map(dialog => transformToDialogItem(dialog, unreadByDialog.get(dialog.id) ?? 0));
  }, [query.data?.pages, unreadByDialog]);

  return {
    dialogs: dialogsWithUnread,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error?.message,
    refetch: query.refetch,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
