'use client';

import type { DialogItem } from '@flamingo-stack/openframe-frontend-core/components/chat';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  ARCHIVE_MINGO_DIALOG_MUTATION,
  GET_MINGO_DIALOGS_QUERY,
  RENAME_MINGO_DIALOG_MUTATION,
  UNARCHIVE_MINGO_DIALOG_MUTATION,
} from '../queries/dialogs-queries';
import type { DialogsResponse } from '../types';

interface DialogMutationPayload {
  dialog: { id: string } | null;
  userErrors: { message: string }[];
}

interface FetchArchivedParams {
  cursor?: string;
  limit?: number;
  search?: string;
}
interface FetchArchivedResult {
  dialogs: DialogItem[];
  nextCursor: string | null;
}

async function runDialogMutation(query: string, variables: Record<string, unknown>, key: string): Promise<void> {
  const response = await apiClient.post<{ data: Record<string, DialogMutationPayload> }>('/chat/graphql', {
    query,
    variables,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.error || 'Request failed');
  }
  const payload = response.data.data[key];
  if (payload?.userErrors?.length) {
    throw new Error(payload.userErrors[0].message);
  }
}

/**
 * Dialog rename / archive / unarchive mutations + the archived-dialog fetcher,
 * wired to the saas-ai-agent `/chat/graphql` endpoint. Rename/archive feed the
 * embeddable chat's row menu (via `mingoState`); fetchArchived/unarchive feed
 * the archive page (via `mingoDialogCapabilities`). Each mutation invalidates
 * the active dialog list so the change shows immediately.
 */
export function useMingoDialogActions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateDialogs = useCallback(() => {
    // Archive/unarchive move a dialog between the active and archived lists, so
    // refresh BOTH cached queries — otherwise the archived-list cache (below)
    // would go stale after archiving/unarchiving.
    void queryClient.invalidateQueries({ queryKey: ['mingo-dialogs'] });
    void queryClient.invalidateQueries({ queryKey: ['mingo-archived-dialogs'] });
  }, [queryClient]);

  const renameDialog = useCallback(
    async (id: string, title: string) => {
      try {
        await runDialogMutation(RENAME_MINGO_DIALOG_MUTATION, { input: { id, title } }, 'renameDialog');
        invalidateDialogs();
        void queryClient.invalidateQueries({ queryKey: ['mingo-dialog', id] });
        toast({ title: 'Chat renamed', variant: 'success' });
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to rename chat',
          variant: 'destructive',
        });
      }
    },
    [invalidateDialogs, queryClient, toast],
  );

  const archiveDialog = useCallback(
    async (id: string) => {
      try {
        await runDialogMutation(ARCHIVE_MINGO_DIALOG_MUTATION, { input: { id } }, 'archiveDialog');
        invalidateDialogs();
        toast({ title: 'Chat archived', variant: 'success' });
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to archive chat',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [invalidateDialogs, toast],
  );

  const unarchiveDialog = useCallback(
    async (id: string) => {
      try {
        await runDialogMutation(UNARCHIVE_MINGO_DIALOG_MUTATION, { input: { id } }, 'unarchiveDialog');
        invalidateDialogs();
        toast({ title: 'Chat unarchived', variant: 'success' });
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to unarchive chat',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [invalidateDialogs, toast],
  );

  const fetchArchivedDialogs = useCallback(
    async (params: FetchArchivedParams): Promise<FetchArchivedResult> => {
      const runFetch = async (): Promise<FetchArchivedResult> => {
        const response = await apiClient.post<DialogsResponse>('/chat/graphql', {
          query: GET_MINGO_DIALOGS_QUERY,
          variables: {
            filter: { agentTypes: ['ADMIN'], statuses: ['ARCHIVED'] },
            pagination: { limit: params.limit ?? 20, cursor: params.cursor },
            search: params.search,
          },
        });
        if (!response.ok || !response.data) {
          throw new Error(response.error || 'Failed to fetch archived chats');
        }
        const { edges, pageInfo } = response.data.data.dialogs;
        return {
          dialogs: edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.title || 'Untitled Dialog',
            timestamp: new Date(edge.node.createdAt),
          })),
          nextCursor: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
        };
      };

      // Cache the FIRST page (no cursor) in the root QueryClient so reopening
      // the archive — even after the drawer unmounted — returns instantly
      // without a network round-trip or a skeleton. Paginated pages (cursor
      // set) stay transient. Invalidated on archive/unarchive above.
      if (!params.cursor) {
        return queryClient.fetchQuery({
          queryKey: ['mingo-archived-dialogs', { search: params.search, limit: params.limit ?? 20 }],
          queryFn: runFetch,
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
        });
      }
      return runFetch();
    },
    [queryClient],
  );

  return { renameDialog, archiveDialog, unarchiveDialog, fetchArchivedDialogs };
}
