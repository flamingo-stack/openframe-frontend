'use client';

import {
  ActivityIcon,
  BracketCurlyIcon,
  MonitorIcon,
  TerminalIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { DevicesPanel, EmptyState, onboardingGuideButton } from '@/app/components/shared';
import { routes } from '@/lib/routes';
import { useHasOrganizations } from './hooks/use-has-organizations';

export default function Devices() {
  const { hasOrganizations, isLoading } = useHasOrganizations();

  return (
    <DevicesPanel
      className="px-[var(--spacing-system-l)] pb-[var(--spacing-system-l)]"
      archiveHref={routes.devices.archive}
      // Only treat the tenant as having no customers once the check resolves, so the
      // "Add a customer" banner doesn't flash during loading. While checking, the
      // panel still keeps "Add Device" disabled via isCheckingOrganizations.
      noOrganizations={hasOrganizations === false}
      isCheckingOrganizations={isLoading}
      emptyState={
        <EmptyState
          icon={<MonitorIcon />}
          title="No devices connected"
          description="Devices (laptops, servers, workstations, mobile) you monitor and manage across all client Customers will be displayed here."
          actions={[
            { icon: <ActivityIcon />, label: 'Monitor health, CPU, memory, and disk usage in real time' },
            { icon: <BracketCurlyIcon />, label: 'Run scripts, policies, and queries across one or many devices' },
            { icon: <TerminalIcon />, label: 'Launch remote sessions and view full software inventory' },
          ]}
          {...onboardingGuideButton('devices', 'Learn more about Devices')}
        />
      }
    />
  );
}
