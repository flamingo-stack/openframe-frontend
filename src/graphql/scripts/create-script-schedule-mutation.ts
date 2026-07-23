import { graphql } from 'react-relay';

/**
 * Creates a schedule. Selects the fields the detail page reads so the store is
 * warm when the create flow replaces the URL with the new schedule's detail
 * page (its `store-and-network` read renders instantly from this payload).
 */
export const createScriptScheduleMutation = graphql`
  mutation createScriptScheduleMutation($input: CreateScriptScheduleInput!) {
    createScriptSchedule(input: $input) {
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
