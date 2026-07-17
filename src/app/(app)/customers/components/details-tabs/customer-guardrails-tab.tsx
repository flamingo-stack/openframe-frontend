'use client';

import { InfoCircleIcon, PenEditIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter } from 'next/navigation';
import { GuardrailsPanel } from '@/app/(app)/settings/ai-settings/components/guardrails/guardrails-panel';
import { useGuardrailsEditor } from '@/app/(app)/settings/ai-settings/components/guardrails/use-guardrails-editor';
import { routes } from '@/lib/routes';

/**
 * Read-only "Customer AI Guardrails" tab on the customer details page. The
 * backend has no per-organization policies yet, so every customer follows the
 * tenant-wide defaults — this shows them (real data, tenant-scoped) with a
 * pointer to AI Settings → Guardrails for editing. Once org-scoped policies
 * land, the scope enters via the guardrails data hooks and this banner becomes
 * conditional on an override existing.
 */
export function CustomerGuardrailsTab() {
  const router = useRouter();
  const editor = useGuardrailsEditor({ isEditMode: false });

  return (
    <div className="flex flex-col gap-[var(--spacing-system-l)]">
      <div className="bg-ods-card border border-ods-border rounded-md flex flex-col md:flex-row md:items-center gap-[var(--spacing-system-s)] p-[var(--spacing-system-s)]">
        <div className="flex items-center gap-[var(--spacing-system-s)] flex-1 min-w-0">
          <InfoCircleIcon className="size-6 text-ods-text-primary shrink-0" />
          <div className="flex flex-col min-w-0">
            <p className="text-h4 text-ods-text-primary">Using Default Settings</p>
            <p className="text-h6 text-ods-text-secondary">This customer follows guardrails defaults.</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(routes.settings.aiSettings({ tab: 'guardrails', edit: true }))}
          leftIcon={<PenEditIcon className="size-5 text-ods-text-secondary" />}
          className="shrink-0 self-start md:self-auto"
        >
          Edit Default Guardrails
        </Button>
      </div>

      <GuardrailsPanel editor={editor} isEditMode={false} inheritedPreset />
    </div>
  );
}
