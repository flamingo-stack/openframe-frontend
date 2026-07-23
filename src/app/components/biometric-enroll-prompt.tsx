'use client';

import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import {
  BIOMETRIC_ERROR,
  biometricErrorCode,
  biometryLabel,
  enableBiometricLogin,
  getBiometricLoginChoice,
  isBiometricAvailable,
  isBiometricLoginEnabled,
  setBiometricLoginChoice,
} from '@/lib/native-biometrics';
import { isNativeShell } from '@/lib/native-shell';

/**
 * One-time post-login offer to turn on biometric login. Mounted with the
 * authenticated app shell (next to NativePushInitializer), so it appears right
 * after the first login completes; renders nothing outside the native shell.
 *
 * Anti-spam policy: the offer shows only while the user has made no explicit
 * choice on this device (`getBiometricLoginChoice()`), and ANY dismissal —
 * "Not Now" or backdrop — records `'declined'`, so it is never asked again
 * (Settings keeps the opt-in path). Accepting records `'accepted'`, which
 * re-offers after a logout / enrollment invalidation reset gating. Canceling
 * the OS biometric prompt keeps the dialog open — like the settings toggle,
 * a cancel is not a decision.
 */
export function BiometricEnrollPrompt() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Biometrics');
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!isNativeShell() || getBiometricLoginChoice() === 'declined') return;
    let active = true;
    void (async () => {
      const [{ available, biometryType }, enabled] = await Promise.all([
        isBiometricAvailable(),
        isBiometricLoginEnabled(),
      ]);
      if (!active || !available || enabled) return;
      setLabel(biometryLabel(biometryType));
      setOpen(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setIsPending(true);
    try {
      await enableBiometricLogin();
      setBiometricLoginChoice('accepted');
      setOpen(false);
      toast({ title: `${label} enabled`, description: `You'll unlock OpenFrame with ${label}.`, variant: 'success' });
    } catch (error) {
      // OS prompt canceled: keep the offer open, no choice recorded.
      if (biometricErrorCode(error) === BIOMETRIC_ERROR.CANCELED) return;
      // Transient failure: close without recording, so a later session may
      // offer again; the settings toggle stays available meanwhile.
      setOpen(false);
      toast({
        title: `Couldn't enable ${label}`,
        description: 'You can turn it on later in Settings.',
        variant: 'destructive',
      });
    } finally {
      setIsPending(false);
    }
  }, [label, toast]);

  const handleOpenChange = useCallback((next: boolean) => {
    // Any dismissal is an explicit "no" — never re-offer on this device.
    if (!next) setBiometricLoginChoice('declined');
    setOpen(next);
  }, []);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={`Enable ${label} login?`}
      description={`Unlock OpenFrame on this device with ${label} instead of signing in each time. You can change this anytime in Settings.`}
      confirmLabel={`Enable ${label}`}
      cancelLabel="Not Now"
      variant="default"
      isPending={isPending}
      onConfirm={handleEnable}
    />
  );
}
