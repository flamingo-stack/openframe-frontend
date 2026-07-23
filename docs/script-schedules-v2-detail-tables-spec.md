# Script Schedules v2 — Detail-page tables (GraphQL backend spec)

> **Scope.** The read surface for the three server-driven tables on the schedule
> detail page — **Assigned Devices**, **Runs**, **Executions**. All three follow
> **one** pattern; this doc is the consolidated backend ask so the work lands in a
> single pass instead of three.
>
> **Schema source.** Committed `schema.graphql` (identical to `/api/graphql` via
> `npm run fetch-schema`). `EXISTS` = present today; `PROPOSED` = new backend work.
>
> **Supersedes placement in** `script-schedules-v2-execution-history-spec.md`
> (which proposed a top-level `scriptScheduleExecutions(scheduleId:)`). Per the
> decision in §1, the executions read moves onto the `ScriptSchedule` node, so the
> other doc's *query shape* stands but its *placement* is replaced here.
> Assignment **mutations** (delta add/remove, bulk, criteria) stay in
> `src/app/(app)/scripts/v2/components/assigned-devices-graphql-spec.md` — this doc
> is reads only.

---

## 1. The one pattern (applies to all three tables)

Every server-driven table in this codebase is a **pair**: a Relay `Connection`
field + a scoped `*Filters` facets field, both read in **one** operation (facets on
the outer query, connection in the `@refetchable` fragment, so `loadNext` never
refetches the facets). Established by `scripts`+`scriptFilters`,
`scriptExecutions`+`scriptExecutionFilters`, `devices`+`deviceFilters`,
`scriptSchedules`+`scriptScheduleFilters`.

For the schedule detail tables, **both fields of each pair live on the
`ScriptSchedule` node**, not on the root `Query`:

```graphql
type ScriptSchedule implements Node {
  # … existing fields …
  <table>Connection(filter, search, sort, first, after, last, before): <T>Connection!
  <table>Filters(filter, search): <T>Filters!
}
```

**Why on the node and not top-level** (unlike `scriptExecutionFilters(scriptId:)`):
the connections are an upgrade of the existing `ScriptSchedule.assignedDevices`
field — they already belong to the node. The convention isn't "facets live on
`Query`", it's "**facets live wherever their connection lives and share its
scope**". `scriptExecutionFilters` sits on `Query` only because `scriptExecutions`
does. Here the connections are node fields, so:

- **no `scheduleId` argument** — the parent *is* the scope;
- one read per tab: `scriptSchedule(id:){ <table>Filters(...) …<table>Connection fragment }`;
- `usePaginationFragment` refetches via `node(id: $id){ …fragment }`, so a facets
  field selected on `scriptSchedule` (outside the fragment) is never refetched by
  pagination — same guarantee the top-level pairs have today.

**Shared rules for every pair below**

- Connection args are the standard set: `filter`, `search`, `sort: SortInput`,
  `first/after/last/before`. Each connection exposes `filteredCount: Int!`.
- Facet semantics match `scriptExecutionFilters`: when narrowing, **exclude each
  facet's own group**, so a group's options never vanish while the user
  multi-selects within it. Facet options are the shared
  `ScriptFilterOption { value, label, count }` (or `DeviceFilterOption` /
  `TagFilterOption` for the device facets).
- `@connection` needs stable cursors — every `*Edge` carries `cursor: String!`.

---

## 2. Table A — Assigned Devices  *(reuses existing types)*

The paginated, filterable replacement for the unbounded
`ScriptSchedule.assignedDevices: [Machine!]!`.

```graphql
extend type ScriptSchedule {
  """Paginated / filterable / searchable assigned machines — the Selected list."""
  assignedDevicesConnection(
    filter: DeviceFilterInput
    search: String
    sort: SortInput
    first: Int
    after: String
    last: Int
    before: String
  ): DeviceConnection!            # EXISTS: { edges, pageInfo, filteredCount }

  """Facets for the above, scoped to THIS schedule's assigned set."""
  assignedDeviceFilters(
    filter: DeviceFilterInput
    search: String
  ): DeviceFilters!               # EXISTS: { statuses, deviceTypes, osTypes, organizationIds, tagKeys, filteredCount }
}
```

- `DeviceConnection`, `DeviceFilterInput`, `DeviceFilters`, `Machine` all **EXIST**
  — the only backend work is the two node resolvers (both scoped to the schedule's
  assignment collection).
- Keep `assignedDevices: [Machine!]!` for back-compat or drop it once the UI is
  fully on the connection.
- `assignedDeviceFilters` is what makes the Selected-list dropdowns show counts
  scoped to the schedule (the global `deviceFilters` would count the whole fleet).
- **N+1 note:** `Machine.organization` fans out one lookup per row unless batched.

---

