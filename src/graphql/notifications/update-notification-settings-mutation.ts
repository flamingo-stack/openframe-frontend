import { graphql } from 'react-relay';

export const updateNotificationSettingsMutation = graphql`
  mutation updateNotificationSettingsMutation($pushEnabled: Boolean!) {
    updateNotificationSettings(pushEnabled: $pushEnabled) {
      pushEnabled
    }
  }
`;
