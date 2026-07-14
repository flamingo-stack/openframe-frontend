import type { TicketStatusDefinition } from '../statuses/types/ticket-statuses.types';
import { TICKET_STATUS_KIND } from './ticket-statistics';

/**
 * True when `statusId` refers to a RESOLVED-kind status in `snapshot`.
 *
 * Single source of truth for "is this transition/edit resolving the ticket?",
 * used to fire the `resolve_ticket_ticket_detail` activity event from every
 * resolve entry point (the detail-view status changer and the Edit Ticket form).
 * Keyed on `kind`, not a hardcoded id/name, so custom-named resolved statuses
 * ("Done", "Closed", …) are recognized. `availableTransitions` carries no
 * `kind`, so callers pass the full statuses `snapshot`.
 */
export function isResolvedStatusId(
  statusId: string | null | undefined,
  snapshot: TicketStatusDefinition[] | undefined,
): boolean {
  if (!statusId || !snapshot) return false;
  return snapshot.find(s => s.id === statusId)?.kind === TICKET_STATUS_KIND.RESOLVED;
}
