# Assigned Devices — GraphQL spec (Script Schedules v2)

> **Scope.** GraphQL queries/mutations needed to implement the two "Assigned Devices"
> views (screens: **Select Specific Devices** and **Select Devices by Criteria**)
> the way we settled on in the best-practice discussion.
>
> **Schema source.** Pulled from `https://test-dev.openframe.build/api/graphql` via
> `npm run fetch-schema` — the backend schema is **identical** to the committed
> `schema.graphql`. Everything marked **PROPOSED** below does **not exist yet** and
> is a backend ask.

---

## 0. Architecture decisions this spec encodes

1. **Separate server-side surface, works on an existing schedule id.** Device
   targeting is not staged inside the create form — it's edited against a real
   `scheduleId` (the create form only owns name/scripts/timing/platform). This
   sidesteps the "create has no id" blocker (`CreateScriptScheduleInput` has no
   `machineIds`; `setScriptScheduleDevices` needs an id).
2. **Two target modes**, mirroring the radio at the top of the screens:
   - `SPECIFIC` — static hand-pick (Available / Selected list).
   - `CRITERIA` — dynamic membership by filter; current **and future** matching
     devices are included automatically.
3. **Server-driven data always.** Pagination, search, filter counts come from the
   backend — never a client-held list. The candidate list can be 2000+.
4. **Immediate-commit (no Save button).** Each `+`/`−` is a committed fact via a
   **delta** mutation. The screen exits via **Done / Back**, not Save.
5. **Count from the mutation payload; list via refetch.** Mutations return
   `deviceCount` so Relay updates the tab label from the normalized store with no
   extra round-trip; the assigned list is refreshed by refetching its first page
   (never a manual `@appendEdge`, which would duplicate on later pagination — Relay
   dedups records by id but **not** edges).
6. **Blast-radius safety.** "Add All" and criteria show a resolved match **count**
   before applying; large/destructive bulk ops confirm.

---

## 1. What EXISTS today (reuse as-is)

Verified present in the pulled schema.

### Candidate devices — paginated, filtered, searchable
```graphql
type Query {
  devices(
    filter: DeviceFilterInput
    first: Int
    after: String
    last: Int
    before: String
    search: String
    sort: SortInput
  ): DeviceConnection!

  deviceFilters(filter: DeviceFilterInput): DeviceFilters!   # server-side facet counts
}

input DeviceFilterInput {
  statuses: [DeviceStatus!]
  deviceTypes: [DeviceType!]
  osTypes: [String!]
  organizationIds: [String!]
  tagKeys: [String!]
  tagValues: [String!]
}

type DeviceConnection { edges: [DeviceEdge!]!  pageInfo: PageInfo!  filteredCount: Int! }
type DeviceFilters {
  statuses: [DeviceFilterOption!]!
  deviceTypes: [DeviceFilterOption!]!
  osTypes: [DeviceFilterOption!]!
  organizationIds: [DeviceFilterOption!]!
  tagKeys: [TagFilterOption!]!
  filteredCount: Int!
}
```
`Machine` exposes everything both screens render: `id, machineId, hostname,
displayName, osType, type, status, lastSeen, organization { … }, serialNumber,
model, manufacturer, tags`.

### Schedule + current assignment (does NOT scale — see §2)
```graphql
type ScriptSchedule implements Node {
  id: ID!
  name: String!
  description: String
  supportedPlatforms: [ScriptPlatform!]
  assignedDevices: [Machine!]!   # ⚠ unbounded list, no pagination
  deviceCount: Int!
  # …
}

type Mutation {
  createScriptSchedule(input: CreateScriptScheduleInput!): ScriptSchedule!
  updateScriptSchedule(input: UpdateScriptScheduleInput!): ScriptSchedule!
  setScriptScheduleDevices(scheduleId: ID!, machineIds: [ID!]!): ScriptSchedule!  # ⚠ full REPLACE only
}
```
Enums available: `DeviceStatus`, `DeviceType`, `ScriptPlatform (WINDOWS|LINUX|MACOS)`.

---

## 2. Gaps — why today's schema can't deliver the best-practice views

