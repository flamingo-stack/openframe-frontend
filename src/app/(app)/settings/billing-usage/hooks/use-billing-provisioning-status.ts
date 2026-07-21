'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchQuery, graphql, useRelayEnvironment } from 'react-relay';
import type { useBillingProvisioningStatusQuery as UseBillingProvisioningStatusQueryType } from '@/__generated__/useBillingProvisioningStatusQuery.graphql';
import { BillingProvisioningState } from '@/generated/schema-enums';

const POLL_INTERVAL_MS = 3000;
/** Transient failures are expected while the schedulers churn; a hard one (field absent) is not. */
const MAX_CONSECUTIVE_ERRORS = 5;

const billingProvisioningStatusQuery = graphql`
  query useBillingProvisioningStatusQuery {
    billingProvisioningStatus {
      state
      message
    }
  }
`;

interface ProvisioningStatus {
  /** Compare against `BillingProvisioningState` — kept as the raw string so the
      Relay artifact's `%future added value` member doesn't need casting away. */
  state: string;
  message: string;
}

/**
 * Polls the tenant's billing provisioning state until it reports READY, then stops.
 *
 * Used only by the dev test-clock panel: a reset tears the Stripe customer down and
 * the schedulers rebuild it over the next minutes, during which the billing data on
 * the page is not yet trustworthy. Deliberately runs outside Suspense (`fetchQuery`
 * rather than `useLazyLoadQuery`) so each poll doesn't blank the panel.
 */
export function useBillingProvisioningStatus() {
  const environment = useRelayEnvironment();
  const [status, setStatus] = useState<ProvisioningStatus | null>(null);
  const [restartKey, setRestartKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restartKey is the re-run trigger, not read in the body.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    // Retained so an in-flight request is actually disposed on cleanup/restart —
    // the `cancelled` guard only stops state updates, it doesn't cancel the fetch.
    let subscription: { unsubscribe: () => void } | null = null;

    const scheduleNext = () => {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = () => {
      subscription = fetchQuery<UseBillingProvisioningStatusQueryType>(
        environment,
        billingProvisioningStatusQuery,
        {},
        { fetchPolicy: 'network-only' },
      ).subscribe({
        next: data => {
          if (cancelled) return;
          consecutiveErrors = 0;
          const next = data.billingProvisioningStatus;
          setStatus({ state: next.state, message: next.message });
          if (next.state === BillingProvisioningState.PENDING) scheduleNext();
        },
        error: () => {
          // Dev-only widget: keep the last known state on screen and retry quietly
          // rather than toasting on every poll.
          if (cancelled) return;
          consecutiveErrors += 1;
          if (consecutiveErrors < MAX_CONSECUTIVE_ERRORS) scheduleNext();
        },
      });
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription?.unsubscribe();
    };
  }, [environment, restartKey]);

  /** Restart polling after an operation that re-provisions the tenant (i.e. a reset). */
  const restart = useCallback(() => setRestartKey(k => k + 1), []);

  return { status, restart };
}
