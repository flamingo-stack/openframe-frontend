# Script Schedules (scripts-v2) — Backend Gaps

Design: [Figma — Scripts Schedules list](https://www.figma.com/design/XB2lMBTaKLH9aw2K1l6Tqa/openframe---scripts?node-id=1-20380&m=dev)
Frontend: `/scripts-v2/schedules` (+ `/scripts-v2/schedules/archived`), Relay query `scriptSchedulesTableRelayQuery`.

## Already covered by `schema.graphql`

- `scriptSchedules(filter, search, sort, first, after, …)` — cursor pagination, name search, `filteredCount` (the "80 results" counter)
- `scriptScheduleFilters(filter)` — platform/author facets for the OS filter
- `ScriptSchedule.name / description / supportedPlatforms / deviceCount / scripts / author` — SCRIPT, OS, DEVICES columns
- Mutations: `createScriptSchedule`, `updateScriptSchedule`, `deleteScriptSchedule`, `archiveScriptSchedule`, `unarchiveScriptSchedule`, `setScriptScheduleDevices`

## Missing for this screen

1. **Schedule timing (DATE & TIME column).** `ScriptSchedule` has no timing fields at all — no start date/time, no cron, and no event-trigger kind. The design shows both a concrete date+time (`09/15/2024 02:00 AM`) and an event trigger (`Device Online`), so the model needs something like `trigger: DATE_TIME | DEVICE_ONLINE` + `runAt: Instant`.
2. **Repeat interval (REPEAT column).** No repeat/interval field. Design values: `5 Minutes`, `3 Days`, `1 Week`, `1 Month`, and `–` for one-off/trigger schedules.
3. **Sorting.** The design has sort toggles on REPEAT and DEVICES; `SortInput.field` for `scriptSchedules` only supports `_id`, `name`, `createdAt`, `updatedAt`. Once timing/repeat fields exist they must be sortable, and `deviceCount` sorting is also missing.
4. *(minor)* **Search scope.** `search` is a name-only substring match; the SCRIPT column renders `description` too, but it is not searched.

Until 1–2 land, the frontend renders DATE & TIME and REPEAT as `—` placeholders
(see the `TODO(backend)` comments in
`src/app/(app)/scripts/v2/components/script-schedules-table.tsx`).

## Archived schedules — verified, fully covered

- `ScriptScheduleFilterInput.statuses: [ARCHIVED]` scopes the list ✅ (default/null hides only `DELETED`, so explicit statuses are required to split active vs archived)
- `archiveScriptSchedule` / `unarchiveScriptSchedule` — idempotent, throw on unknown/soft-deleted id ✅
- `scriptScheduleFilters` accepts the same statuses filter, so facets scope to the archive ✅
- `statusChangedAt: Instant` is available as an "archived at" timestamp ✅

Only gap on top of the shared ones above: `statusChangedAt` is **not sortable**
(no "recently archived first" ordering).

### Archive parity with regular scripts — checked, identical

Backend: `archiveScriptSchedule` / `unarchiveScriptSchedule` / `deleteScriptSchedule` carry the
same contract as `archiveScript` / `unarchiveScript` / `deleteScript` (idempotent, throw on
unknown or soft-deleted id, same `statuses` filter defaults) — no backend follow-up needed.

Frontend mirrors the scripts archive flow one-to-one: confirm modal → mutation with
`@deleteEdge` + record invalidation for other cached connections → success/error toast →
facet refresh; header Archive button → dedicated archived page (back button, no actions,
`statuses: [ARCHIVED]`). The only row-menu difference (no Run/Edit items on schedules) comes
from the missing v2 schedule detail/edit pages, not from the archive flow.