## 3. Table B — Runs  *(NEW aggregate type)*

A **run** is one dispatch of the schedule — one "fire", scheduled or manual —
grouping the executions it produced under a shared id. `Run 1 → N executions`
(one per script × machine). This is the schedule-level history the Executions tab
(§4) can't express because it's flat.

> **⚠ ASSUMPTION — confirm before building.** This models `run = one dispatch`,
> keyed by the **shared `executionId`** that `ScriptExecution` records already carry
> (`batchRunScript` docs: "a single executionId shared across all scripts and
> machines"). If the backend has no way to group executions into a dispatch (shared
> id + dispatch timestamp), the Runs table needs a real aggregate/materialization —
> that's the bulk of the work here. If "run" and "execution" are the same thing in
> your model, **drop this table** and keep only §2 + §4.

```graphql
enum ScheduleRunTrigger { SCHEDULED  MANUAL }          # MANUAL = runScheduleJobNow

enum ScheduleRunStatus  { RUNNING  SUCCESS  FAILED  PARTIAL }  # PARTIAL = mixed exit results
# (or reuse ScriptExecutionStatus if PARTIAL isn't wanted)

type ScheduleRun implements Node {
  id: ID!
  runId: ID!                     # the shared executionId of the dispatch — correlates its ScriptExecutions
  scheduleId: ID!
  trigger: ScheduleRunTrigger!
  status: ScheduleRunStatus!     # aggregate over the run's executions
  startedAt: Instant!
  finishedAt: Instant            # null while RUNNING
  deviceCount: Int!
  scriptCount: Int!
  successCount: Int!
  failureCount: Int!
  runningCount: Int!
  initiator: User                # who fired a MANUAL run; null for SCHEDULED
}

type ScheduleRunConnection { edges: [ScheduleRunEdge!]!  pageInfo: PageInfo!  filteredCount: Int! }
type ScheduleRunEdge       { node: ScheduleRun!  cursor: String! }

input ScheduleRunFilterInput {
  statuses:  [ScheduleRunStatus!]
  triggers:  [ScheduleRunTrigger!]
}

type ScheduleRunFilters {
  statuses: [ScriptFilterOption!]!   # EXISTS: { value, label, count }
  triggers: [ScriptFilterOption!]!
  filteredCount: Int!
}

extend type ScriptSchedule {
  runsConnection(
    filter: ScheduleRunFilterInput
    search: String
    sort: SortInput               # sortable: startedAt (default DESC), status
    first: Int
    after: String
    last: Int
    before: String
  ): ScheduleRunConnection!

  runFilters(filter: ScheduleRunFilterInput, search: String): ScheduleRunFilters!
}
```

- A Runs row **drills into** the Executions tab filtered to that run — see the
  `executionIds` filter added in §4.
- Related mutations already **EXIST**: `runScheduleJobNow(scheduleId)` starts a
  MANUAL run; `cancelExecution(input:{ executionId })` can cancel a run in flight.

---

## 4. Table C — Executions  *(reuses existing types + one filter field)*

The flat per-script-per-machine history for the whole schedule. `ScriptExecution`,
`ScriptExecutionConnection`, `ScriptExecutionFilters` all **EXIST**, and
`ScriptExecution.scheduleId` is already stamped at dispatch — only the node
read surface and one drill-down filter field are missing.

```graphql
input ScriptExecutionFilterInput {   # EXTEND the existing input
  statuses:     [ScriptExecutionStatus!]
  initiatorIds: [ID!]
  machineIds:   [String!]
  executionIds: [ID!]                # PROPOSED — Runs→Executions drill-down (the run's shared executionId)
}

extend type ScriptSchedule {
  """This schedule's executions (all runs), newest first."""
  executionsConnection(
    filter: ScriptExecutionFilterInput
    search: String
    sort: SortInput                  # sortable: dispatchedAt (default DESC), status
    first: Int
    after: String
    last: Int
    before: String
  ): ScriptExecutionConnection!      # EXISTS: { edges, pageInfo, filteredCount }

  executionFilters(
    filter: ScriptExecutionFilterInput
    search: String
  ): ScriptExecutionFilters!         # EXISTS: { statuses, initiators, machines, filteredCount }
}
```

- Both resolvers scope on `ScriptExecution.scheduleId == parent.id` (the node).
- `executionIds: [ID!]` lets the Runs table open `executionsConnection(filter:{ executionIds:[runId] })`.
- The single-execution details page (`routes.scriptsV2.execution(id)`) already
  renders any `ScriptExecution` node — rows open into it unchanged.

---

## 5. Frontend Relay shape (canonical — the other two mirror it)

One operation per tab, on `scriptSchedule(id:)`: facets in the outer selection, the
connection in a `@refetchable` fragment **on `ScriptSchedule`**. Executions shown;
Machines and Runs are structurally identical (swap the field + filter/facet types).

