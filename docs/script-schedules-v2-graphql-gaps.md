# Script Schedules — GraphQL Backend Gaps

What the OpenFrame GraphQL API (`/api/graphql`) is missing for the Script Schedules
pages (list, details, create/edit, edit-devices). The frontend for all of these is
already built on Relay against the current schema — each gap below is the backend
work that would light up the corresponding UI.

## 1. Schedule timing & repeat — ✅ DELIVERED

`ScriptSchedule` now exposes `startAt: Instant` (first run, pinned to a 30-minute
boundary), `repeat: Long` (recurrence interval in seconds, a whole number of 30-min
slots; null = one-shot), plus read-only `nextRunAt` / `lastRunAt`. Both
`CreateScriptScheduleInput` and `UpdateScriptScheduleInput` accept `startAt` + `repeat`.

The frontend is wired to these: the list's DATE & TIME / REPEAT columns, the detail
info bar, and the create/edit form's date-time picker + repeat controls all read/write
them (`src/app/(app)/scripts/v2/utils/schedule-timing.ts`).

**Still not modelled (deferred, not blocking):** the event trigger (`Device Online`)
and sub-30-minute intervals (`5 Minutes`) from the original design — the backend model
is seconds on a 30-minute grid only, so the UI offers hour/day/week/month units.

## 2. `assignedDevices` resolver hangs — request dies with 504 (bug)

Any `scriptSchedule(id)` query selecting `assignedDevices` never completes: the request
hangs until the LB timeout (504; reproduced on test-dev with 0–1 assigned devices).

Root cause — `ScriptScheduleDataFetcher.assignedDevices` (openframe-oss-lib,
`openframe-api-service-core/.../datafetcher/ScriptScheduleDataFetcher.java`) **chains
two DataLoaders**:

```java
idsLoader.load(schedule.getId()).thenCompose(machineIds ->
        machineLoader.loadMany(machineIds).thenApply(...))
```

In graphql-java/DGS, batches are dispatched when the field-resolution level completes;
loads enqueued from inside another loader's `thenCompose` are never dispatched again
(ticker mode is not enabled anywhere), so `machineDataLoader`'s future never resolves.
That's also why `deviceCount` works — it uses the ids loader alone.

Fix options:
- *(preferred)* one mapped loader `scheduleId → List<Machine>` doing both lookups in a
  single batch function (`getMachineIdsByScheduleIds` + one `findByMachineIdIn` over
  the union), resolved synchronously on the request thread (`TenantIdProvider` reads
  tenant context from it);
- or enable `dgs.graphql.dataloader.ticker-mode-enabled: true` globally.

## 3. Per-script overrides inside a schedule

The legacy (Tactical) model stored per-action `timeout`, `script_args`, `env_vars`;
`CreateScriptScheduleInput` takes bare `scriptIds` only, so a schedule can't override
anything per script — scripts run with their own defaults. If overrides should return,
the input needs something like
`scriptEntries: [{ scriptId, timeoutSeconds, args, envVars }]` (and the type a matching
read shape).

## 4. Execution history — partially unblocked; read surface still missing

`ScriptExecution` now carries `scheduleId` (stamped at dispatch) and the full run
record (status / exitCode / stdout / stderr / timings), but there is still **no query
keyed by schedule** — `scriptExecutions(...)` requires `scriptId` and the filter has no
`scheduleId`. So the "Execution History" tab ships as a stub
(`schedule-executions-tab.tsx`).

Full ask + the exact Relay operation the frontend will use once it lands:
**`docs/script-schedules-v2-execution-history-spec.md`** (recommended:
`scriptScheduleExecutions(scheduleId, …): ScriptExecutionConnection!`).

## 5. Enable / pause toggle

Legacy schedules had `enabled: boolean`; the GraphQL model only has
`status: ACTIVE | ARCHIVED | DELETED`. Pausing a schedule without archiving it is not
expressible.

## 6. `assignedDevices` is a flat list

`[Machine!]!` with no pagination/search/filter — fine at current fleet sizes, but it
should eventually be a Relay connection (the devices tab renders the full array).
Also note `Machine.organization` fans out one lookup per machine (N+1) unless batched.

## 7. Sorting & search (minor)

- `scriptSchedules(sort:)` now accepts `_id`, `name`, `createdAt`, `updatedAt`,
  **`repeat`, `deviceCount`** — the REPEAT and DEVICES columns are sortable
  server-side (the frontend table hasn't wired the sort UI to it yet). Still no
  `statusChangedAt` (no "recently archived first" on the archive page) and no
  `startAt` sort (the DATE & TIME column).
- `search` is a name-only substring match; the list UI also shows `description`,
  which is not searched.
