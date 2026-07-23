'use client';

import { SelectButton } from '@flamingo-stack/openframe-frontend-core/components/features';
import { PlusCircleIcon } from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { Button, Input, Label, type PageActionButton } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useMdUp, useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { useMutation } from 'react-relay';
import { z } from 'zod';
import type { createScriptScheduleMutation as CreateScheduleMutationType } from '@/__generated__/createScriptScheduleMutation.graphql';
import type { updateScriptScheduleMutation as UpdateScheduleMutationType } from '@/__generated__/updateScriptScheduleMutation.graphql';
import { safeBackOrReplace } from '@/app/hooks/use-safe-back';
import { createScriptScheduleMutation } from '@/graphql/scripts/create-script-schedule-mutation';
import { updateScriptScheduleMutation } from '@/graphql/scripts/update-script-schedule-mutation';
import { routes } from '@/lib/routes';
import { AVAILABLE_PLATFORMS, DISABLED_PLATFORMS } from '../../utils/script-utils';
import { platformsToEnums, platformsToIds } from '../utils/script-mappers';
import { type ScheduleDetailData, ScheduleDetailGate } from './schedule-detail-gate';
import { ScheduleScriptPickerCard } from './schedule-script-picker-card';
import { ScriptPageChrome } from './script-page-chrome';

// ----------------------------------------------------------------
// Form model
// ----------------------------------------------------------------

// TODO(backend): no scheduledDate / repeat fields — CreateScriptScheduleInput
// carries only name/description/platforms/scriptIds. The legacy date & repeat
// controls return when the schema exposes schedule timing
// (see docs/script-schedules-v2-graphql-gaps.md).
const editScheduleFormSchema = z.object({
  name: z.string().min(1, 'Please enter a schedule name').max(255, 'Name must not exceed 255 characters'),
  description: z.string(),
  supportedPlatforms: z.array(z.string()).min(1, 'Please select at least one platform'),
  scripts: z
    .array(
      z.object({
        scriptId: z.string().min(1, 'Please select a script'),
        name: z.string(),
      }),
    )
    .min(1, 'Please add at least one script'),
});

export type EditScheduleFormData = z.infer<typeof editScheduleFormSchema>;

const EMPTY_SCRIPT_ROW: EditScheduleFormData['scripts'][number] = { scriptId: '', name: '' };

const DEFAULT_VALUES: EditScheduleFormData = {
  name: '',
  description: '',
  supportedPlatforms: ['windows'],
  scripts: [EMPTY_SCRIPT_ROW],
};

function scheduleToFormValues(schedule: ScheduleDetailData): EditScheduleFormData {
  return {
    name: schedule.name,
    description: schedule.description ?? '',
    supportedPlatforms: platformsToIds(schedule.supportedPlatforms),
    scripts:
      schedule.scripts.length > 0 ? schedule.scripts.map(s => ({ scriptId: s.id, name: s.name })) : [EMPTY_SCRIPT_ROW],
  };
}

// ----------------------------------------------------------------
// Form — also its own loading state (the "pour data in" gate pattern)
// ----------------------------------------------------------------

interface EditScheduleFormProps {
  scheduleId: string | null;
  initialValues: EditScheduleFormData | null;
  /**
   * True while the schedule query is still in flight: every control renders
   * disabled and empty, and the values pour in once the data arrives. The real
   * form IS the loading state — no skeleton swap, no remount.
   */
  loading?: boolean;
}

