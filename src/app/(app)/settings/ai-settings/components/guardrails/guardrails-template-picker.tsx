'use client';

import { ActionsMenuDropdown, Button, RadioGroupBlock } from '@flamingo-stack/openframe-frontend-core';
import { Filter03HrIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';

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
              className="hidden md:inline-flex !text-h3 text-ods-text-primary bg-ods-card border-ods-border hover:bg-ods-bg-hover gap-[var(--spacing-system-xsf)] !px-[var(--spacing-system-m)] py-[var(--spacing-system-sf)] h-auto [&_svg]:!size-6"
              leftIcon={<Filter03HrIcon className="text-ods-text-secondary"/>}
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
                        icon: <Filter03HrIcon className="text-ods-text-secondary"/>,
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
