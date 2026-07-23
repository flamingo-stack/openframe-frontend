import { graphql } from 'react-relay';

/**
 * Full replacement (PUT semantics) of a schedule. Selects every editable field
 * (mirrors `scriptScheduleDetailRelayQuery`) so Relay merges the full updated
 * node into the store by `id` and the detail page re-renders without waiting on
 * its own refetch. Keep this selection in sync with the detail query.
 */
export const updateScriptScheduleMutation = graphql`
  mutation updateScriptScheduleMutation($input: UpdateScriptScheduleInput!) {
    updateScriptSchedule(input: $input) {
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
