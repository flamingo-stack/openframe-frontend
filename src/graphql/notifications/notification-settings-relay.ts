import { graphql } from 'react-relay';

export const notificationSettingsRelayQuery = graphql`
  query notificationSettingsRelayQuery {
    notificationSettings {
      pushEnabled
    }
  }
`;
