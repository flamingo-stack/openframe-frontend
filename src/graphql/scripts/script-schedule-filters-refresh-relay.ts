import { graphql } from 'react-relay';

/**
 * Imperative refresh of the schedules list's filter facets after a mutation
 * changes list membership (archive/unarchive). Fetched with
 * `fetchQuery(...).subscribe({})` into the store so the mounted list query's
 * facet records update in place — mirrors `script-filters-refresh-relay.ts`.
 */
export const scriptScheduleFiltersRefreshRelayQuery = graphql`
  query scriptScheduleFiltersRefreshRelayQuery($filter: ScriptScheduleFilterInput) {
    scriptScheduleFilters(filter: $filter) {
      platforms {
        value
        label
        count
      }
    }
  }
`;
