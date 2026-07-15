'use client';

import { AuthShell } from '@flamingo-stack/openframe-frontend-core/components/features';
import { TabSelector } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CreateOrganizationSection } from '@/app/(auth)/auth/components/create-organization-section';
import { useAuthStore } from '@/app/(auth)/auth/stores/auth-store';
import { isAuthOnlyMode } from '@/lib/app-mode';
import { routes } from '@/lib/routes';

export default function AuthPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && !isAuthOnlyMode()) {
      router.push(routes.dashboard);
    }
  }, [isAuthenticated, router]);

  const handleCreateOrganization = (orgName: string, domain: string, email: string, prNumber?: number) => {
    // Store org details and navigate to signup screen
    sessionStorage.setItem('auth:org_name', orgName);
    sessionStorage.setItem('auth:domain', domain);
    sessionStorage.setItem('auth:email', email);
    if (prNumber !== undefined) {
      sessionStorage.setItem('auth:pr_number', String(prNumber));
    } else {
      sessionStorage.removeItem('auth:pr_number');
    }
    router.push('/auth/signup/');
  };

  const tabs = (
    <TabSelector
      value="signup"
      onValueChange={value => {
        if (value === 'login') router.push('/auth/login');
      }}
      variant="primary"
      items={[
        { id: 'signup', label: 'Sign Up' },
        { id: 'login', label: 'Login' },
      ]}
    />
  );

  return (
    <AuthShell tabs={tabs}>
      <CreateOrganizationSection onCreateOrganization={handleCreateOrganization} />
    </AuthShell>
  );
}
