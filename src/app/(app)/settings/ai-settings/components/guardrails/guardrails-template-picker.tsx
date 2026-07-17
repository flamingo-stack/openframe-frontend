'use client';

import { ActionsMenuDropdown, Button, RadioGroupBlock, SlidersIcon } from '@flamingo-stack/openframe-frontend-core';

export interface GuardrailsTemplateOption {
  id: string;
  label: string;
  description?: string;
  isCustom: boolean;
}

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
          <>
            <Button
              type="button"
              variant="outline"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onCreateCustomPolicyFrom(option.id);
              }}
              className="hidden md:inline-flex md:!text-sm text-ods-text-primary bg-ods-card border-ods-border hover:bg-ods-bg-hover font-bold !px-[var(--spacing-system-mf)] py-[var(--spacing-system-sf)] h-auto"
              leftIcon={<SlidersIcon className="w-4 h-4" />}
              disabled={disabled}
            >
              Use for Custom Policy
            </Button>
            {/* Mobile: collapsed into an ellipsis actions menu. preventDefault
                stops the wrapping radio label from selecting the option. */}
            <div
              className="md:hidden"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <ActionsMenuDropdown
                triggerAriaLabel={`Actions for ${option.label}`}
                groups={[
                  {
                    items: [
                      {
                        id: 'use-for-custom-policy',
                        label: 'Use for Custom Policy',
                        icon: <SlidersIcon className="w-4 h-4" />,
                        onClick: () => onCreateCustomPolicyFrom(option.id),
                        disabled,
                      },
                    ],
                  },
                ]}
              />
            </div>
          </>
        ) : undefined,
      }))}
    />
  );
}
