import { graphql } from 'react-relay';

/**
 * Replaces the full set of devices assigned to a schedule (PUT semantics —
 * backs "Edit Devices"). `machineIds` are Machine GLOBAL ids (`Machine.id`),
 * not the `machineId` string field. Selects the updated assignment so the
 * detail page's Assigned Devices tab and the list's DEVICES count re-render
 * straight from the mutation payload.
 */
export const setScriptScheduleDevicesMutation = graphql`
  mutation setScriptScheduleDevicesMutation($scheduleId: ID!, $machineIds: [ID!]!) {
    setScriptScheduleDevices(scheduleId: $scheduleId, machineIds: $machineIds) {
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
