'use client';

import { PlusCircleIcon, TrashIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  Button,
  CheckboxWithDescription,
  Input,
  Textarea,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { cn } from '@flamingo-stack/openframe-frontend-core/utils';
import { useState } from 'react';
import { type Control, Controller, type FieldValues, useFieldArray, useWatch } from 'react-hook-form';
import { ConfirmDialog } from '@/app/components/shared/confirm-dialog';
import type { AiQuickAction } from '../types/ai-settings';
import type { QuickActionsFormValues } from '../types/quick-action.types';
import { AiSettingsQuickActions, type QuickActionsAgentConfig } from './ai-settings-quick-actions';

interface AiSettingsQuickActionsEditorProps<T extends QuickActionsFormValues & FieldValues> {
  control: Control<T>;
  title?: string;
  agentConfig: QuickActionsAgentConfig;
  /**
   * The persisted config actions + flag. When the config is still on defaults,
   * these are the Product Hub actions: they seed the editor on uncheck and
   * render as the dimmed read-only preview while the checkbox stays on.
   */
  configActions: AiQuickAction[];
  configIsDefault: boolean;
  className?: string;
}

/**
 * Shared quick actions editor for the Fae and Mingo settings forms.
 * Owns the `quickActions` field array + the `quickActionsIsDefault` flag; the
 * host form only needs fields matching QuickActionsFormValues in its schema.
 *
 * Checked → the hub defaults are shown read-only (dimmed) and the BE keeps
 * serving them; unchecking seeds the rows with those defaults for editing;
 * re-checking asks for confirmation (customs are replaced on save).
 */
export function AiSettingsQuickActionsEditor<T extends QuickActionsFormValues & FieldValues>({
  control,
  title = 'Assistant Quick Actions',
  agentConfig,
  configActions,
  configIsDefault,
  className,
}: AiSettingsQuickActionsEditorProps<T>) {
  // The generic constraint guarantees the form has compatible quick-action
  // fields; the cast narrows Control to that shape for type-safe field names.
  const quickActionsControl = control as unknown as Control<QuickActionsFormValues>;
  const { fields, append, remove, replace } = useFieldArray({ control: quickActionsControl, name: 'quickActions' });
  const isDefault = useWatch({ control: quickActionsControl, name: 'quickActionsIsDefault' });

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleToggle = (checked: boolean, onChange: (value: boolean) => void) => {
    if (!checked) {
      onChange(false);
      // Seed the editor with the hub defaults (as new custom rows — no ids, the
      // BE assigns them on save). Only when the rows aren't already populated.
      if (fields.length === 0 && configIsDefault) {
        replace(configActions.map(action => ({ name: action.name, instructions: action.instructions })));
      }
      return;
    }
    // Turning defaults back on discards the customized rows — confirm first.
    setConfirmOpen(true);
  };

  return (
    <div className={cn('flex flex-col gap-[var(--spacing-system-l)]', className)}>
      <span className="text-h2 text-ods-text-primary">{title}</span>

      <Controller
        name="quickActionsIsDefault"
        control={quickActionsControl}
        render={({ field }) => (
          <>
            <CheckboxWithDescription
              id={`use-default-quick-actions-${agentConfig.agentSlug}`}
              checked={field.value}
              onCheckedChange={checked => handleToggle(checked, field.onChange)}
              title="Use OpenFrame default actions"
              description="Recommended set of quick actions curated and approved by OpenFrame."
              // The lib block ships 14px Label + p-4; the mock (checkbox-block)
              // uses the same type ramp as the view banner: 18/24 title, 14/20
              // caption, 12px padding, centered 24px checkbox.
              className={cn(
                'items-center rounded-md p-[var(--spacing-system-sf)] gap-[var(--spacing-system-s)]',
                '[&_button]:size-6 [&_button]:mt-0',
                '[&>div>label]:text-h4 [&>div>label]:leading-6 [&>div>label]:mb-0',
                '[&>div>span]:text-h6 [&>div>span]:leading-5',
              )}
            />
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Use Default Actions"
              description={`This replaces your customized quick actions with the standard ${agentConfig.agentLabel} set. Any actions you added or edited will be removed.`}
              confirmLabel="Use Default"
              variant="destructive"
              onConfirm={() => {
                field.onChange(true);
                replace([]);
                setConfirmOpen(false);
              }}
            />
          </>
        )}
      />

      {isDefault ? (
        // Defaults preview: only rendered when the persisted config still holds
        // them (after a custom→default toggle the hub set arrives on save).
        configIsDefault &&
        configActions.length > 0 && (
          <AiSettingsQuickActions
            actions={configActions}
            isDefault
            agentConfig={agentConfig}
            className="opacity-50 pointer-events-none"
          />
        )
      ) : (
        <>
          {fields.length > 0 && (
            <Button
              type="button"
              variant="transparent"
              onClick={() => replace([])}
              className="self-end !p-0 !h-auto text-h6 text-ods-error underline hover:text-ods-error"
            >
              Delete All
            </Button>
          )}

          <div className="flex flex-col gap-[var(--spacing-system-l)]">
            {fields.map((field, index) => (
              <QuickActionCard
                key={field.id}
                index={index}
                control={quickActionsControl}
                onRemove={() => remove(index)}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="transparent"
            onClick={() => append({ name: '', instructions: '' })}
            leftIcon={<PlusCircleIcon className="w-5 h-5 text-ods-text-secondary" />}
            className="self-start"
          >
            Add Quick Action
          </Button>
        </>
      )}
    </div>
  );
}

interface QuickActionCardProps {
  index: number;
  control: Control<QuickActionsFormValues>;
  onRemove: () => void;
}

function QuickActionCard({ index, control, onRemove }: QuickActionCardProps) {
  return (
    <div className="flex flex-col gap-[var(--spacing-system-m)] bg-ods-card border border-ods-border rounded-md p-[var(--spacing-system-l)]">
      <div className="flex items-end gap-[var(--spacing-system-l)]">
        <div className="flex-1 min-w-0">
          <Controller
            name={`quickActions.${index}.name`}
            control={control}
            render={({ field, fieldState }) => (
              <Input {...field} label="Action Name" error={fieldState.error?.message} />
            )}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRemove}
          aria-label="Remove quick action"
          leftIcon={<TrashIcon className="w-5 h-5" />}
          className="[&_svg]:!text-ods-error"
        />
      </div>

      <Controller
        name={`quickActions.${index}.instructions`}
        control={control}
        render={({ field, fieldState }) => (
          <Textarea {...field} label="Action Instructions" error={fieldState.error?.message} rows={4} />
        )}
      />
    </div>
  );
}
