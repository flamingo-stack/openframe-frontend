'use client';

import {
  ChatsIcon,
  FileContentIcon,
  ShieldCheckIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import {
  CheckboxBlock,
  ImageUploader,
  Input,
  PageLayout,
  type TabItem,
  TabNavigation,
  Textarea,
} from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeBackOrReplace, useSafeBack } from '@/app/hooks/use-safe-back';
import { featureFlags } from '@/lib/feature-flags';
import { getFullImageUrl } from '@/lib/image-url';
import { routes, TAB_IDS } from '@/lib/routes';
import { runtimeEnv } from '@/lib/runtime-config';
import { deleteWithAuth, uploadWithAuth } from '@/lib/upload-with-auth';
import { dashboardQueryKeys } from '../../dashboard/utils/query-keys';
import { useCreateCustomer } from '../hooks/use-create-customer';
import { customerDetailsQueryKeys, useCustomerDetails } from '../hooks/use-customer-details';
import { useUpdateCustomer } from '../hooks/use-update-customer';
import {
  CustomerAiAssistantAppearance,
  type CustomerAppearanceHandle,
} from './ai-assistant-appearance/customer-ai-assistant-appearance';
import {
  CustomerAiConfiguration,
  type CustomerAiConfigurationHandle,
} from './customer-ai-configuration/customer-ai-configuration';
import { type CustomerGuardrailsHandle, CustomerGuardrailsSettings } from './customer-guardrails-settings';

interface NewCustomerPageProps {
  organizationId: string | null;
}

interface FormState {
  name: string;
  website: string;
  notes: string;
  physicalAddress: string;
  mailingAddress: string;
  mailingSameAsPhysical: boolean;
  imageUrl?: string;
  imageHash?: string;
}

interface PreservedFields {
  category?: string;
  numberOfEmployees: number | null;
  monthlyRevenue: number | null;
  contractStartDate?: string;
  contractEndDate?: string;
  contacts: Array<{ contactName: string; title: string; phone: string; email: string }>;
}

const DEFAULT_FORM: FormState = {
  name: '',
  website: '',
  notes: '',
  physicalAddress: '',
  mailingAddress: '',
  mailingSameAsPhysical: true,
};

const DEFAULT_PRESERVED: PreservedFields = {
  numberOfEmployees: null,
  monthlyRevenue: null,
  contacts: [],
};

const buildAddressDto = (raw: string) => ({
  street1: raw || '',
  street2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
});

const stripPlaceholder = (value?: string | null): string => {
  if (!value || value === '-') return '';
  return value;
};

const contactToDto = (c: { name: string; title: string; phone: string; email: string }) => ({
  contactName: c.name,
  title: c.title,
  phone: c.phone,
  email: c.email,
});

const [DETAILS_TAB, AI_CONFIGURATION_TAB, GUARDRAILS_TAB] = TAB_IDS.customerEdit;

