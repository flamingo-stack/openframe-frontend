'use client';

import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';

interface RestoreScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}

/** Confirmation for restoring an archived schedule back to ACTIVE. */
export function RestoreScheduleModal({ open, onOpenChange, onConfirm, isPending }: RestoreScheduleModalProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Restore Schedule"
      description="This schedule will be moved back to your active schedules."
      confirmLabel="Restore Schedule"
      cancelLabel="Cancel"
      pendingLabel="Restoring..."
      variant="default"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}
