'use client';

import { Button, RadioGroupBlock, SlidersIcon } from '@flamingo-stack/openframe-frontend-core';
import type { GuardrailsTemplateOption } from './use-guardrails-editor';

interface GuardrailsTemplatePickerProps {
  options: GuardrailsTemplateOption[];
  value: string;
  disabled?: boolean;
  onSelect: (templateId: string) => void;
  /** "Use for Custom Policy" on a stock template row. */
  onCreateCustomPolicyFrom: (baseTemplateId: string) => void;
}

/** Edit-mode template chooser: one radio per template, stock rows offer "Use for Custom Policy". */
export function GuardrailsTemplatePicker({
  options,
  value,
  disabled,
  onSelect,
  onCreateCustomPolicyFrom,
}: GuardrailsTemplatePickerProps) {
  return (
    <RadioGroupBlock
      name="policy-template"
      variant="grouped"
      value={value}
      onValueChange={onSelect}
      disabled={disabled}
      options={options.map(option => ({
        value: option.id,
        label: option.label,
        description: option.description,
        trailing: !option.isCustom ? (
          <Button
            type="button"
            variant="outline"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onCreateCustomPolicyFrom(option.id);
            }}
            className="md:!text-sm text-ods-text-primary bg-ods-card border-ods-border hover:bg-ods-bg-hover font-bold !px-[var(--spacing-system-mf)] py-[var(--spacing-system-sf)] h-auto"
            leftIcon={<SlidersIcon className="w-4 h-4" />}
            disabled={disabled}
          >
            Use for Custom Policy
          </Button>
        ) : undefined,
      }))}
    />
  );
}