| Need | Today | Consequence |
|------|-------|-------------|
| Paginate the **assigned** list | `assignedDevices: [Machine!]!` (whole list) | 504s at scale (already the schedule's slowest field); can't render the "Selected" tab paginated |
| **Immediate-commit** add/remove | only `setScriptScheduleDevices` (replace) | per-click requires holding the *entire* set client-side + races between clicks |
| **Add All / Remove All** at scale | none | client must enumerate every id — impossible at 2000 |
| Per-row **"is assigned to this schedule"** flag | none | candidate rows can't show ✓ without loading the full assigned set |
| **Criteria** (dynamic membership) | none | "Select Devices by Criteria" screen cannot be built |
| **Blast-radius preview** count for a criteria | none | no "this will target N devices" before applying |

---

## 3. PROPOSED backend additions (SDL)

> Marked PROPOSED — hand this section to backend. Naming is a suggestion.

### 3.1 Target mode on the schedule
```graphql
enum ScriptScheduleTargetMode { SPECIFIC  CRITERIA }

extend type ScriptSchedule {
  targetMode: ScriptScheduleTargetMode!          # drives the top radio
  criteria: ScriptScheduleCriteria               # non-null only when targetMode = CRITERIA
}

type ScriptScheduleCriteria {
  filter: DeviceFilterInput!                     # reuse the SAME filter vocabulary as `devices`
  search: String
  customCriteria: [String!]                      # free-form "key:value" chips from the screen
}
```

### 3.2 Paginated assigned devices (fixes §2 row 1)
```graphql
extend type ScriptSchedule {
  """Paginated, filterable, searchable — replaces the unbounded assignedDevices list for the UI."""
  assignedDevicesConnection(
    first: Int
    after: String
    search: String
    filter: DeviceFilterInput
    sort: SortInput
  ): MachineConnection!
}

type MachineConnection { edges: [MachineEdge!]!  pageInfo: PageInfo!  totalCount: Int! }
type MachineEdge { node: Machine!  cursor: String! }
```
`assignedDevices: [Machine!]!` may stay for back-compat but the UI stops using it.

### 3.3 Per-row membership flag (fixes §2 row 4)
Cheapest option — a boolean resolved against a schedule id, so a candidate row knows its ✓:
```graphql
extend type Machine {
  assignedToSchedule(scheduleId: ID!): Boolean!
}
```

### 3.4 Delta + bulk mutations (fixes §2 rows 2, 3) — immediate-commit
```graphql
type ScriptScheduleMutationResult {
  schedule: ScriptSchedule!   # returns { id, deviceCount } → Relay updates the label from the store
  affectedCount: Int!         # how many actually changed (for the toast)
}

extend type Mutation {
  addScriptScheduleDevices(scheduleId: ID!, machineIds: [ID!]!): ScriptScheduleMutationResult!
  removeScriptScheduleDevices(scheduleId: ID!, machineIds: [ID!]!): ScriptScheduleMutationResult!

  """Add ALL devices matching the current filter/search — server resolves + applies (idempotent, no-op on already-assigned)."""
  addScriptScheduleDevicesByFilter(scheduleId: ID!, filter: DeviceFilterInput, search: String): ScriptScheduleMutationResult!

  """Clear the whole static assignment."""
  removeAllScriptScheduleDevices(scheduleId: ID!): ScriptScheduleMutationResult!
}
```
All must be **idempotent** (add already-present = no-op) to survive rapid clicks.

### 3.5 Criteria — dynamic membership + preview (fixes §2 rows 5, 6)
```graphql
input ScriptScheduleCriteriaInput {
  filter: DeviceFilterInput!
  search: String
  customCriteria: [String!]
}

type CriteriaPreview {
  matchedCount: Int!          # "this will target N devices" — blast radius
  sampleDevices(first: Int = 20, after: String): MachineConnection!   # the preview list on screen 2
}

extend type Query {
  """Resolve a criteria WITHOUT saving — powers the live preview + count on screen 2."""
  scriptScheduleCriteriaPreview(criteria: ScriptScheduleCriteriaInput!): CriteriaPreview!
}

extend type Mutation {
  """Switch the schedule to CRITERIA mode and store the rule. Membership resolves dynamically at run time."""
  setScriptScheduleCriteria(scheduleId: ID!, criteria: ScriptScheduleCriteriaInput!): ScriptSchedule!

  """Switch back to SPECIFIC mode (keeps whatever was hand-picked, or clears — backend decision)."""
  setScriptScheduleTargetMode(scheduleId: ID!, mode: ScriptScheduleTargetMode!): ScriptSchedule!
}
```

---

## 4. Frontend operations (Relay) per screen

> File → operation naming follows the repo rule (operation name = camelCased file
> name). New `graphql\`\`` tags require `npm run relay`. Put files under
> `src/graphql/scripts/`. `[E]` = uses EXISTING schema, `[P]` = needs a PROPOSED
> addition from §3.

### Screen 1 — Select Specific Devices

**Available list — paginated candidates** `[E]`
`src/graphql/scripts/schedule-candidate-devices-relay.ts`
```graphql
query scheduleCandidateDevicesQuery(
  $filter: DeviceFilterInput
  $search: String
  $first: Int!
  $after: String
  $scheduleId: ID!            # [P] for the ✓ flag (§3.3); drop if not adopted
) {
  devices(filter: $filter, search: $search, first: $first, after: $after,
          sort: { field: "status", direction: DESC }) {
    edges {
      node {
        id machineId hostname displayName osType type status lastSeen
        serialNumber model
        organization { id name image { imageUrl hash } }
        assignedToSchedule(scheduleId: $scheduleId)   # [P] §3.3 → drives the row ✓
      }
      cursor
    }
    pageInfo { hasNextPage endCursor }
    filteredCount
  }
}
```
Wrap the `devices` connection in a `@connection` fragment + `usePaginationFragment`
for infinite scroll (mirror `notifications` reference impl). Feed
`filteredCount` into the toolbar total and the "Add all N" label.

**Filter facet counts** `[E]`
`src/graphql/scripts/schedule-device-filters-relay.ts`
```graphql
query scheduleDeviceFiltersQuery($filter: DeviceFilterInput) {
  deviceFilters(filter: $filter) {
    statuses      { value label count }
    deviceTypes   { value label count }
    osTypes       { value label count }
    organizationIds { value label count }
    tagKeys       { key value count }
    filteredCount
  }
}
```

**Selected list — paginated assignment** `[P]` §3.2
`src/graphql/scripts/script-schedule-assigned-devices-relay.ts`
```graphql
query scriptScheduleAssignedDevicesQuery($id: ID!, $first: Int!, $after: String, $search: String) {
  scriptSchedule(id: $id) {
    id
    deviceCount
    assignedDevicesConnection(first: $first, after: $after, search: $search) {
      edges { node { id machineId hostname displayName osType type status lastSeen
                     organization { id name image { imageUrl hash } } } cursor }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
```

**Add / Remove one — immediate commit** `[P]` §3.4
`src/graphql/scripts/add-script-schedule-devices-mutation.ts` (+ remove twin)
```graphql
mutation addScriptScheduleDevicesMutation($scheduleId: ID!, $machineIds: [ID!]!) {
  addScriptScheduleDevices(scheduleId: $scheduleId, machineIds: $machineIds) {
    schedule { id deviceCount }     # Relay updates "Selected (N)" from the store
    affectedCount
  }
}
```
Client flow per click:
- `optimisticResponse` flips the row + bumps `deviceCount`.
- `onError` → rollback + `useToast` destructive.
- `onCompleted` → refetch the **first page** of `scriptScheduleAssignedDevicesQuery`
  (`fetchPolicy: 'network-only'`). Do **not** `@appendEdge` (edge-level dup on later
  pagination). Count already came from the payload, so no count refetch.

**Add All by filter** `[P]` §3.4
`src/graphql/scripts/add-script-schedule-devices-by-filter-mutation.ts`
```graphql
mutation addScriptScheduleDevicesByFilterMutation($scheduleId: ID!, $filter: DeviceFilterInput, $search: String) {
  addScriptScheduleDevicesByFilter(scheduleId: $scheduleId, filter: $filter, search: $search) {
    schedule { id deviceCount }
    affectedCount
  }
}
```
Pass the **exact filter/search currently on the Available list** (WYSIWYG scope).
Confirm dialog shows `filteredCount`; toast shows `affectedCount`
("Added 47, 12 already assigned"). Then refetch both lists.

**Remove All** `[P]` §3.4 → `removeAllScriptScheduleDevices(scheduleId)` — always confirm (destructive).

### Screen 2 — Select Devices by Criteria

**Dropdown options (Customer / Type / OS)** — reuse `scheduleDeviceFiltersQuery` `[E]`
(the same `deviceFilters` facets populate the three selects).

**Live preview list + blast-radius count** `[P]` §3.5
`src/graphql/scripts/script-schedule-criteria-preview-relay.ts`
```graphql
query scriptScheduleCriteriaPreviewQuery($criteria: ScriptScheduleCriteriaInput!, $first: Int!, $after: String) {
  scriptScheduleCriteriaPreview(criteria: $criteria) {
    matchedCount                 # "Automatically includes N devices (current & future)"
    sampleDevices(first: $first, after: $after) {
      edges { node { id machineId hostname displayName osType type status lastSeen
                     organization { id name image { imageUrl hash } } } cursor }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
}
```
Map the screen-2 controls into `ScriptScheduleCriteriaInput`:
`Customer → filter.organizationIds`, `Type → filter.deviceTypes`,
`OS → filter.osTypes` (or `supportedPlatforms`), `Custom Criteria chips → filter.tagKeys/tagValues` (+ `customCriteria` free-form). Re-run the preview (debounced) on every change.

**Save criteria** `[P]` §3.5
`src/graphql/scripts/set-script-schedule-criteria-mutation.ts`
```graphql
mutation setScriptScheduleCriteriaMutation($scheduleId: ID!, $criteria: ScriptScheduleCriteriaInput!) {
  setScriptScheduleCriteria(scheduleId: $scheduleId, criteria: $criteria) {
    id targetMode deviceCount criteria { filter { statuses deviceTypes osTypes organizationIds tagKeys tagValues } search customCriteria }
  }
}
```

**Mode switch (radio)** `[P]` §3.5 → `setScriptScheduleTargetMode(scheduleId, mode)`.
Read current mode from `scriptSchedule { targetMode }` to seed the radio.

---

## 5. Data-flow rules (the glue)

- **No Save.** Screen exits via **Done / Back** →
  `routes.scriptsV2.schedules.details(scheduleId, { tab: 'devices' })` via
  `safeBackOrReplace`. **No unsaved-changes guard** — nothing is pending.
- **Count** always from the mutation payload (`schedule.deviceCount`); Relay
  re-renders the label. Never a separate count query per click.
- **Assigned list** refreshed by refetching its first page, not by manual edge
  insertion (avoids the record-vs-edge duplication).
- **Toasts** mandatory on every mutation error (`useToast`, per CLAUDE.md); success
  is silent or a subtle "saved" + `affectedCount` on bulk.
- **Idempotency + per-row in-flight disable** to survive rapid clicks.

---

## 6. Phasing (what ships when)

| Phase | Needs backend? | Delivers |
|-------|----------------|----------|
| **P1 — server-driven picker** | No (existing schema) | Available list paginated/searched/filtered (`devices` + `deviceFilters`). Fixes "can't find device #500". Selection still via `setScriptScheduleDevices` (replace) with a `Map`-based diff store + one Save. |
| **P2 — immediate-commit at scale** | Yes — §3.2, §3.3, §3.4 | Paginated assigned list, delta add/remove (no Save), Add All / Remove All by filter, row ✓ flag. This is the target Specific-Devices UX. |
| **P3 — criteria** | Yes — §3.5 | "Select Devices by Criteria": dynamic membership, live preview + blast-radius count, mode switch. The RMM/MSP endgame (future devices auto-join). |

**P1 is the only phase buildable against today's schema.** P2 and P3 are blocked on
the PROPOSED additions in §3.
