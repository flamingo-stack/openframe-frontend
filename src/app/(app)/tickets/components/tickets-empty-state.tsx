'use client';

import {
  Filter02Icon,
  RadarIcon,
  TagIcon,
  UserPlusIcon,
} from '@flamingo-stack/openframe-frontend-core/components/icons-v2';
import { EmptyState, onboardingGuideButton } from '@/app/components/shared';

/**
 * The tickets empty state (Figma `data-placeholder-onboarding`, nodes
 * 8387-21182 / 8001-75892 / 8001-75902): tag icon + message, three feature
 * tiles, and the Help-Center onboarding guide footer button. Shared verbatim
 * by the Tickets page and the device-details Tickets tab.
 */
export function TicketsEmptyState() {
  return (
    <EmptyState
      icon={<TagIcon />}
      title="Ticket history empty"
      description="Conversations will appear here when available"
      actions={[
        { icon: <RadarIcon />, label: 'Track issues from report to resolution' },
        { icon: <Filter02Icon />, label: 'Filter by client, status, priority, or assignee' },
        { icon: <UserPlusIcon />, label: 'Assign, prioritize, and reply in one place' },
      ]}
      {...onboardingGuideButton('tickets', 'Learn more about Tickets')}
    />
  );
}