function EditScheduleForm({ scheduleId, initialValues, loading = false }: EditScheduleFormProps) {
  const isEditMode = Boolean(scheduleId);
  const router = useRouter();
  const { toast } = useToast();
  const isMdUp = useMdUp();

  const [commitCreate, isCreating] = useMutation<CreateScheduleMutationType>(createScriptScheduleMutation);
  const [commitUpdate, isUpdating] = useMutation<UpdateScheduleMutationType>(updateScriptScheduleMutation);
  const isSaving = isCreating || isUpdating;

  const methods = useForm<EditScheduleFormData>({
    resolver: zodResolver(editScheduleFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const { control, handleSubmit, watch, formState } = methods;

  const { fields, append, remove } = useFieldArray({ control, name: 'scripts' });
  const supportedPlatforms = watch('supportedPlatforms');

  // Errors stay hidden on a pristine form and appear only once the user
  // attempts Save; from then on they track validation live (mirrors the
  // script form's `showErrors` contract).
  const [showErrors, setShowErrors] = useState(false);

  // Seed once the gated schedule arrives; guarded on `!isDirty` so the
  // `store-and-network` second delivery never clobbers in-progress edits.
  useEffect(() => {
    if (initialValues && !formState.isDirty) {
      methods.reset(initialValues);
    }
  }, [initialValues, formState.isDirty, methods]);

  const backFallback =
    isEditMode && scheduleId ? routes.scriptsV2.schedules.details(scheduleId) : routes.scriptsV2.schedules.list;

  const togglePlatform = useCallback(
    (platform: string) => {
      const current = methods.getValues('supportedPlatforms');
      const has = current.includes(platform);
      // Allow deselecting any item, including the last one — the "at least one
      // platform" rule is enforced by validation on submit (mirrors the script form).
      methods.setValue('supportedPlatforms', has ? current.filter(p => p !== platform) : [...current, platform], {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    [methods],
  );

  const onSubmit = useCallback(
    (data: EditScheduleFormData) => {
      const input = {
        name: data.name,
        // PUT semantics on update: null clears the stored description.
        description: data.description.trim() || null,
        supportedPlatforms: platformsToEnums(data.supportedPlatforms),
        scriptIds: data.scripts.map(s => s.scriptId),
      };

      if (isEditMode && scheduleId) {
        commitUpdate({
          variables: { input: { id: scheduleId, ...input } },
          onCompleted: () => {
            toast({
              title: 'Schedule updated',
              description: `Schedule "${data.name}" updated successfully.`,
              variant: 'success',
            });
            safeBackOrReplace(router, routes.scriptsV2.schedules.details(scheduleId));
          },
          onError: error => {
            toast({
              title: 'Update failed',
              description: error.message || 'Failed to update schedule',
              variant: 'destructive',
            });
          },
        });
      } else {
        commitCreate({
          variables: { input },
          onCompleted: response => {
            toast({
              title: 'Schedule created',
              description: `Schedule "${data.name}" created successfully.`,
              variant: 'success',
            });
            router.replace(routes.scriptsV2.schedules.details(response.createScriptSchedule.id));
          },
          onError: error => {
            toast({
              title: 'Creation failed',
              description: error.message || 'Failed to create schedule',
              variant: 'destructive',
            });
          },
        });
      }
    },
    [isEditMode, scheduleId, commitCreate, commitUpdate, toast, router],
  );

  const onInvalid = useCallback(() => {
    toast({
      title: 'Validation Error',
      description: 'Please fix the highlighted fields before saving.',
      variant: 'destructive',
    });
  }, [toast]);

  const handleSave = useCallback(() => {
    setShowErrors(true);
    return handleSubmit(onSubmit, onInvalid)();
  }, [handleSubmit, onSubmit, onInvalid]);

  const actions = useMemo<PageActionButton[]>(
    () => [
      {
        label: isEditMode ? 'Update Schedule' : 'Save Schedule',
        onClick: handleSave,
        variant: 'accent' as const,
        disabled: loading || isSaving,
        loading: isSaving,
      },
    ],
    [isEditMode, handleSave, loading, isSaving],
  );

  return (
    <FormProvider {...methods}>
      <ScriptPageChrome
        title={isEditMode ? 'Edit Script Schedule' : 'New Script Schedule'}
        backFallback={backFallback}
        actions={actions}
      >
        <div className="flex flex-col gap-[var(--spacing-system-lf)]">
          {/* Schedule Name */}
          <div className="flex flex-col gap-1">
            <Label className="text-h4">Schedule Name</Label>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Input
                  placeholder="Enter schedule name"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={loading}
                  className="w-full"
                  error={showErrors ? fieldState.error?.message : undefined}
                  invalid={showErrors && !!fieldState.error}
                />
              )}
            />
          </div>

          {/* Note (backend `description`) */}
          <div className="flex flex-col gap-1">
            <Label className="text-h4">Note</Label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <Input
                  placeholder="Enter note here (optional)"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={loading}
                  className="w-full"
                />
              )}
            />
          </div>

          {/* Supported Platforms. The min-1 error overlays the section gap below
              the row (same absolute pattern as the script form) — no layout shift. */}
          <div className="relative flex flex-col gap-2">
            <Label className="text-h4">Supported Platform</Label>
            <div className="flex gap-3 max-w-[920px]">
              {AVAILABLE_PLATFORMS.map(platform => {
                const isDisabled = loading || DISABLED_PLATFORMS.includes(platform.id);
                const comingSoon = DISABLED_PLATFORMS.includes(platform.id);
                return (
                  <SelectButton
                    key={platform.id}
                    title={platform.name}
                    icon={<platform.icon className="w-5 h-5" />}
                    selected={!comingSoon && supportedPlatforms.includes(platform.id)}
                    disabled={isDisabled}
                    tag={comingSoon ? (isMdUp ? 'Coming Soon' : 'Soon') : undefined}
                    onClick={isDisabled ? undefined : () => togglePlatform(platform.id)}
                  />
                );
              })}
            </div>
            {showErrors && formState.errors.supportedPlatforms && (
              <p
                className="absolute bottom-0 left-0 right-0 translate-y-full truncate text-h6 text-ods-error"
                title={formState.errors.supportedPlatforms.message}
              >
                {formState.errors.supportedPlatforms.message}
              </p>
            )}
          </div>

          {/* Scheduled Scripts — ordered list of script pickers */}
          <div className="flex flex-col gap-4">
            <h2 className="text-h2 text-ods-text-primary">Scheduled Scripts</h2>

            {fields.map((field, index) => (
              <ScheduleScriptPickerCard
                key={field.id}
                index={index}
                supportedPlatforms={supportedPlatforms}
                onRemove={() => remove(index)}
                canRemove={fields.length > 1}
                disabled={loading}
                showErrors={showErrors}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={() => append(EMPTY_SCRIPT_ROW)}
              disabled={loading}
              className="self-start"
              leftIcon={<PlusCircleIcon className="text-ods-text-secondary" />}
            >
              Add Script
            </Button>
          </div>
        </div>
      </ScriptPageChrome>
    </FormProvider>
  );
}

/** Maps the gated schedule (`undefined` while loading) to the form's seed props. */
function LoadedEditScheduleForm({
  scheduleId,
  schedule,
}: {
  scheduleId: string;
  schedule: ScheduleDetailData | undefined;
}) {
  const initialValues = useMemo(() => (schedule ? scheduleToFormValues(schedule) : null), [schedule]);
  return <EditScheduleForm scheduleId={scheduleId} initialValues={initialValues} loading={schedule === undefined} />;
}

interface EditSchedulePageProps {
  scheduleId: string | null;
}

/**
 * Create + edit page for a schedule (v2, Relay). Create renders the form
 * directly; edit wraps it in {@link ScheduleDetailGate} so the form renders
 * once (disabled) and the schedule pours in — no skeleton swap, no remount.
 */
export function EditSchedulePage({ scheduleId }: EditSchedulePageProps) {
  if (!scheduleId) {
    return <EditScheduleForm scheduleId={null} initialValues={null} />;
  }

  return (
    <ScheduleDetailGate scheduleId={scheduleId}>
      {schedule => <LoadedEditScheduleForm scheduleId={scheduleId} schedule={schedule} />}
    </ScheduleDetailGate>
  );
}
