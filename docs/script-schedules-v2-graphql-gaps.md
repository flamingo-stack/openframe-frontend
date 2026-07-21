# Script Schedules — GraphQL Backend Gaps

What the OpenFrame GraphQL API (`/api/graphql`) is missing for the Script Schedules
pages (list, details, create/edit, edit-devices). The frontend for all of these is
already built on Relay against the current schema — each gap below is the backend
work that would light up the corresponding UI.

## 1. Schedule timing & repeat — the core gap

`ScriptSchedule` has **no timing fields at all**: no run date/time, no cron, no repeat
interval, no event trigger. `CreateScriptScheduleInput` / `UpdateScriptScheduleInput`
can't write them either. The design needs both a concrete date+time
(`09/15/2024 02:00 AM`) and an event trigger (`Device Online`), plus repeat intervals
(`5 Minutes`, `3 Days`, `1 Week`, `1 Month`, one-off).

Suggested shape: `trigger: DATE_TIME | DEVICE_ONLINE`, `runAt: Instant`,
`repeatIntervalSeconds: Int` (or an enum'd interval) — readable on the type, writable
on both inputs, and **sortable** in `scriptSchedules(sort:)` (the list design sorts by
the REPEAT column).

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

## 4. Execution history

There is no per-schedule run-history query (`scriptScheduleExecutions(...)` or
similar), so the "Execution History" tab cannot exist. Needs a cursor-paginated log:
schedule id → runs (device, status, retcode, stdout/stderr, started/finished at),
ideally filterable by device and status.

## 5. Enable / pause toggle

Legacy schedules had `enabled: boolean`; the GraphQL model only has
`status: ACTIVE | ARCHIVED | DELETED`. Pausing a schedule without archiving it is not
expressible.

## 6. `assignedDevices` is a flat list

`[Machine!]!` with no pagination/search/filter — fine at current fleet sizes, but it
should eventually be a Relay connection (the devices tab renders the full array).
Also note `Machine.organization` fans out one lookup per machine (N+1) unless batched.

## 7. Sorting & search (minor)

- `scriptSchedules(sort:)` supports only `_id`, `name`, `createdAt`, `updatedAt` —
  no `deviceCount` (the list design sorts the DEVICES column) and no
  `statusChangedAt` (no "recently archived first" on the archive page).
- `search` is a name-only substring match; the list UI also shows `description`,
  which is not searched.
