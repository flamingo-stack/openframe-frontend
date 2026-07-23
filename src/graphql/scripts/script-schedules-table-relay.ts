import { graphql } from 'react-relay';

/**
 * Script Schedules list query (v2 — native OpenFrame GraphQL API via Relay).
 *
 * Mirrors the cursor-paginated `scriptSchedules(...)` connection from the
 * backend schema. Search and the platform filter are pushed to the server; the
 * pagination fragment drives infinite scroll.
 *
 * `scriptScheduleFilters` (the filter facets) rides the SAME operation, so each
 * filter interaction is a single round-trip and the dropdown options update
 * atomically with the rows. It sits on the outer query — not in the
 * `@refetchable` fragment — so `loadNext` pagination does not refetch it.
 * Only the platforms facet is consumed today (the schedules table has no
 * author column); `authors` stays unselected until a column needs it.
 */
export const scriptSchedulesTableRelayQuery = graphql`
  query scriptSchedulesTableRelayQuery(
    $filter: ScriptScheduleFilterInput
    $search: String
    $sort: SortInput
    $first: Int!
    $after: String
  ) {
    ...scriptSchedulesTableRelay_query
      @arguments(filter: $filter, search: $search, sort: $sort, first: $first, after: $after)
    scriptScheduleFilters(filter: $filter) {
      platforms {
        value
        label
        count
      }
    }
  }
`;

export const scriptSchedulesTableRelayFragment = graphql`
  fragment scriptSchedulesTableRelay_query on Query
    @refetchable(queryName: "scriptSchedulesTableRelayPaginationQuery")
    @argumentDefinitions(
      filter: { type: "ScriptScheduleFilterInput" }
      search: { type: "String" }
      sort: { type: "SortInput" }
      first: { type: "Int", defaultValue: 20 }
      after: { type: "String" }
    ) {
    scriptSchedules(filter: $filter, search: $search, sort: $sort, first: $first, after: $after)
      @connection(key: "scriptSchedulesTableRelay_scriptSchedules") {
      __id
      filteredCount
      edges {
        node {
          id
          name
          description
          supportedPlatforms
          deviceCount
          startAt
          repeat
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