```graphql
# src/graphql/scripts/schedule-executions-relay.ts
query scheduleExecutionsRelayQuery(
  $id: ID!, $filter: ScriptExecutionFilterInput, $search: String, $first: Int!, $after: String
) {
  scriptSchedule(id: $id) {
    id
    executionFilters(filter: $filter, search: $search) {
      statuses   { value label count }
      initiators { value label count }
      machines   { value label count }
    }
    ...scheduleExecutionsRelay_schedule
      @arguments(filter: $filter, search: $search, first: $first, after: $after)
  }
}

fragment scheduleExecutionsRelay_schedule on ScriptSchedule
  @refetchable(queryName: "scheduleExecutionsRelayPaginationQuery")
  @argumentDefinitions(
    filter: { type: "ScriptExecutionFilterInput" }
    search: { type: "String" }
    first:  { type: "Int", defaultValue: 20 }
    after:  { type: "String" }
  ) {
  executionsConnection(filter: $filter, search: $search, first: $first, after: $after)
    @connection(key: "scheduleExecutionsRelay_executionsConnection") {
    filteredCount
    edges { node {
      id executionId status dispatchedAt exitCode stdout stderr error
      machine   { id machineId hostname displayName organization { id name } }
      initiator { id firstName lastName email image { imageUrl hash } }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
```

- `usePaginationFragment` on this fragment refetches via `node(id: $id){ …fragment }`,
  so `executionFilters` (outer selection) is untouched by `loadNext` — one round-trip
  per filter/search interaction, pagination is facet-free.
- The three tabs are near-copies of `ScriptExecutionsTab` /
  `DeviceSelector`-based views already in `scripts/v2` — same columns, same
  `useApiParams` filter state, same facet-on-outer-query wiring.

---

## 6. Open decisions for backend

1. **run vs execution model (§3)** — is a "run" one dispatch grouping executions by
   shared `executionId`, or is it a synonym for `execution`? Determines whether
   Table B exists at all.
2. **Run grouping source** — is there already a shared `executionId` + dispatch
   timestamp per fire to group on, or must runs be materialized?
3. **`ScheduleRunStatus`** — dedicated enum with `PARTIAL`, or reuse
   `ScriptExecutionStatus`?
4. **Field naming** — `assignedDevicesConnection` keeps the legacy list side-by-side;
   `runsConnection` / `executionsConnection` have no legacy field, so they could drop
   the `Connection` suffix (`runs` / `executions`) if you prefer. Pick one style.
5. **Back-compat** — keep or remove `ScriptSchedule.assignedDevices: [Machine!]!`
   once the connection ships.

---

## 7. Full proposed SDL (one block)

```graphql
enum ScheduleRunTrigger { SCHEDULED  MANUAL }
enum ScheduleRunStatus  { RUNNING  SUCCESS  FAILED  PARTIAL }

type ScheduleRun implements Node {
  id: ID!  runId: ID!  scheduleId: ID!
  trigger: ScheduleRunTrigger!  status: ScheduleRunStatus!
  startedAt: Instant!  finishedAt: Instant
  deviceCount: Int!  scriptCount: Int!
  successCount: Int!  failureCount: Int!  runningCount: Int!
  initiator: User
}
type ScheduleRunConnection { edges: [ScheduleRunEdge!]!  pageInfo: PageInfo!  filteredCount: Int! }
type ScheduleRunEdge       { node: ScheduleRun!  cursor: String! }
input ScheduleRunFilterInput { statuses: [ScheduleRunStatus!]  triggers: [ScheduleRunTrigger!] }
type ScheduleRunFilters { statuses: [ScriptFilterOption!]!  triggers: [ScriptFilterOption!]!  filteredCount: Int! }

input ScriptExecutionFilterInput {
  statuses: [ScriptExecutionStatus!]  initiatorIds: [ID!]  machineIds: [String!]  executionIds: [ID!]
}

extend type ScriptSchedule {
  assignedDevicesConnection(filter: DeviceFilterInput, search: String, sort: SortInput, first: Int, after: String, last: Int, before: String): DeviceConnection!
  assignedDeviceFilters(filter: DeviceFilterInput, search: String): DeviceFilters!

  runsConnection(filter: ScheduleRunFilterInput, search: String, sort: SortInput, first: Int, after: String, last: Int, before: String): ScheduleRunConnection!
  runFilters(filter: ScheduleRunFilterInput, search: String): ScheduleRunFilters!

  executionsConnection(filter: ScriptExecutionFilterInput, search: String, sort: SortInput, first: Int, after: String, last: Int, before: String): ScriptExecutionConnection!
  executionFilters(filter: ScriptExecutionFilterInput, search: String): ScriptExecutionFilters!
}
```
