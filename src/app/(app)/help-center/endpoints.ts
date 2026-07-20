/**
 * SINGLE SOURCE for every Help Center content endpoint — every page reads from
 * `EP`, so repointing the data source is a one-line change to `CONTENT_BASE`.
 *
 * On the WEB, `CONTENT_BASE` is RELATIVE (`/content`) — same-origin, exactly
 * like the embedded chat. The browser always calls the page origin; Next's
 * `rewrites()` (see `next.config.mjs`) forwards `/content/*` →
 * `${NEXT_PUBLIC_TENANT_HOST_URL}/content/*` SERVER-SIDE, carrying the session
 * cookie + auth headers — the SAME proven path the chat uses. This is
 * deliberately NOT an absolute cross-origin URL: a direct browser → tenant-host
 * request doesn't reliably carry the session (cross-origin cookie) and forces
 * the dev-ticket localStorage bearer + a cross-origin refresh, which is exactly
 * what 401s. Staying same-origin avoids all of that.
 *
 * In the NATIVE SHELL the page origin is `capacitor://localhost` (static
 * export, no Next server, no `rewrites()`), so a relative `/content` resolves
 * to a file that doesn't exist in the bundle. There — and ONLY there —
 * `CONTENT_ORIGIN` absolutizes every content endpoint to the tenant gateway.
 * The shell is always in bearer mode, and the chat's `EmbedAuthAdapter` lists
 * this origin in `allowedOrigins` so `embedAuthedFetch`'s cross-origin guard
 * sanctions it. Module-load evaluation is safe: a login that CHANGES the
 * tenant host does a full `window.location.assign` (see `NativeLoginResult.
 * tenantHostChanged`), so this module re-evaluates with the new host.
 *
 * The lib's content surfaces still fetch through `contentFetch`, which — because
 * this app registers an EmbedAuthAdapter for the chat — routes through
 * `embedAuthedFetch` (bearer in dev-ticket mode + `credentials: include` +
 * 401-refresh). Same-origin keeps `embedAuthedFetch` valid in prod builds too.
 */
import type { EndpointsRuntime } from '@flamingo-stack/openframe-frontend-core/contexts';
import { isNativeShell } from '@/lib/native-shell';
import { runtimeEnv } from '@/lib/runtime-config';

/** `''` on the web (relative, same-origin); the tenant gateway origin in the
 *  native shell. Exported for the chat auth adapter's `allowedOrigins`. */
export const CONTENT_ORIGIN = isNativeShell() ? runtimeEnv.tenantHostUrl() : '';

const CONTENT_BASE = `${CONTENT_ORIGIN}/content`;
const CONTENT = `${CONTENT_BASE}/api`;

/**
 * The route prefix this whole section is mounted under.
 *
 * Also the fixed `href` target for every Help Center page's back button.
 * These pages are INTENTIONALLY left out of the app-wide "generic Back that
 * returns to the actual previous page" (`useSafeBack`) unification: they are
 * rendered by lib components (`RoadmapPage`, `FaqDocumentPage`,
 * `HelpCenterList`, …) whose `backButton` prop only accepts `{ label, href }`
 * — no `onClick`, so `useSafeBack` can't be wired in without a core-lib change.
 * The specific labels ("Back to Help Center" / "Back to releases") are kept on
 * purpose: they are accurate for this fixed destination. Switching to a lone
 * "Back" would imply history-back that these buttons don't actually perform.
 */
export const HELP_CENTER_BASE = '/help-center';

/** Route the knowledge-base docs hub (`<DocsHubPage>`) is mounted under — base
 *  page + its `[...path]` deep-link route. Lives here (a dep-light module) so
 *  both the page and the chat's doc-chip `baseRoute` share one SSOT without
 *  pulling the client `DocsHubPage` module into the chat bundle. */
export const KNOWLEDGE_BASE_ROUTE = `${HELP_CENTER_BASE}/knowledge-base`;

/** Base the `<FaqSection>` appends `/api/faqs?…` to. */
export const CONTENT_API_BASE = CONTENT_BASE;

export const EP = {
  // onboarding guides
  onboarding: `${CONTENT}/onboarding-guides`,
  onboardingSections: `${CONTENT}/onboarding-guides/sections`,
  onboardingBySlug: (slug: string) => `${CONTENT}/onboarding-guides/${slug}`,
  // roadmap
  roadmap: `${CONTENT}/roadmap`,
  roadmapVote: `${CONTENT}/roadmap/vote`,
  roadmapById: (id: string) => `${CONTENT}/roadmap/${id}`,
  // delivery (bug-fixes & enhancements) — `delivery` is the base route that
  // takes `?task_ids=` and returns BOTH `{ completed, inProgress }` (used by the
  // release-detail section); the two list endpoints feed the standalone page.
  delivery: `${CONTENT}/delivery`,
  deliveryCompleted: `${CONTENT}/delivery/completed`,
  deliveryInProgress: `${CONTENT}/delivery/in-progress`,
  // product releases
  productReleases: `${CONTENT}/releases`,
  productReleaseBySlug: (slug: string) => `${CONTENT}/releases/${slug}`,
  // legal (privacy / terms)
  legal: (docType: string) => `${CONTENT}/legal/${docType}`,
  // FAQs — `<FaqSection apiBaseUrl=CONTENT_API_BASE>` self-builds `/api/faqs`.
  // knowledge base (docs hub) — the lib `<DocsHubPage>` fetches the tree +
  // content from `…/docs/sources/<sourceId>/{structure,content}`, resolves
  // relative in-doc links via `…/docs/resolve-link`, and backs the in-source
  // RAG search bar with `…/docs/search`. All four proxy through `/content` to
  // the hub's `/api/docs/*` routes (the same path every other Help Center
  // surface uses). `openframe-docs` is the public knowledge-hub source.
  docsStructure: (sourceId: string) => `${CONTENT}/docs/sources/${sourceId}/structure`,
  docsContent: (sourceId: string) => `${CONTENT}/docs/sources/${sourceId}/content`,
  docsResolveLink: `${CONTENT}/docs/resolve-link`,
  docsSearch: `${CONTENT}/docs/search`,
} as const;

/**
 * EndpointsRuntime for the lib's contact / access-code / announcement surfaces.
 *
 * Help Center mounts only ONE of these: the authed ticket create form, which
 * wraps the lib `<ContactForm>`. `<ContactForm>` calls `useContactSubmission`
 * (→ `useRequiredEndpointsRuntime()`) UNCONDITIONALLY at the top of render —
 * even though `HelpCenterCreateForm` supplies its OWN ticket submit. So this
 * context MUST be mounted in the subtree or the authed form throws
 * `[endpoints-runtime] hook called outside an <EndpointsRuntimeContext.Provider>`.
 *
 * `contactUrl` is never actually POSTed in the ticket flow (the ticket form's
 * custom submit handles it); these values exist to satisfy the required-context
 * contract, all on the same `/content` proxy as every other endpoint. A stable
 * module constant (not rebuilt per render) — safe to pass straight to the
 * provider with no `useMemo`.
 */
export const HELP_CENTER_ENDPOINTS: EndpointsRuntime = {
  announcementsUrl: `${CONTENT}/announcements`,
  accessCode: {
    validateUrl: `${CONTENT}/validate-access-code`,
    consumeUrl: `${CONTENT}/consume-access-code`,
  },
  contactUrl: `${CONTENT}/contact`,
};
