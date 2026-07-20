'use client';

import { FlamingoLogo, OpenFrameLogo, OpenFrameText } from '@flamingo-stack/openframe-frontend-core/components/icons';
import { Button } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter, useSearchParams } from 'next/navigation';

const DEFAULT_ERROR = {
  title: 'Oops, Something Went Wrong',
  description: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
};

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const errorCode = searchParams.get('error') || '';
  const { title, description } = {
    title: DEFAULT_ERROR.title,
    description: errorCode || DEFAULT_ERROR.description,
  };

  return (
    <div className="min-h-screen bg-ods-bg flex flex-col items-center justify-between p-10">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <OpenFrameLogo
          className="h-10 w-auto"
          lowerPathColor="var(--color-accent-primary)"
          upperPathColor="var(--color-text-primary)"
        />
        <OpenFrameText textColor="var(--color-text-primary)" style={{ width: '144px', height: '24px' }} />
      </div>

      {/* Error Content */}
      <div className="flex flex-col items-center gap-10 max-w-[600px] text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-h2 text-ods-text-primary">{title}</h1>
          <p className="text-h4 text-ods-text-secondary">{description}</p>
        </div>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => window.open('https://www.flamingo.run/contact', '_blank', 'noopener,noreferrer')}
          >
            Contact Support
          </Button>
          <Button variant="accent" onClick={() => router.push('/auth')}>
            Go to Login
          </Button>
        </div>
      </div>

      {/* Footer */}
      <a
        href="https://flamingo.run"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-4 text-ods-text-secondary rounded-md bg-transparent hover:bg-ods-bg-hover transition-colors"
      >
        <span className="text-h6">Powered by</span>
        <FlamingoLogo className="h-5 w-5" fill="currentColor" />
        <span className="text-code font-semibold">Flamingo</span>
      </a>
    </div>
  );
}
