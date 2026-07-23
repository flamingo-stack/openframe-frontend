'use client';

import { Button, Skeleton, Switch } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useEffect, useId, useState } from 'react';
import { fetchQuery, useMutation, useRelayEnvironment } from 'react-relay';
import type { notificationSettingsRelayQuery as NotificationSettingsRelayQueryType } from '@/__generated__/notificationSettingsRelayQuery.graphql';
import type { updateNotificationSettingsMutation as UpdateNotificationSettingsMutationType } from '@/__generated__/updateNotificationSettingsMutation.graphql';
import { SimpleModal } from '@/app/components/shared/simple-modal';
import { notificationSettingsRelayQuery } from '@/graphql/notifications/notification-settings-relay';
import { updateNotificationSettingsMutation } from '@/graphql/notifications/update-notification-settings-mutation';
import { getErrorMessage } from '@/lib/handle-api-error';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
  const { toast } = useToast();
  const switchId = useId();
  const environment = useRelayEnvironment();

  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [commitUpdate, isSaving] = useMutation<UpdateNotificationSettingsMutationType>(
    updateNotificationSettingsMutation,
  );

  useEffect(() => {
    if (!isOpen) {
      setPushEnabled(null);
      return;
    }
    
    const subscription = fetchQuery<NotificationSettingsRelayQueryType>(
      environment,
      notificationSettingsRelayQuery,
      {},
      { fetchPolicy: 'store-or-network' },
    ).subscribe({
      next: data => setPushEnabled(data.notificationSettings.pushEnabled),
      error: (error: unknown) => {
        toast({
          title: 'Error',
          description: getErrorMessage(error) || 'Failed to load notification settings',
          variant: 'destructive',
        });
      },
    });
    return () => subscription.unsubscribe();
  }, [isOpen, environment, toast]);

  const isLoading = pushEnabled === null;

  const handleSave = () => {
    if (pushEnabled === null) return;
    commitUpdate({
      variables: { pushEnabled },
      // NotificationSettings has no id, so the payload doesn't auto-merge into the
      // query root — relink it manually to keep `notificationSettings` fresh.
      updater: store => {
        const payload = store.getRootField('updateNotificationSettings');
        if (payload) store.getRoot().setLinkedRecord(payload, 'notificationSettings');
      },
      onCompleted: () => {
        toast({
          title: 'Notifications Updated',
          description: 'Your notification settings have been saved.',
          variant: 'success',
        });
        onClose();
      },
      onError: error => {
        toast({
          title: 'Error',
          description: getErrorMessage(error) || 'Failed to update notification settings',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <SimpleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Notifications"
      className="max-w-[600px]"
      footer={
        <>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 h-12 bg-ods-card border-ods-border text-ods-text-primary text-h3 hover:bg-ods-bg"
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="flex-1 h-12 bg-ods-accent text-ods-text-on-accent text-h3 hover:bg-ods-accent/90"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <Skeleton className="h-12 w-full rounded-md" />
      ) : (
        <div className="bg-ods-card border border-ods-border rounded-md p-[var(--spacing-system-sf)] flex items-center gap-[var(--spacing-system-s)]">
          <Switch id={switchId} checked={pushEnabled} onCheckedChange={setPushEnabled} disabled={isSaving} />
          <label htmlFor={switchId} className="flex-1 min-w-0 truncate text-h4 text-ods-text-primary">
            Enable Notifications
          </label>
        </div>
      )}
    </SimpleModal>
  );
}
