'use client';

import { useDebounce } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useEffect, useMemo, useState } from 'react';
import { fetchQuery, useRelayEnvironment } from 'react-relay';
import type { scheduleScriptsPickerRelayQuery as PickerQueryType } from '@/__generated__/scheduleScriptsPickerRelayQuery.graphql';
import { scheduleScriptsPickerRelayQuery } from '@/graphql/scripts/schedule-scripts-picker-relay';
import { platformsToEnums } from '../utils/script-mappers';

export interface PickerScript {
  id: string;
  name: string;
  supportedPlatforms: string[];
  defaultTimeoutSeconds: number | null;
}

/**
 * Server-side script autocomplete for the schedule form, on Relay.
 *
 * Loading strategy mirrors the legacy scripts autocomplete: the query is lazy —
 * it only fires while the dropdown is active (focused) — and the input clears
 * on close so the next open starts unfiltered. The fetch is imperative
 * (`fetchQuery`, `store-or-network`) because a dropdown refreshing per
 * keystroke shouldn't suspend the form; results still land in the Relay store,
 * so re-opening with the same search renders instantly.
 */
export function useScheduleScriptsAutocomplete(supportedPlatforms: string[]) {
  const environment = useRelayEnvironment();
  const [inputValue, setInputValue] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [scripts, setScripts] = useState<PickerScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedSearch = useDebounce(inputValue, 300);

  // Stable dependency for the effect — the caller may rebuild the array each render.
  const platformsKey = supportedPlatforms.join(',');

  useEffect(() => {
    if (!isActive) return;

    const platforms = platformsToEnums(platformsKey ? platformsKey.split(',') : []);
    setIsLoading(true);
    const subscription = fetchQuery<PickerQueryType>(
      environment,
      scheduleScriptsPickerRelayQuery,
      {
        search: debouncedSearch || null,
        platforms: platforms.length > 0 ? platforms : null,
        first: 20,
      },
      { fetchPolicy: 'store-or-network' },
    ).subscribe({
      next: data => {
        const nodes = (data.scripts?.edges ?? []).flatMap(edge => (edge?.node ? [edge.node] : []));
        setScripts(
          nodes.map(node => ({
            id: node.id,
            name: node.name,
            supportedPlatforms: node.supportedPlatforms ? [...node.supportedPlatforms] : [],
            defaultTimeoutSeconds: node.defaultTimeoutSeconds ?? null,
          })),
        );
        setIsLoading(false);
      },
      error: () => setIsLoading(false),
    });

    return () => subscription.unsubscribe();
  }, [environment, isActive, debouncedSearch, platformsKey]);

  return useMemo(
    () => ({
      scripts,
      isLoading,
      inputValue,
      onInputChange: setInputValue,
      onOpen: () => setIsActive(true),
      onClose: () => {
        setIsActive(false);
        setInputValue('');
      },
    }),
    [scripts, isLoading, inputValue],
  );
}
