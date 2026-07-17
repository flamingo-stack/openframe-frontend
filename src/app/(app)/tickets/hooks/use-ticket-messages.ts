import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ChatType } from '../constants';
import { ticketService } from '../services';
import type { MessagePage } from '../services/ticket-service.types';

export function useTicketMessages(dialogId: string | null, chatType: ChatType) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!dialogId) return;
    queryClient.invalidateQueries({ queryKey: ['ticket-dialog-messages', dialogId, chatType] });
  }, [dialogId, chatType, queryClient]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['ticket-dialog-messages', dialogId, chatType],
    queryFn: async ({ pageParam }: { pageParam: string | undefined }): Promise<MessagePage> => {
      if (!dialogId) {
        return { messages: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } };
      }

      return ticketService.fetchMessages({
        dialogId,
        chatType,
        cursor: pageParam,
        limit: 50,
        sortField: 'createdAt',
        sortDirection: 'DESC',
      });
    },
    getNextPageParam: (lastPage: MessagePage) => {
      return lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!dialogId,
    staleTime: 30 * 1000,
  });

  return {
    rawPages: messagesQuery.data?.pages,
    dataUpdatedAt: messagesQuery.dataUpdatedAt,
    isLoading: messagesQuery.isLoading,
    isFetched: messagesQuery.isFetched,
    hasNextPage: messagesQuery.hasNextPage ?? false,
    isFetchingNextPage: messagesQuery.isFetchingNextPage,
    fetchNextPage: messagesQuery.fetchNextPage,
    /** Re-fetch the loaded pages. Used after a NATS reconnect: the JetStream
     *  CHAT_CHUNKS stream retains only ~10 minutes, so a longer outage leaves
     *  a gap only the persisted history can fill (the merge dedupes). */
    refetch: messagesQuery.refetch,
    error: messagesQuery.error?.message || null,
  };
}
