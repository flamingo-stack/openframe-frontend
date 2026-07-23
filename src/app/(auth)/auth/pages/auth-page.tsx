'use client';

import { AuthShell, type AuthSsoProvider } from '@flamingo-stack/openframe-frontend-core/components/features';
import { TabSelector } from '@flamingo-stack/openframe-frontend-core/components/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CreateOrganizationSection } from '@/app/(auth)/auth/components/create-organization-section';
import { useAuth } from '@/app/(auth)/auth/hooks/use-auth';
import { useRegistrationProviders } from '@/app/(auth)/auth/hooks/use-registration-providers';
import { useAuthStore } from '@/app/(auth)/auth/stores/auth-store';
import { isAuthOnlyMode } from '@/lib/app-mode';
import { routes } from '@/lib/routes';

export default function AuthPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { isLoading, registerOrganizationSso } = useAuth();
  const { providers } = useRegistrationProviders();

  useEffect(() => {
    if (isAuthenticated && !isAuthOnlyMode()) {
      // replace, not push: an authenticated user landing on /auth (e.g. via back)
      // is redirected without leaving /auth in the back stack — no login flash,
      // no back-loop. Pairs with the replace at login success in use-auth.ts.
      router.replace(routes.dashboard);
    }
  }, [isAuthenticated, router]);

  const handleCreateOrganization = (orgName: string, domain: string, email: string) => {
    // Store org details and navigate to signup screen
    sessionStorage.setItem('auth:org_name', orgName);
    sessionStorage.setItem('auth:domain', domain);
    sessionStorage.setItem('auth:email', email);
    router.push('/auth/signup/');
  };

  // External providers offered by the backend for registration.
  const ssoProviders: AuthSsoProvider[] = (['google', 'microsoft'] as const).filter(provider =>
    providers.some(sp => sp.provider === provider),
  );

  const handleSsoRegister = (orgName: string, domain: string, email: string, provider: AuthSsoProvider) => {
    if (provider !== 'google' && provider !== 'microsoft') return;
    void registerOrganizationSso({
      tenantName: orgName,
      tenantDomain: domain,
      email,
      provider,
      redirectTo: '/auth/login',
    });
  };

  const tabs = (
    <TabSelector
      value="signup"
      onValueChange={value => {
        if (value === 'login') router.replace(routes.auth.login);
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
      <CreateOrganizationSection
        onCreateOrganization={handleCreateOrganization}
        ssoProviders={ssoProviders}
        onSsoRegister={handleSsoRegister}
        isLoading={isLoading}
      />
    </AuthShell>
  );
}
