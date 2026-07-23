# Script Schedules — Execution History (GraphQL backend ask)

> **⚠ Superseded by `script-schedules-v2-detail-tables-spec.md`** for the field
> *placement*: that doc consolidates all three detail-page tables (Assigned
> Devices, Runs, Executions) as connection + facets fields **on the
> `ScriptSchedule` node** (no `scheduleId` arg), instead of the top-level
> `scriptScheduleExecutions(scheduleId:)` proposed below. The query *shape* here
> still holds; read the consolidated doc first.

> **Scope.** The one query the schedule **Execution History** tab needs. The tab
> is already wired into the schedule detail page as a stub
> (`src/app/(app)/scripts/v2/components/schedule-executions-tab.tsx`) rendering a
> placeholder; this doc is the backend work that turns it into a real list.
>
> **Schema source.** Committed `schema.graphql` (identical to `/api/graphql` via
> `npm run fetch-schema`). Everything marked **PROPOSED** does **not exist yet**.

---

## 1. What EXISTS today

The execution record and its per-script history query are already there, and each
execution is **already stamped with the schedule it came from**:

```graphql
type ScriptExecution implements Node {
  id: ID!
  executionId: ID!
  scriptId: ID!
  scriptName: String
  scheduleId: ID          # ← stamped at dispatch; null for ad-hoc runScript / batchRunScript
  machine: Machine
  privilegeLevel: PrivilegeLevel!
  initiator: User
  status: ScriptExecutionStatus!   # RUNNING | SUCCESS | FAILED
  dispatchedAt: Instant!
  statusChangedAt: Instant
  finishedAt: Instant
  exitCode: Int
  executionTimeMs: Float
  timedOut: Boolean
  stdout: String   stdoutTruncated: Boolean
  stderr: String   stderrTruncated: Boolean
  error: String
}

type Query {
  # Per-SCRIPT history — the shape the schedule tab wants, but keyed by scriptId.
  scriptExecutions(scriptId: ID!, filter: ScriptExecutionFilterInput, search: String,
                   sort: SortInput, first: Int, after: String, last: Int, before: String): ScriptExecutionConnection!
  scriptExecutionFilters(scriptId: ID!, filter: ScriptExecutionFilterInput, search: String): ScriptExecutionFilters!
}

input ScriptExecutionFilterInput {
  statuses: [ScriptExecutionStatus!]
  initiatorIds: [ID!]
  machineIds: [String!]
  # ← no scheduleId
}
```

## 2. The gap

There is **no way to read "the runs of this schedule"**:

- `scriptExecutions(...)` requires `scriptId` and has no `scheduleId` argument.
- `ScriptExecutionFilterInput` has no `scheduleId`, so it can't be narrowed to a
  schedule either.
- Merging client-side across a schedule's `scripts[]` doesn't work: it would
  double-count executions of a script used by several schedules and can't
  distinguish this schedule's runs from ad-hoc runs of the same script.

The data is already there (`ScriptExecution.scheduleId`); only the **read surface**
is missing. That's why the tab ships as a placeholder.

## 3. PROPOSED backend additions (pick one)

### Option A — dedicated query (recommended, symmetric with `scriptExecutions`)

```graphql
extend type Query {
  """Execution history for one schedule (runs stamped with this scheduleId at dispatch)."""
  scriptScheduleExecutions(
    scheduleId: ID!
    filter: ScriptExecutionFilterInput
    search: String
    sort: SortInput
    first: Int
    after: String
    last: Int
    before: String
  ): ScriptExecutionConnection!

  """Filter facets for the above (Status / Device / Executed-by), scoped to the schedule."""
  scriptScheduleExecutionFilters(
    scheduleId: ID!
    filter: ScriptExecutionFilterInput
    search: String
  ): ScriptExecutionFilters!
}
```

Reuses `ScriptExecutionConnection`, `ScriptExecutionFilterInput`, and
`ScriptExecutionFilters` verbatim — the frontend table is a near-copy of the
per-script one. Facet semantics should match `scriptExecutionFilters` (exclude
each facet's own group when narrowing, so options don't vanish mid-multiselect).

### Option B — extend the existing query

Make `scriptId` optional on `scriptExecutions` / `scriptExecutionFilters` and add
`scheduleId` to the filter:

```graphql
input ScriptExecutionFilterInput {
  statuses: [ScriptExecutionStatus!]
  initiatorIds: [ID!]
  machineIds: [String!]
  scheduleIds: [ID!]      # ← new
}
```

Smaller surface, but `scriptExecutions(scriptId: ID!)` becoming optional is a
looser contract and mixes two access patterns in one field. Option A is cleaner.

## 4. Frontend plan once the query lands

`schedule-executions-tab.tsx` swaps its placeholder for a table that is a direct
port of `script-executions-tab.tsx` (`ScriptExecutionsTab`) — same columns
(Execution / Status / Device / Executed-by / Result), same `useApiParams` filter
state, same `usePaginationFragment` + facet-on-the-outer-query pattern. Only the
connection field and its key argument change (`scheduleId` instead of `scriptId`):

```graphql
# src/graphql/scripts/schedule-executions-relay.ts  (Option A)
query scheduleExecutionsRelayQuery($scheduleId: ID!, $filter: ScriptExecutionFilterInput,
                                   $search: String, $first: Int!, $after: String) {
  ...scheduleExecutionsRelay_query
    @arguments(scheduleId: $scheduleId, filter: $filter, search: $search, first: $first, after: $after)
  scriptScheduleExecutionFilters(scheduleId: $scheduleId, filter: $filter, search: $search) {
    statuses  { value label count }
    initiators { value label count }
    machines  { value label count }
  }
}

fragment scheduleExecutionsRelay_query on Query
  @refetchable(queryName: "scheduleExecutionsRelayPaginationQuery")
  @argumentDefinitions(
    scheduleId: { type: "ID!" }
    filter: { type: "ScriptExecutionFilterInput" }
    search: { type: "String" }
    first: { type: "Int", defaultValue: 20 }
    after: { type: "String" }
  ) {
  scriptScheduleExecutions(scheduleId: $scheduleId, filter: $filter, search: $search, first: $first, after: $after)
    @connection(key: "scheduleExecutionsRelay_scriptScheduleExecutions") {
    filteredCount
    edges { node {
      id executionId status dispatchedAt stdout stderr error
      machine { id machineId hostname displayName organization { id name } }
      initiator { id firstName lastName email image { imageUrl hash } }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
```

The single-execution details page (`scripts/v2/components/script-execution-details-view.tsx`)
and its `routes.scriptsV2.execution(id)` link already work for any execution node,
so rows can open into it unchanged.
