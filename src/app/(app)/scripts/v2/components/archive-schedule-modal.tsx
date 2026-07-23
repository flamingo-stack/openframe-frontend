'use client';

import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';

interface ArchiveScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
}

/** Confirmation for archiving a schedule (status → ARCHIVED). Reversible via Restore. */
export function ArchiveScheduleModal({ open, onOpenChange, onConfirm, isPending }: ArchiveScheduleModalProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Archive Schedule"
      description="This schedule will be moved to Archived Schedules. It won't run or appear in your active schedules, but you can restore it at any time."
      confirmLabel="Archive Schedule"
      cancelLabel="Cancel"
      pendingLabel="Archiving..."
      variant="destructive"
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}
