import { graphql } from 'react-relay';

export const registerPushDeviceMutation = graphql`
  mutation registerPushDeviceMutation($token: String!, $platform: PushPlatform!) {
    registerPushDevice(token: $token, platform: $platform)
  }
`;
