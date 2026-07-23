import { graphql } from 'react-relay';

export const unregisterPushDeviceMutation = graphql`
  mutation unregisterPushDeviceMutation($token: String!) {
    unregisterPushDevice(token: $token)
  }
`;
