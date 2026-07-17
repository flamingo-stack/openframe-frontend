'use client';

import { InfoCell } from '@/app/components/shared/info-cell';

interface GuardrailsPresetCardProps {
  label: string;
  /** Muted value — the preset is inherited from the tenant defaults. */
  muted?: boolean;
}

/** Read-only "Guardrails Preset" summary card. */
export function GuardrailsPresetCard({ label, muted = false }: GuardrailsPresetCardProps) {
  return (
    <div className="bg-ods-card border border-ods-border rounded-md flex items-center px-[var(--spacing-system-mf)] min-h-20">
      <InfoCell
        value={muted ? <span className="text-ods-text-secondary">{label}</span> : label}
        label="Guardrails Preset"
      />
    </div>
  );
}
