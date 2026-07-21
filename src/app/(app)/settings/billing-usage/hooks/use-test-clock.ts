'use client';

import { useToast } from '@flamingo-stack/openframe-frontend-core/hooks';
import { useCallback } from 'react';
import { commitLocalUpdate, graphql, useMutation, useRelayEnvironment } from 'react-relay';
import type { useTestClockAdvanceMutation as UseTestClockAdvanceMutationType } from '@/__generated__/useTestClockAdvanceMutation.graphql';
import type { useTestClockResetMutation as UseTestClockResetMutationType } from '@/__generated__/useTestClockResetMutation.graphql';

/**
 * Stripe test-clock mutations (dev/stage only — see `runtimeEnv.enableBillingTestClock`).
 * Both invalidate the Relay store on success: advancing the clock re-runs the tenant's
 * billing jobs and resetting deletes the Stripe customer, so subscription status, period
 * dates and invoices all change server-side without those fields being part of the
 * mutation payload.
 */

const advanceTestClockMutation = graphql`
  mutation useTestClockAdvanceMutation($days: Int!) {
    advanceTestClock(days: $days) {
      frozenTime
    }
  }
`;

const resetTestClockMutation = graphql`
  mutation useTestClockResetMutation {
    resetTestClock
  }
`;

/**
 * Relay wraps GraphQL errors as "No data returned for operation `x`, got error(s): <real message>".
 * The backend's own message is the only useful part in a toast — the wrapper eats the width and
 * pushes the actual reason past the truncation point.
 */
function extractGraphqlErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = /got error\(s\):\s*([\s\S]+)/.exec(err.message);
  return (match?.[1] ?? err.message).trim() || fallback;
}

export function useAdvanceTestClock() {
  const { toast } = useToast();
  const environment = useRelayEnvironment();
  const [commit, isInFlight] = useMutation<UseTestClockAdvanceMutationType>(advanceTestClockMutation);

  const mutate = useCallback(
    (days: number, onSuccess?: (frozenTime: string | null) => void) => {
      commit({
        variables: { days },
        onCompleted: (response, errors) => {
          // `advanceTestClock` is nullable, so a failed mutation still resolves as a
          // valid payload ({ advanceTestClock: null } plus `errors`) and Relay routes
          // it here rather than to onError. Without this check the failure would be
          // silent and the panel would report the clock as gone.
          if (errors?.length) {
            toast({
              title: 'Advance Failed',
              description: errors.map(e => e.message).join('; '),
              variant: 'destructive',
            });
            return;
          }
          commitLocalUpdate(environment, store => store.invalidateStore());
          onSuccess?.(response.advanceTestClock?.frozenTime ?? null);
        },
        onError: err => {
          toast({
            title: 'Advance Failed',
            description: extractGraphqlErrorMessage(err, 'Failed to advance the test clock'),
            variant: 'destructive',
          });
        },
      });
    },
    [commit, toast, environment],
  );

  return { mutate, isPending: isInFlight };
}

export function useResetTestClock() {
  const { toast } = useToast();
  const environment = useRelayEnvironment();
  const [commit, isInFlight] = useMutation<UseTestClockResetMutationType>(resetTestClockMutation);

  const mutate = useCallback(
    (onSuccess?: () => void) => {
      commit({
        variables: {},
        onCompleted: (_response, errors) => {
          // `resetTestClock` is non-null, so failures usually surface via onError —
          // but a partial-error payload would land here, and treating it as success
          // would wrongly clear the displayed clock.
          if (errors?.length) {
            toast({
              title: 'Reset Failed',
              description: errors.map(e => e.message).join('; '),
              variant: 'destructive',
            });
            return;
          }
          commitLocalUpdate(environment, store => store.invalidateStore());
          onSuccess?.();
        },
        onError: err => {
          toast({
            title: 'Reset Failed',
            description: extractGraphqlErrorMessage(err, 'Failed to reset the test clock'),
            variant: 'destructive',
          });
        },
      });
    },
    [commit, toast, environment],
  );

  return { mutate, isPending: isInFlight };
}