export function NewCustomerPage({ organizationId }: NewCustomerPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { createOrganization } = useCreateCustomer();
  const { updateOrganization } = useUpdateCustomer();
  const { organization } = useCustomerDetails(organizationId);

  const handleBack = useSafeBack(organizationId ? routes.customers.details(organizationId) : routes.customers.list());

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [preserved, setPreserved] = useState<PreservedFields>(DEFAULT_PRESERVED);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didPrefill, setDidPrefill] = useState(false);

  // For new orgs: file is held in memory until creation, then uploaded.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | undefined>(undefined);
  const previewUrlRef = useRef<string | undefined>(undefined);
  // Let "Save Customer" also persist the AI configuration / guardrails blocks.
  // Only one AI block is mounted at a time (the flag picks old vs new), so at
  // most one of these refs is set; both handle shapes are `{ validate, commit }`.
  const aiConfigurationRef = useRef<CustomerAiConfigurationHandle>(null);
  const appearanceRef = useRef<CustomerAppearanceHandle>(null);
  const guardrailsRef = useRef<CustomerGuardrailsHandle>(null);

  const isSaasTenant = runtimeEnv.appMode() === 'saas-tenant';
  const showImageUploader = isSaasTenant;
  const displayedImage = pendingPreviewUrl || getFullImageUrl(form.imageUrl, form.imageHash);

  // Per-customer AI blocks: SaaS-only (they rely on the openframe-saas-ai-agent
  // service, absent in self-hosted) and edit-mode only (they need an org id to
  // scope the override). When any is visible, the page renders as tabs
  // (Details / AI Configuration / Guardrails).
  //
  // `customer-ai-configuration` switches the AI tab's flow: on → the full
  // Customer AI Configuration (provider/model, answer style, quick actions);
  // off (default) → the legacy appearance-only block, which keeps its original
  // `customer-ai-assistant-settings` gate (pre-session behavior).
  const isFullAiConfig = featureFlags.customerAiConfiguration.enabled();
  const showAiConfig =
    !!organizationId && isSaasTenant && (isFullAiConfig || featureFlags.customerAiAssistantSettings.enabled());
  const showGuardrails = !!organizationId && isSaasTenant && featureFlags.customerGuardrails.enabled();
  const showTabs = showAiConfig || showGuardrails;

  const editTabs = useMemo<TabItem[]>(
    () => [
      { id: DETAILS_TAB, label: 'Details', icon: FileContentIcon },
      ...(showAiConfig
        ? [
            {
              id: AI_CONFIGURATION_TAB,
              label: isFullAiConfig ? 'Customer AI Configuration' : 'AI-Assistant Appearance',
              icon: ChatsIcon,
            },
          ]
        : []),
      ...(showGuardrails ? [{ id: GUARDRAILS_TAB, label: 'Customer AI Guardrails', icon: ShieldCheckIcon }] : []),
    ],
    [showAiConfig, isFullAiConfig, showGuardrails],
  );

  // Tab rides the URL (controlled mode, mirroring customer-details-view) so
  // "Edit Customer" from a details-page tab lands on the matching edit tab and
  // a refresh keeps the current one. Unknown or flag-hidden tab ids fall back
  // to Details. Panels stay mounted across switches, so form state survives.
  const requestedTab = searchParams?.get('tab') ?? DETAILS_TAB;
  const activeTab = editTabs.some(tab => tab.id === requestedTab) ? requestedTab : DETAILS_TAB;
  const handleTabChange = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', tabId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const set = (partial: Partial<FormState>) => setForm(prev => ({ ...prev, ...partial }));

  // Revoke blob URLs on unmount
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!organizationId || !organization || didPrefill) return;

    const physical = organization.physicalAddress || '';
    const mailing = organization.mailingAddress || '';
    const sameAsPhysical = !mailing || mailing === physical;

    setForm({
      name: stripPlaceholder(organization.name),
      website: stripPlaceholder(organization.website),
      notes: (organization.notes || []).join('\n'),
      physicalAddress: physical,
      mailingAddress: mailing,
      mailingSameAsPhysical: sameAsPhysical,
      imageUrl: organization.imageUrl || undefined,
      imageHash: organization.imageHash || undefined,
    });

    const reconstructedContacts = [organization.primary, organization.billing, organization.technical]
      .filter(c => c.name || c.title || c.phone || c.email)
      .map(contactToDto);

    setPreserved({
      category: stripPlaceholder(organization.industry) || undefined,
      numberOfEmployees: organization.employees,
      monthlyRevenue: organization.mrrUsd,
      contractStartDate: organization.contractStart
        ? new Date(organization.contractStart).toISOString().slice(0, 10)
        : undefined,
      contractEndDate: organization.contractEnd
        ? new Date(organization.contractEnd).toISOString().slice(0, 10)
        : undefined,
      contacts: reconstructedContacts,
    });

    setDidPrefill(true);
  }, [organizationId, organization, didPrefill]);

  // Mirror physical → mailing when checkbox is on
  useEffect(() => {
    if (form.mailingSameAsPhysical && form.mailingAddress !== form.physicalAddress) {
      setForm(prev => ({ ...prev, mailingAddress: prev.physicalAddress }));
    }
  }, [form.mailingSameAsPhysical, form.physicalAddress, form.mailingAddress]);

  const replacePendingPreview = (file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (file) {
      const next = URL.createObjectURL(file);
      previewUrlRef.current = next;
      setPendingPreviewUrl(next);
    } else {
      previewUrlRef.current = undefined;
      setPendingPreviewUrl(undefined);
    }
    setPendingFile(file);
  };

  const invalidateOrganizationImageQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all }),
      ...(organizationId
        ? [queryClient.invalidateQueries({ queryKey: customerDetailsQueryKeys.detail(organizationId) })]
        : []),
    ]);
  };

  const handleImageChange = async (file: File) => {
    if (organizationId) {
      try {
        const uploadedUrl = await uploadWithAuth(`/api/organizations/${organizationId}/image`, file);
        // The image path is stable across uploads, so bust the cache with the
        // upload time — otherwise the uploader keeps showing the old bytes.
        set({ imageUrl: uploadedUrl, imageHash: String(Date.now()) });
        // The image persists immediately (independent of Save), so refresh the
        // cached org lists that render this logo with its hash elsewhere.
        await invalidateOrganizationImageQueries();
        toast({
          title: 'Upload successful',
          description: 'Customer image has been updated',
          variant: 'success',
        });
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Failed to upload image',
          variant: 'destructive',
        });
      }
    } else {
      replacePendingPreview(file);
    }
  };

  const handleImageRemove = async () => {
    if (organizationId && form.imageUrl) {
      try {
        await deleteWithAuth(`/api/organizations/${organizationId}/image`);
        set({ imageUrl: undefined, imageHash: undefined });
        await invalidateOrganizationImageQueries();
        toast({
          title: 'Delete successful',
          description: 'Customer image has been deleted',
          variant: 'success',
        });
      } catch (err) {
        toast({
          title: 'Delete failed',
          description: err instanceof Error ? err.message : 'Failed to delete image',
          variant: 'destructive',
        });
      }
    } else {
      replacePendingPreview(null);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);

      // Whichever AI block is mounted (flag picks old appearance vs new config).
      const activeAiHandle = aiConfigurationRef.current ?? appearanceRef.current;

      // Validate the AI fields before writing anything.
      if (activeAiHandle && !(await activeAiHandle.validate())) {
        toast({
          title: 'Check AI configuration',
          description: 'Fix the highlighted AI configuration fields before saving',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const payload = {
        name: form.name.trim(),
        category: preserved.category,
        numberOfEmployees: preserved.numberOfEmployees,
        websiteUrl: form.website.trim() || undefined,
        notes: form.notes || undefined,
        contactInformation: {
          contacts: preserved.contacts,
          physicalAddress: buildAddressDto(form.physicalAddress),
          mailingAddress: buildAddressDto(form.mailingSameAsPhysical ? form.physicalAddress : form.mailingAddress),
          mailingAddressSameAsPhysical: form.mailingSameAsPhysical,
        },
        monthlyRevenue: preserved.monthlyRevenue,
        contractStartDate: preserved.contractStartDate,
        contractEndDate: preserved.contractEndDate,
      };

      let createdOrganizationId: string | null = null;

      if (organizationId) {
        await updateOrganization(organizationId, payload);
      } else {
        const response = await createOrganization(payload);
        createdOrganizationId = response?.organizationId || response?.id || null;
      }

      // Deferred logo upload for newly-created orgs
      if (!organizationId && createdOrganizationId && pendingFile) {
        try {
          await uploadWithAuth(`/api/organizations/${createdOrganizationId}/image`, pendingFile);
        } catch {
          toast({
            title: 'Warning',
            description: 'Customer was created but logo upload failed',
            variant: 'warning',
          });
        }
      }

      // Persist the AI overrides/reset (edit mode only). The customer is already
      // saved at this point, so a configuration failure is a non-fatal warning —
      // it must not surface as a full "Save failed".
      if (organizationId && activeAiHandle) {
        try {
          await activeAiHandle.commit();
        } catch (e) {
          toast({
            title: 'Customer saved, AI configuration not updated',
            description: e instanceof Error ? e.message : 'Failed to save the customer AI configuration',
            variant: 'warning',
          });
        }
      }

      // Persist the per-customer guardrails selection (edit mode only). Same
      // non-fatal semantics as the appearance block: the customer is saved.
      if (organizationId && guardrailsRef.current) {
        try {
          await guardrailsRef.current.commit();
        } catch (e) {
          toast({
            title: 'Customer saved, guardrails not updated',
            description: e instanceof Error ? e.message : 'Failed to save customer guardrails',
            variant: 'warning',
          });
        }
      }

      await invalidateOrganizationImageQueries();

      toast({
        title: organizationId ? 'Customer updated' : 'Customer created',
        description: `${form.name} has been ${organizationId ? 'updated' : 'created'}`,
      });
      if (organizationId) {
        safeBackOrReplace(router, routes.customers.details(organizationId));
      } else {
        router.replace(routes.customers.list());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save customer';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveDisabled = !form.name.trim() || isSubmitting;

  const detailsForm = (
    <div className="flex flex-col gap-6 w-full">
      {/* Row 1: name + website (left) | image (right on lg, below on md/sm) */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
        <div className="flex-1 min-w-0 flex flex-col gap-6 md:flex-row md:gap-6 lg:flex-col">
          <div className="flex-1 min-w-0">
            <Input
              label="Customer Name"
              placeholder="Customer Name"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Input
              label="Website URL"
              placeholder="https://www.website.com"
              value={form.website}
              onChange={e => set({ website: e.target.value })}
            />
          </div>
        </div>

        {showImageUploader && (
          <div className="w-full lg:w-[316px] shrink-0">
            <ImageUploader
              value={displayedImage}
              onChange={handleImageChange}
              onRemove={handleImageRemove}
              objectFit="contain"
              label="Customer Logo"
              description="(Click here or drag and drop)"
            />
          </div>
        )}
      </div>

      {/* Notes */}
      <Textarea
        label="Notes"
        rows={4}
        placeholder="Your notes here..."
        value={form.notes}
        onChange={e => set({ notes: e.target.value })}
        className="min-h-[96px] resize-y"
      />

      {/* Row 3: physical address + same-as-physical checkbox */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:items-end">
        <div className="flex-1 min-w-0">
          <Input
            label="Physical Address"
            placeholder="123 Main St, City, State, ZIP"
            value={form.physicalAddress}
            onChange={e => set({ physicalAddress: e.target.value })}
          />
        </div>
        <CheckboxBlock
          id="mailing-same"
          className="flex-1 min-w-0 md:max-w-[50%]"
          label="Mailing Address Same as Physical"
          checked={form.mailingSameAsPhysical}
          onCheckedChange={c => set({ mailingSameAsPhysical: Boolean(c) })}
        />
      </div>

      {/* Mailing address (full width) */}
      <Input
        label="Mailing Address"
        placeholder="123 Main St, City, State, ZIP"
        value={form.mailingAddress}
        onChange={e => set({ mailingAddress: e.target.value })}
        disabled={form.mailingSameAsPhysical}
        className="disabled:opacity-60"
      />
    </div>
  );

  return (
    <PageLayout
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
      title={organizationId ? 'Edit Customer' : 'New Customer'}
      backButton={{
        label: 'Back',
        onClick: handleBack,
      }}
      actionsVariant="primary-buttons"
      actions={[
        {
          label: isSubmitting ? 'Saving...' : 'Save Customer',
          variant: 'accent',
          onClick: handleSave,
          disabled: saveDisabled,
          loading: isSubmitting,
        },
      ]}
    >
      {showTabs && organizationId ? (
        <TabNavigation tabs={editTabs} activeTab={activeTab} onTabChange={handleTabChange}>
          {activeId => (
            // Every panel stays mounted (inactive ones hidden via CSS): the
            // details form state and the AI blocks' imperative refs must
            // survive tab switches so one "Save Customer" persists them all.
            <div className="pt-[var(--spacing-system-l)]">
              <div className={activeId === DETAILS_TAB ? undefined : 'hidden'}>{detailsForm}</div>
              {showAiConfig && (
                <div className={activeId === AI_CONFIGURATION_TAB ? undefined : 'hidden'}>
                  {isFullAiConfig ? (
                    <CustomerAiConfiguration ref={aiConfigurationRef} organizationId={organizationId} />
                  ) : (
                    <CustomerAiAssistantAppearance ref={appearanceRef} organizationId={organizationId} />
                  )}
                </div>
              )}
              {showGuardrails && (
                <div className={activeId === GUARDRAILS_TAB ? undefined : 'hidden'}>
                  <CustomerGuardrailsSettings ref={guardrailsRef} organizationId={organizationId} />
                </div>
              )}
            </div>
          )}
        </TabNavigation>
      ) : (
        detailsForm
      )}
    </PageLayout>
  );
}
