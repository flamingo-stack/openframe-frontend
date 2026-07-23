'use client';

import {
  BellCheckIcon,
  FolderShieldIcon,
  Hierarchy02Icon,
  RadarIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { EmptyState, onboardingGuideButton } from '@/app/components/shared';

/**
 * The policies default empty state: folder-shield icon + message, three
 * feature tiles, and the Help-Center onboarding guide footer button. Shared
 * verbatim by the Monitoring page's Policies tab and the device-details
 * Policies tab.
 */
export function PoliciesEmptyState() {
  return (
    <EmptyState
      icon={<FolderShieldIcon />}
      title="No policies yet"
      description="Rules that automatically enforce settings, configurations, and security standards across devices will be displayed here."
      actions={[
        { icon: <Hierarchy02Icon />, label: 'Apply settings to many devices at once' },
        { icon: <RadarIcon />, label: 'Target devices by Customer, OS, or tag' },
        { icon: <BellCheckIcon />, label: 'Get alerts when devices fall out of compliance' },
      ]}
      {...onboardingGuideButton('policies', 'Learn more about Policies')}
    />
  );
}
