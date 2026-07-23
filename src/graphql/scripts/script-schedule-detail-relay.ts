import { graphql } from 'react-relay';

/**
 * Single schedule query (v2). Resolves the schedule itself and the scripts it
 * runs (in run order) — everything the detail / edit / devices pages need
 * EXCEPT the assigned machines. `assignedDevices` deliberately lives in its own
 * query (`script-schedule-devices-relay.ts`): the per-machine resolution is
 * heavy enough to 504 on real fleets, so only the views that actually render
 * devices pay for it.
 */
export const scriptScheduleDetailRelayQuery = graphql`
  query scriptScheduleDetailRelayQuery($id: ID!) {
    scriptSchedule(id: $id) {
      id
      name
      description
      supportedPlatforms
      status
      deviceCount
      startAt
      repeat
      nextRunAt
      lastRunAt
      scripts {
        id
        name
        shell
        supportedPlatforms
        defaultTimeoutSeconds
        defaultArgs
        envVars {
          name
          value
        }
      }
    }
  }
`;
