'use client';

import { Button, ContentPageContainer } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useEffect, useRef } from 'react';

/**
 * Route-segment error boundary: catches render/data errors thrown below the
 * root layout so the app shell (header, sidebar, safe-area chrome) stays
 * mounted and only the page content is replaced. `reset()` re-renders the
 * failed segment; a full reload is the fallback when the error is not
 * recoverable.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    console.error('[Error Boundary]', error);
  }, [error]);

  // The heading lives inside ContentPageContainer, so the primary action is the
  // focus destination: keyboard/AT users land on the recovery control instead of
  // whatever the replaced page content had focused.
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <div role="alert">
      <ContentPageContainer
        title="Something Went Wrong"
        subtitle="An unexpected error occurred while loading this page."
      >
        <div className="flex gap-4">
          <Button ref={retryRef} variant="accent" onClick={reset}>
            Try Again
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </ContentPageContainer>
    </div>
  );
}
