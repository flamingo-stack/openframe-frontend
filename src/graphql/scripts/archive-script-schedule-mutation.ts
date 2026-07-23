import { graphql } from 'react-relay';

/**
 * Archives a schedule (status → ARCHIVED). `@deleteEdge(connections:)` removes
 * the schedule's edge from the active list's connection WITHOUT deleting the
 * ScriptSchedule record — the row disappears immediately, the record stays
 * fetchable by id, and a later `scriptSchedule(id:)` fetch never resurrects the
 * removed row. See `archive-script-mutation.ts` for why this is `@deleteEdge`,
 * not `@deleteRecord`.
 */
export const archiveScriptScheduleMutation = graphql`
  mutation archiveScriptScheduleMutation($id: ID!, $connections: [ID!]!) {
    archiveScriptSchedule(id: $id) {
      id @deleteEdge(connections: $connections)
    }
  }
`;
