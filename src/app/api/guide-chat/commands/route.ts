/**
 * GET /api/guide-chat/commands — same-origin proxy for the Guide-mode
 * slash-command catalog. Forwards to the hub's `GET /api/docs/commands`
 * (query string included) with the server-held service token.
 * See `@/lib/guide-chat-hub-proxy` for the full contract.
 */

import { proxyGuideChatToHub } from '@/lib/guide-chat-hub-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return proxyGuideChatToHub(request, '/api/docs/commands');
}
