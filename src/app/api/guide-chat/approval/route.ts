/**
 * POST /api/guide-chat/approval — same-origin streaming proxy for Guide-mode
 * agent tool approvals. Forwards to the hub's
 * `POST /api/chat/agent/confirm-tool` with the server-held service token.
 * See `@/lib/guide-chat-hub-proxy` for the full contract.
 */

import { proxyGuideChatToHub } from '@/lib/guide-chat-hub-proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return proxyGuideChatToHub(request, '/api/chat/agent/confirm-tool');
}
