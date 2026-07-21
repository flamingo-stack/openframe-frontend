// GraphQL response types
export interface DialogTokenUsage {
  chatType: string;
  inputTokensSize: number | null;
  outputTokensSize: number | null;
  totalTokensSize: number | null;
  contextSize: number | null;
}

export type DialogStreamState = 'IDLE' | 'STREAMING';

export interface DialogNode {
  id: string;
  title: string;
  status: string;
  streamState: DialogStreamState;
  /** DialogOwner union — ClientDialogOwner (machine fields) or AdminDialogOwner
   *  (userId/user fields), depending on the query's inline fragments. */
  owner?: {
    type?: 'CLIENT' | 'ADMIN';
    machineId?: string;
    machine?: {
      id: string;
      machineId: string;
      hostname: string;
      organizationId: string;
    };
    userId?: string;
    user?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      image?: {
        imageUrl?: string | null;
        hash?: string | null;
      } | null;
    } | null;
  };
  createdAt: string;
  statusUpdatedAt?: string;
  resolvedAt?: string;
  aiResolutionSuggestedAt?: string;
  rating?: {
    id: string;
    dialogId: string;
    createdAt: string;
  };
  tokenUsage?: DialogTokenUsage[] | null;
}

export interface DialogEdge {
  cursor: string;
  node: DialogNode;
}

export interface DialogConnection {
  edges: DialogEdge[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
}

export interface DialogsResponse {
  data: {
    dialogs: DialogConnection;
  };
}

export interface DialogResponse {
  data: {
    dialog: DialogNode;
  };
}

// Hook options
export interface UseMingoDialogsOptions {
  enabled?: boolean;
  search?: string;
  limit?: number;
  /** Ownership scope: 'my' keeps only the signed-in admin's dialogs.
   *  Server-side — maps to the `DialogFilterInput.scope` ChatScope enum. */
  scope?: 'my' | 'all';
}
