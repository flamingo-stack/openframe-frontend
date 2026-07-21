import { graphql } from 'react-relay';

/**
 * The machines assigned to a schedule — split out of
 * `scriptScheduleDetailRelayQuery` because the per-machine resolution is the
 * schedule's slowest field (observed 504 via the LB on test-dev), so only the
 * Assigned Devices tab and the Edit Devices page mount it. `organization` is
 * intentionally NOT selected — it fans out one lookup per machine (N+1) and no
 * schedule view renders it.
 */
export const scriptScheduleDevicesRelayQuery = graphql`
  query scriptScheduleDevicesRelayQuery($id: ID!) {
    scriptSchedule(id: $id) {
      id
      deviceCount
      assignedDevices {
        id
        machineId
        hostname
        displayName
        osType
        status
      }
    }
  }
`;
