'use client';

import { Switch } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useEffect, useId, useState } from 'react';
import {
  BIOMETRIC_ERROR,
  biometricErrorCode,
  biometryLabel,
  disableBiometricLogin,
  enableBiometricLogin,
  isBiometricAvailable,
  isBiometricLoginEnabled,
  setBiometricLoginChoice,
} from '@/lib/native-biometrics';
import { isNativeShell } from '@/lib/native-shell';

/**
 * Native-shell-only "Biometric login" toggle: Face ID / Touch ID / Fingerprint
 * gate on the Keychain token read. Renders nothing on the web / desktop or when
 * the device can't do biometrics, so it's safe to mount unconditionally on the
 * settings page.
 */
export function BiometricLoginCard() {
  const { toast } = useToast();
  const switchId = useId();
  const [available, setAvailable] = useState(false);
  const [label, setLabel] = useState('Biometrics');
  const [enabled, setEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isNativeShell()) return;
    let active = true;
    void (async () => {
      const [{ available: avail, biometryType }, isEnabled] = await Promise.all([
        isBiometricAvailable(),
        isBiometricLoginEnabled(),
      ]);
      if (!active) return;
      setAvailable(avail);
      setLabel(biometryLabel(biometryType));
      setEnabled(isEnabled);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!isNativeShell() || !available) return null;

  const handleToggle = async (next: boolean) => {
    // Optimistic flip; revert on reject so the switch never lies about the
    // native state.
    setEnabled(next);
    setIsBusy(true);
    try {
      if (next) {
        await enableBiometricLogin();
        // Feeds the post-login enrollment offer's anti-spam policy: an explicit
        // settings choice counts the same as answering the offer.
        setBiometricLoginChoice('accepted');
        toast({ title: `${label} enabled`, description: `You'll unlock OpenFrame with ${label}.`, variant: 'success' });
      } else {
        await disableBiometricLogin();
        setBiometricLoginChoice('declined');
        toast({ title: `${label} disabled`, variant: 'success' });
      }
    } catch (error) {
      setEnabled(!next);
      // A user-canceled prompt is not an error worth a destructive toast.
      if (biometricErrorCode(error) === BIOMETRIC_ERROR.CANCELED) return;
      toast({
        title: next ? `Couldn't enable ${label}` : `Couldn't disable ${label}`,
        description: next ? 'Please try again.' : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="bg-ods-card border border-ods-border rounded-md p-[var(--spacing-system-m)] flex gap-[var(--spacing-system-s)] items-center">
      <div className="flex-1 min-w-0">
        <label htmlFor={switchId} className="text-h3 text-ods-text-primary">
          Biometric login
        </label>
        <p className="text-h6 text-ods-text-secondary">Unlock OpenFrame on this device with {label}.</p>
      </div>
      <Switch id={switchId} checked={enabled} onCheckedChange={handleToggle} disabled={isBusy} />
    </div>
  );
}
