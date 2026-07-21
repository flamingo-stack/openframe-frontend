'use client';

import { OS_PLATFORMS } from '@flamingo-stack/openframe-frontend-core';
import { TrashIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Autocomplete, Button, Label } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { type FocusEvent, useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useScheduleScriptsAutocomplete } from '../hooks/use-schedule-scripts-autocomplete';
import { platformsToIds } from '../utils/script-mappers';
import type { EditScheduleFormData } from './edit-schedule-page';

interface ScheduleScriptPickerCardProps {
  index: number;
  /** UI platform ids the schedule targets — narrows the script search server-side. */
  supportedPlatforms: string[];
  onRemove: () => void;
  canRemove: boolean;
  disabled?: boolean;
  /**
   * Controls inline error visibility — the parent flips this true once the
   * user attempts Save, so errors stay hidden on a pristine form (mirrors
   * `ScriptFormFields.showErrors`).
   */
  showErrors?: boolean;
}

function ScriptPlatformIcons({ platforms }: { platforms: string[] }) {
  return (
    <span className="inline-flex gap-0.5 ml-1.5">
      {OS_PLATFORMS.filter(p => platforms.includes(p.id)).map(p => (
        <p.icon key={p.id} className="w-3.5 h-3.5 text-ods-text-secondary opacity-60" />
      ))}
    </span>
  );
}

/**
 * One row of the schedule's ordered script list: a server-searched script
 * autocomplete (Relay — see `use-schedule-scripts-autocomplete`) plus a remove
 * button. Per-script timeout/args/env overrides are NOT part of the card — the
 * GraphQL schedule model stores script ids only; scripts run with their own
 * defaults (see docs/script-schedules-v2-graphql-gaps.md).
 */
export function ScheduleScriptPickerCard({
  index,
  supportedPlatforms,
  onRemove,
  canRemove,
  disabled = false,
  showErrors = true,
}: ScheduleScriptPickerCardProps) {
  const { control, setValue, watch } = useFormContext<EditScheduleFormData>();
  const selected = watch(`scripts.${index}`);

  const { scripts, isLoading, inputValue, onInputChange, onOpen, onClose } =
    useScheduleScriptsAutocomplete(supportedPlatforms);

  // Fires only when focus leaves the entire autocomplete widget (not on internal focus moves).
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) onClose();
  };

  // The selected script may not be in the current search page — prepend it so
  // the Autocomplete can always render its label (edit mode, stale searches).
  const options = useMemo(() => {
    const fetched = scripts.map(s => ({ label: s.name, value: s.id }));
    if (selected?.scriptId && !fetched.some(o => o.value === selected.scriptId)) {
      return [{ label: selected.name, value: selected.scriptId }, ...fetched];
    }
    return fetched;
  }, [scripts, selected?.scriptId, selected?.name]);

  const handleScriptChange = (scriptId: string | null) => {
    if (!scriptId) {
      setValue(`scripts.${index}`, { scriptId: '', name: '' }, { shouldValidate: true });
      return;
    }
    const script = scripts.find(s => s.id === scriptId);
    if (script) {
      setValue(
        `scripts.${index}`,
        { scriptId: script.id, name: script.name },
        { shouldValidate: true, shouldDirty: true },
      );
    }
  };

  return (
    // `pb-6` reserves room under the autocomplete for the FieldWrapper error
    // (absolutely positioned by the core lib) — validation never resizes the
    // card. Mirrors the legacy schedule-action-form-card padding.
    <div className="border border-ods-border rounded-[6px] p-4 pb-6 flex gap-4 items-start">
      <div className="flex-1 flex flex-col gap-1 min-w-0" onFocus={onOpen} onBlur={handleBlur}>
        <Label className="text-h4">Select Script</Label>
        <Controller
          name={`scripts.${index}.scriptId`}
          control={control}
          render={({ fieldState }) => (
            <Autocomplete<string>
              options={options}
              value={selected?.scriptId || null}
              onChange={handleScriptChange}
              placeholder="Select a script..."
              disableClientFilter
              onInputChange={onInputChange}
              loading={isLoading}
              loadingText="Searching scripts..."
              noOptionsText={inputValue ? 'No scripts match your search' : 'No scripts available'}
              disabled={disabled}
              error={showErrors ? fieldState.error?.message : undefined}
              invalid={showErrors && !!fieldState.error}
              renderOption={option => (
                <span className="inline-flex items-center">
                  {option.label}
                  <ScriptPlatformIcons
                    platforms={platformsToIds(scripts.find(s => s.id === option.value)?.supportedPlatforms)}
                  />
                </span>
              )}
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-h4 invisible">Action</Label>
        <Button
          variant="outline"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove || disabled}
          aria-label="Remove script from schedule"
          className="text-ods-error disabled:opacity-30"
        >
          <TrashIcon size={20} />
        </Button>
      </div>
    </div>
  );
}
