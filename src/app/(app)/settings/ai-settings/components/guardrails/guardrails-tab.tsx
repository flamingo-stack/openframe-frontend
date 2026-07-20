'use client';

import { GuardrailsPanel } from './guardrails-panel';
import { useGuardrailsEditor } from './use-guardrails-editor';

export const GUARDRAILS_FORM_ID = 'ai-settings-guardrails-form';

interface GuardrailsTabProps {
  /** Driven by the shared AI Settings edit mode. */
  isEditMode: boolean;
  /** Called after a successful save so the parent can exit edit mode. */
  onSaved: () => void;
}

// Edit mode + Save are owned by the shared AiSettingsLayout actions; the
// shared Save submits this form via GUARDRAILS_FORM_ID.
export function GuardrailsTab({ isEditMode, onSaved }: GuardrailsTabProps) {
  const editor = useGuardrailsEditor({ isEditMode });

  return (
    <form
      id={GUARDRAILS_FORM_ID}
      onSubmit={event => {
        event.preventDefault();
        void editor.save().then(saved => {
          if (saved) onSaved();
        });
      }}
    >
      <GuardrailsPanel editor={editor} isEditMode={isEditMode} />
    </form>
  );
}
