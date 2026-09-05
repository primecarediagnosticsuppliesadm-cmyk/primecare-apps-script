# Blueprint CHANGELOG

Gaps, conflicts, and structural changes. **Add entry when doc vs code disagree or structure changes.**

---

## 2026-09-05 — Lab Ordering 1H AR UPDATE grant + projection overload drop

### Gap found

- Production `updateOrderStatusWrite` attempted AR posting on Fulfilled, but `has_table_privilege('authenticated','public.ar_credit_control','UPDATE') = false`. The bump was classified `skipped: true`, so `orders.ar_posted` stayed false while inventory/invoice/shipment succeeded. Certified GOLD order `ORD-1788630162033-btia0v` is **not** re-fulfilled; repair is a separate Founder-authorized exact-order step.
- QA already had authenticated AR UPDATE. Production did not. RLS `ar_credit_update_by_role` already authorizes Admin/Executive via `can_manage_distributor_ops_for_tenant` (tenants row present). 1H does **not** change that policy unless QA proves it still blocks HQ after GRANT.
- Both environments had 2-argument and 3-argument overloads of `refresh_proj_order_row_v1` and `refresh_proj_lab_receivable_row_v1`. PostgREST could not choose when the client omitted `p_cascade_metrics`. 3-argument with `DEFAULT true` is canonical. `rebuild_projection_v1` already calls 3-arg. No `pg_depend` on the 2-arg forms.

### Change

- `GRANT UPDATE ON TABLE public.ar_credit_control TO authenticated`. No anon GRANT. No RLS rewrite.
- `DROP FUNCTION` only the `(uuid, text)` overloads. Canonical 3-arg workers unchanged.
- `projectionRefreshApi.js` always sends `p_cascade_metrics: true`.

### Verification

- `node scripts/verify-lab-ordering-1h-ar-and-projection.mjs`
- `node scripts/verify-lab-ordering-1h-ar-and-projection.mjs --apply` (QA only; new QA order; refuses Production)

---

## 2026-09-05 — Lab Ordering 1F anon order table lockdown (QA certified)

### Gap found

- Production still has leftover `temp_anon_order_items_insert` / `temp_anon_order_items_select` policies. Certified 1B does not drop them.
- Production anon currently has no SELECT/INSERT on `orders` / `order_items` / `order_lines` (no confirmed open data dump), but still has unused `REFERENCES` / `TRIGGER` / `TRUNCATE`.
- QA before 140000: no `TO anon` policies, but anon had SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES grants. RLS hid rows; PostgREST still accepted the request until REVOKE.

### Change

- Applied on **QA only**: `20260905140000_lab_ordering_1f_anon_order_lockdown.sql` (twin not applied separately).
- Drops any `TO anon` policy on the three tables; `REVOKE ALL` from `PUBLIC` and `anon`; restores `authenticated` DML and `service_role` ALL; `NOTIFY pgrst`.
- Does not change 1A `create_lab_order`, 1B `v_lab_catalog`, or 1C HQ search. **Not applied to Production.**

### Verification

- `node scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs`
- `node scripts/verify-lab-ordering-1f-anon-order-lockdown.mjs --live`
- `node scripts/verify-lab-ordering-1a-security.mjs --apply`
- `node scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs --apply`
- `node scripts/verify-lab-ordering-1c-hq-order-search.mjs --live`

---

## 2026-09-05 — Lab Ordering 1C HQ exact order-ID search (QA only)

### Gap found

- HQ Orders default list is bounded (`getOrdersRead` / `HQ_ORDERS_LIST_DEFAULT_LIMIT` = 100, recent `order_date` window).
- OrdersPage search only filtered those loaded rows (`filterOrders` client-side). A valid same-tenant Lab order such as `ORD-1788618878140-s6x0x8` was invisible when it fell outside that window.

### Change

- Default Orders queue remains bounded (no full-table load, no limit increase).
- Exact business `order_id` search (`ORD-…`) calls `lookupHqOrderByIdRead`: bounded `.eq("order_id").limit(1)` under RLS.
- Authorization: session `profiles.role` must be admin or executive; tenant comes from session profile + RLS. Client `tenant_id` is not used to authorize. Agent/Lab are denied the HQ lookup.

### Verification

- `node scripts/verify-lab-ordering-1c-hq-order-search.mjs`
- `node scripts/verify-lab-ordering-1c-hq-order-search.mjs --live` (QA read-only)
- `node scripts/verify-lab-ordering-1a-security.mjs`
- `node scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs`

---

## 2026-09-05 — Lab Ordering 1B catalog price consistency + order_items lockdown (QA only)

### Gap found

- QA `v_lab_catalog` joined `products` on `product_id` only. `QA_SKU_002` exists on HQ (`selling_price=800`) and another tenant (`selling_price=15`). Lab UI displayed ₹15; `create_lab_order` persisted HQ ₹800.
- Lab role could `INSERT` `order_items` on own orders (legacy checkout fallback), bypassing RPC pricing.

### Change

- New versioned migration `20260905130000_lab_ordering_1b_catalog_price_and_item_lockdown.sql` recreates `v_lab_catalog` with `tenant_id + product_id` join so `unit_selling_price = products.selling_price` for that tenant.
- Lab has no INSERT/UPDATE/DELETE on `order_items` or `order_lines`. HQ/Admin ops writes preserved. `create_lab_order` (SECURITY DEFINER) still writes lines.
- Catalog mapper no longer falls back to `unit_price`. `getLabCatalogRead` filters to the preferred tenant.

### Verification

- `node scripts/verify-lab-ordering-1a-security.mjs`
- `node scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs`
- `node scripts/verify-lab-ordering-1b-price-and-item-lockdown.mjs --apply` (QA only)

---

## 2026-09-05 — Lab Ordering 1A server-authoritative price (QA only)

### Gap found

- `create_lab_order` persisted client `unit_price`, so a manipulated browser price could become `order_items.unit_price`.
- Lab-initiated create did not fail closed on inactive Lab records and trusted client `tenant_id` / `lab_id` when they matched loosely.

### Change

- New versioned migration `20260905120000_create_lab_order_server_authoritative_price.sql` (Track A twin: `supabase/sql/create_lab_order_server_authoritative_price.sql`).
- Authoritative unit price is existing `products.selling_price` (same as `v_lab_catalog.unit_selling_price`). No contract pricing.
- Lab identity comes from the authenticated active profile. Client tenant/lab spoof is `forbidden`. `hq_managed` still blocks Lab initiate; HQ/Admin on-behalf still uses `p_tenant_id` / `p_lab_id`.
- PLACE still validates stock only; fulfillment deduction is unchanged.
- Lab checkout payload no longer sends `unit_price`. RPC rejection no longer falls back to client-priced inserts.

### Verification

- `node scripts/verify-lab-ordering-1a-security.mjs`
- `node scripts/verify-lab-ordering-1a-security.mjs --apply` (QA only)

---

## 2026-09-04 — STAB-1 client stability (QA-native, no schema)

### Gap found

- Open tabs keep hashed `React.lazy()` chunk URLs after a Vercel deploy; `AppErrorBoundary` required a manual refresh and could loop if mis-reloaded.
- `applySupabaseSession` had no generation guard: an older failed bootstrap/SIGNED_IN apply could `setCurrentUser(null)` after a newer success. Profile `maybeSingle()` had no client timeout, so `authLoading` could hang on "Verifying your session…".
- `App.jsx` rendered `<NonPilotReleaseScreen />` which was never defined (first-paint crash for login-enabled non-pilot roles while `role` state is still null).

### Change

- One-shot stale-chunk reload via `chunkLoadRecovery.js` + `AppErrorBoundary`. Guard cleared after a healthy load. Idle `routePrefetch` still swallows import errors (must not reload).
- Auth apply generation + 12s profile-read timeout. Stale applies cannot wipe a newer user. `TOKEN_REFRESHED` still token-only. Inactive/unauthorized profile still fail-closed.
- Non-pilot branch uses existing `UnauthorizedScreen` + `NON_PILOT_RELEASE_MESSAGE`. `App.normalizeRole` also requires `canAuthenticateRole` so that crash-fix does not admit non-pilot roles into the shell. No migrations, RLS, or business-feature change.

### Verification

- `node scripts/verify-stab-1-client-stability.mjs`

---

## 2026-09-01 — Agent Resources DOCX download (no preview)

### Change

- HQ may publish validated `.docx` in addition to PDF/JPEG/PNG. New migration `agent_resources_docx_mime.sql` / `20260901210000_agent_resources_docx_mime.sql` widens `agent_resource_versions` MIME CHECK and the private `agent-resources` bucket allowlist only.
- Client OPC inspection (ZIP **entry names**, no decompression, no extra dependency) requires `[Content_Types].xml` + `word/document.xml`. Still blocked: `.doc`, `.docm`, generic ZIP, XLSX, PPTX, macros. PDF/JPEG/PNG magic bytes unchanged.
- DOCX Open is **Download** via 300s signed URL with `download` filename. No public URL, no Word preview engine, no conversion, no RLS change.

### Verification

- `node scripts/verify-agent-resources-file-types.mjs`
- `node scripts/verify-agent-resources-schema.mjs`
- `node scripts/verify-agent-resources-storage.mjs`
- `node scripts/verify-agent-resources-publisher.mjs`
- `node scripts/verify-agent-resources-agent-access.mjs`
- `npm run build`

---

## 2026-09-01 — Operations Center agent merge: profile wins same auth user

### Gap found

- `mergeAgentsByAgentId` deduplicated only on `agentId`. Production Vishwak appears twice because `profiles.agent_id` (`AGT_VISHWAK_RATA_36CC`) ≠ `users.user_code` (auth UUID `685b0ff4-…`), even though both rows are the same auth user (`profiles.user_id` = `users.user_code`).
- Operational mapper dropped `users.user_code` as a user identity field (`agentId` was set to `user_code`, `userId` was empty at merge).

### Change

- Profile-derived agents remain canonical. Operational rows are skipped when `agentId` matches **or** auth-user identity (`userId`) matches a profile agent. Display name/email/username are not dedupe keys.
- `mapUsersTableAgentRow` preserves `userId` from `users.user_code`. `mapOperationsAgentRow` copies that identity without treating a users-table row as `source: "profile"`.
- Read-model only. No SQL, RLS, ownership writes, or stored `agent_id` changes.

### Verification

- `node scripts/verify-operations-center-agent-merge.mjs`

---

## 2026-09-01 — Production verification hardening (build identity + directory contract)

### Gap found

- User Directory Last Login debugging mixed a correct Production REST payload with a stale frontend tab (`*.vercel.app`). Build SHA already existed at Vite compile time (`VITE_APP_COMMIT_HASH`) but was not visible on Operations Center Daily view. QA Diagnostics (which shows SHA) is disabled in Production.

### Change

- Display existing `getAppBuildStamp()` on Operations Center (Daily and Advanced). Expose `window.__PRIMECARE_BUILD__` (env/commit/branch/buildStamp only). Extend UDI-12 with the live Production timestamp fixture and a single identity-field survival contract. Document the Production URL/SHA/Supabase identity STOP gate. No schema, RLS, RPC, Auth, freeze, Vercel, or Agent Resources change.

### Verification

- `node scripts/verify-operations-user-directory-integrity.mjs`
- `node scripts/verify-deploy-commit.mjs`

---

## 2026-09-01 — User Directory Last Login timestamp parse

### Gap found

- `profiles.last_login_at` reaches `formatLastLogin`, but PostgREST microsecond ISO strings (`…45.321813+00:00`) make `new Date(value)` invalid in WebKit, so Last Login renders `Never` for every user.

### Change

- Truncate fractional seconds to 3 digits before `Date` parse. Operator profile drawer formats `lastLoginAt` once (does not re-parse the display label). No schema, RLS, RPC, Auth, Access Audit, or Agent Resources change.

### Verification

- `node scripts/verify-operations-user-directory-integrity.mjs`

---

## 2026-09-01 — User Directory Last Login mapping

### Gap found

- `getOperationsPlatformUsersRead` already selects `profiles.last_login_at`. `mapProfilesPlatformUserRow` dropped the column, so `mapPlatformUserRow` / `formatLastLogin` always treated Last Login as `Never`.

### Change

- Pass `last_login_at` through `mapProfilesPlatformUserRow`. No schema, RLS, RPC, Auth, Access Audit, or Agent Resources change.

### Verification

- `node scripts/verify-operations-user-directory-integrity.mjs`

---

## 2026-08-31 — Agent Resources publisher nested Back navigation

### Gap found

- Manage / New Resource were React `view` state only. They did not push a history entry. Browser Back (and iOS swipe-back) popped the previous portal page. For Admin that is often Labs, which sits next to Agent Resources in OPERATIONS.

### Change

- Publisher nested views stay on `agentResources`. In-page **← Back to Agent Resources** returns to the list. Manage/create push same-path history so browser Back also returns to the list. No Labs hardcode. No schema/RLS/RPC/ack change.

### Verification

- `node scripts/verify-agent-resources-publisher.mjs`
- Manual: list → Manage → Back → list; Labs still opens from the sidebar

---

## 2026-08-31 — Agent Resources AR-1C agent consumption + acknowledgement

### Change

- Agent sidebar **Resources** (`agentResources`) → `AgentResourcesPage`. Same permission key as publisher; Admin/Executive still get `AgentResourcesPublisherPage`.
- Agent bounded list + reuse signed URL (300s). Explicit Mark as Read. Duplicate ack is idempotent. V2 is unread even if V1 was acknowledged.
- No schema/RLS/RPC change. Lab/HR still denied. No notifications, WhatsApp, or LMS.

### Verification

- `node scripts/verify-agent-resources-agent-access.mjs --remote`
- `node scripts/verify-agent-resources-acknowledgement.mjs --remote`
- AR-1A/AR-1B `--remote` regression

---

## 2026-08-31 — Agent Resources AR-1B publisher workflow

### Change

- Admin/Executive publisher API + page (`agentResources`). Create/upload draft, new version, metadata, named/all audience, publish RPC, archive, signed open (300s).
- No agent consumer UI. No HR Documents. No schema/RLS/RPC redesign (AR-1A migrations unchanged).
- Audience switch: named rows inserted before flipping to `named_agents`; leftover named rows deleted after flipping to `all_agents`.

### Verification

- `node scripts/verify-agent-resources-publisher.mjs`
- AR-1A `--remote` schema/RLS/storage regression
- Manual UAT in `25_Agent_Resources.md`

---

## 2026-08-31 — Agent Resources AR-1A live QA privilege lockdown + visibility fix

### Gap found

- After applying `20260831200000` on QA, `authenticated` had table privilege `arwdDxtm` (ALL) on all four Agent Resources tables, and `anon` had EXECUTE on `publish_agent_resource_version`. Cause: Supabase default privileges, not an explicit GRANT in the migration. RLS still denied most DML, but publishers could theoretically UPDATE `current_published_version_id` because a row UPDATE policy exists.
- Live agent SELECT of current published versions returned zero rows. Cause: `current_profile() IS NOT NULL` on a composite is false in PostgreSQL when any profile column (e.g. `lab_id`) is null.

### Change

- `REVOKE ALL … FROM authenticated` then re-GRANT intended privileges (`20260831201000`).
- Visibility helper uses `(current_profile()).user_id IS NOT NULL` (`20260831202000`).
- Live `--remote` tests in `verify-agent-resources-*.mjs`. Manifest 31/31.

### Verification

- `node scripts/verify-agent-resources-schema.mjs --remote`
- `node scripts/verify-agent-resources-storage.mjs --remote`
- `node scripts/verify-agent-resources-rls.mjs --remote`

---

## 2026-08-31 — Agent Resources V1 AR-1A foundation (docs + schema)

### Change

- Added `25_Agent_Resources.md` as product SoT for the field resource library.
- Schema: `agent_resources`, `agent_resource_versions`, `agent_resource_audiences`, `agent_resource_acknowledgements`; private bucket `agent-resources`; RLS; `publish_agent_resource_version` RPC.
- Explicitly **not** operational evidence, invoice PDFs, Employee 360 Documents, or LMS.
- `PEOPLE_OPS_HR_MODULE_ENABLED` remains `false`. No UI / menu in AR-1A.

### Verification

- `node scripts/verify-agent-resources-schema.mjs`
- `node scripts/verify-agent-resources-rls.mjs`
- `node scripts/verify-agent-resources-storage.mjs`
- Regression: invoice phase3 static, employee360 workspace, evidence SQL unchanged

---

## 2026-08-27 — Public /connect visiting-card content (no URL change)

### Change

- Enhanced `primecare-website` `/connect` as a compact mobile digital business card: who PrimeCare is, what we help labs procure, a conservative PrimeCare OS mention, then existing WhatsApp / Call / Quote / Website actions.
- No new public OS product page. “Talk to Us” reuses homepage `#enquiry`.
- Homepage copy unchanged. Small SPA hash-scroll fix so `/#enquiry` lands on the enquiry form after React paint.
- No portal, Supabase, schema, RLS, DNS, QR URL, or contact env changes.

### Verification

- `cd primecare-website && npm run verify`

---

## 2026-08-24 — Public website Sep 1 credibility / compliance pass

### Change

- Updated `primecare-website/` copy for Hyderabad field launch: procurement-focused hero, About section, safe category wording, discovery enquiry fields, softened Why/How language.
- No portal runtime, Supabase, schema, RLS, or DNS changes.
- Footer shows trade identity `PrimeCare Diagnostics · Hyderabad, Telangana` only. GSTIN / registration deferred until Founder provides verified details.

### Verification

- `cd primecare-website && npm run verify`
- `cd primecare-website && npm run build`

---

## 2026-08-20 — Public marketing website V1 (isolated package)

### Change

- Added `primecare-website/` — standalone Vite marketing site for `www.primecarediagnostics.in`.
- Completely separate from authenticated portal (`primecare-portal/`). No portal routes, auth, Supabase, RLS, or ERP modules changed.
- Enquiry V1 uses WhatsApp `wa.me` only (no new DB tables). Contact numbers/emails are env-configured, not invented.

### Verification

- `cd primecare-website && npm run verify`
- Portal build remains independent (`cd primecare-portal && npm run build`)

### Deployment

- See `primecare-website/docs/DEPLOYMENT.md`. DNS cutover requires Founder approval.

---

## 2026-08-18 — Agent Portal Recent Visits relative label used elapsed hours, not visit_date calendar day

### Change

- Displayed `Visit date · YYYY-MM-DD` already used canonical `agent_visits.visit_date`.
- Relative TODAY/YESTERDAY used the same field but compared elapsed milliseconds from local noon (`YYYY-MM-DDT12:00:00`), so a yesterday visit still showed TODAY until 24 hours after that noon.
- Fix: calendar-day comparison of visit/business YYYY-MM-DD vs local today. No schema, RLS, or visit write changes.

### Verification

- `node scripts/verify-agent-visit-relative-date.mjs`
- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `npm run build`

### Follow-up (non-blocking — not in this fix)

- `AgentLabSnapshotDrawer.formatWhen` still parses date-only values via `new Date(YYYY-MM-DD)`, which can shift the calendar day in negative-offset timezones.
- `AgentDailyWorkspaceSections.formatActivityWhen` still uses elapsed-time `new Date(iso)` for visit dates; date-only values can mis-bucket.

---

## 2026-08-16 — Release hardening / environment parity mitigation

### Change

- Added release-certification hardening layer: Supabase env identity guards, safe dry-run wrappers, DB foundation / manual-SQL drift / notification contract / legacy Apps Script / git safety / QA–Prod artifact parity verifiers, and `npm run certify:release` orchestrator.
- Runbook: `docs/operations/Release_Hardening_Runbook.md`.
- No business workflow changes. No DB migrations applied by this sprint.

### Verification

- `npm run certify:release:quick`
- `npm run build`
- Existing module verifies invoked by orchestrator

---

## 2026-08-16 — notification_events agent INSERT 42501 (RETURNING / SELECT RLS)

### Change

- QA agent POST `notification_events` returned `42501` / RLS even when `tenant_id_matches` + `current_user_role()='agent'` were true.
- Root cause: INSERT policy passed; PostgREST `.insert().select()` RETURNING failed SELECT RLS because visit events use `target_role=admin` and `notification_event_visible_to_current_user` is false for agents.
- Fix (app only): insert without RETURNING; client-generate `event_id` for delivery_log linkage. No RLS/policy/tenant payload changes. No Agent Visit changes.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — notification_delivery_log browser auth (apikey) contract

### Change

- Production 403 body `No API key found in request` is a Kong gateway rejection (missing `apikey`), not RLS/grants.
- Audited all `notification_delivery_log` browser paths: write is only via `createNotificationEvent` → canonical `supabase` client; read via `notificationApi` / predator probes — also canonical client. No raw `fetch`/`axios`/`rest/v1` construction in `src/`.
- Hardened sole write helper `notificationDeliveryLogWrite.js` + verify header contract (apikey + Authorization present; values not logged). No DB/RLS/grant changes.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs` (`notify.delivery.header_contract`, `runtime.notify.delivery_canonical_client`)
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — notification_delivery_log insert payload (no recipient)

### Change

- Production PGRST204: `Could not find the 'recipient' column of 'notification_delivery_log'`.
- Cause: deployed `createNotificationEvent` still built delivery rows with legacy `recipient` / `provider_response` / `error_message` (main). LIVE QA table has none of those columns.
- Fix (app only): insert via `buildNotificationDeliveryLogInsertRows` allowlisted to QA-canonical keys only. No schema change.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs` (`notify.delivery.insert_allowlist`)
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — notification_event_visible_to_current_user prerequisite parity

### Change

- Production failed `20260816150000_notification_delivery_log_parity.sql` with `42883`: function `notification_event_visible_to_current_user(uuid, text, uuid, text)` does not exist.
- LIVE QA has the helper (SQL STABLE SECURITY DEFINER, `search_path=public`, EXECUTE to PUBLIC); Production does not.
- Root cause: helper lived only in manual `supabase/sql/notifications_foundation_migration.sql` (applied on QA); `20260816140000` added event columns only.
- Prerequisite migration: `20260816145000_notification_event_visibility_helper_parity.sql` (before delivery-log parity; 150000 left unchanged to avoid QA checksum rewrite).
- Production deps already present: `tenant_id_matches`, `is_admin_or_executive`, `current_user_role`, `lab_record_is_visible_to_current_user`, `current_profile_lab_id`.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — notification_delivery_log QA→Production parity

### Change

- Production returns `POST /rest/v1/notification_delivery_log` **404** because `to_regclass('public.notification_delivery_log')` is NULL.
- LIVE QA table exists with columns: `delivery_id`, `event_id`, `tenant_id`, `channel`, `status`, `provider_message_id`, `provider_error`, `attempted_at`, `delivered_at`, `created_at` (not the older `recipient`/`provider_response`/`error_message` shape in `notifications_foundation_migration.sql`).
- Root cause: foundation SQL lived under `supabase/sql/` and was applied manually on QA; never shipped as a Production-bound versioned migration.
- Migration: `20260816150000_notification_delivery_log_parity.sql` (QA-canonical). Prerequisite: `20260816145000_notification_event_visibility_helper_parity.sql`.
- App insert aligned to QA columns; still fire-and-forget (visit SoT unchanged).

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — notification_events Production schema parity (Agent Visit 400)

### Change

- Production `notification_events` is still the GAP-006 stub (`id`, `title`, `message`, `payload`) while QA/app use foundation columns (`event_id`, `source_module`, `payload_json`, `actor_user_id`, …).
- Exact Production PostgREST body: `PGRST204` / `Could not find the 'actor_user_id' column of 'notification_events' in the schema cache`.
- Client: shared `buildNotificationEventInsertRows` + legacy stub fallback (cached after first PGRST204). Visit transaction unchanged.
- Migration: `20260816140000_notification_events_foundation_parity.sql` adds foundation columns without dropping legacy stub columns; no anon writes.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs` (notification contract asserts)
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — Agent Visit production console: Apps Script 500 + notification 400

### Change

- Production visit save already succeeded; console noise came from (1) `logClientError` → `POST /api/primecare` when `PRIMECARE_APPS_SCRIPT_URL` is intentionally unset, (2) `notification_events.actor_user_id uuid` receiving `agent_id` text.
- Client logging now records to Predator and no-ops Apps Script when `ALLOW_LEGACY_APPS_SCRIPT` is false. Proxy returns 200 skip for `logClientError` instead of 500.
- Durable grants: `20260816120000_agent_visit_authenticated_grants.sql` (authenticated only; no anon writes).

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `node scripts/verify-runtime-import-safety.mjs`
- `npm run build`

---

## 2026-08-16 — Agent Visit runtime: displayResponseLabel import

### Change

- QA blocker: `ReferenceError: displayResponseLabel is not defined` after Products & Purchasing Continue / Proof & Save. Helper already existed in `src/utils/agentVisitDisplay.js`; `AgentVisitPage.jsx` used it without importing. Same gap for `enrichVisitForDisplay`.
- Verification: `verify-agent-visit-product-intelligence.mjs` now fails if those imports are missing or if unbound helper calls appear in the wizard files.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `npm run build`

---

## 2026-08-15 — Lab product intelligence (Agent Visit market discovery)

### Change

- Founder-approved Year-1 **small extension** of Agent Visit + Qualification. **No CRM, no new HQ module.**
- New child table `lab_product_intelligence`: many incumbent product lines per lab (category, brand, qty, supplier, pain; optional SKU/price/frequency/switch/sample).
- Agent Visit wizard step 3 renamed **Products & Purchasing** (replaces unused Stock Feedback UI). Stock fields `stockAvailable` / `needsNewStock` were never persisted and were not consumed by certified Orders/Inventory/Collections workflows.
- Visit follow-up persistence: `agent_visits.next_follow_up_type`, `agent_visits.next_action` (audit fix).
- Qualification remains **1:1 lab-level** (`lab_qualifications`). Product mix does **not** live there.
- Generic visit `samplesGiven` count is **not** the sample model; sample requested/issued is optional on a product line.

### Verification

- `node scripts/verify-agent-visit-product-intelligence.mjs`
- `node scripts/verify-agent-rc1-closure.mjs`
- `npm run build`

---

## 2026-07-12 — v1.0 Production Deployment pack (docs)

### Change

- Deployment preparation only — no application, schema, API, RLS, or UI changes.
- Pack: `docs/operations/V1_Production_Deployment.md` (source control, build, DB tracks, env, auth/storage/monitoring, deploy order, smoke test, rollback).
- Build verified PASS this session; production cutover **NO-GO** until env/DR/tags/smoke blockers closed. Prep stance: **CONDITIONAL GO**.

---

## 2026-07-12 — v1.0 Operational Freeze (docs)

### Change

- **Feature freeze declared** — Year-1 development complete; allowed changes: bugs, security, compliance only.
- Pack: `docs/operations/V1_Operational_Freeze.md` — freeze checklist, bug list (P0–P3), security/performance/deployment checklists.
- No application feature, schema, API, or UX changes.
- Verdict: **CONDITIONAL GO** for supervised pilot; **NO-GO** unrestricted GA until P0 ops gates closed.

---

## 2026-07-12 — v1.0 Operational Readiness Execution (docs / ops)

### Change

- **No application features** — packaged Priority 1–3 operational readiness execution from Production Readiness Audit.
- Artifacts: `docs/operations/V1_Operational_Readiness_Execution.md`, `V1_First_Customer_Operational_Gate.md`, `V1_Critical_Workflow_Recovery_SOP.md`, `scripts/verify-operational-readiness-pack.mjs`.
- Maps auth, RLS, monitoring, logging, storage, invoice PDF, env, backup/restore, migrations, and critical workflow recovery to existing runbooks; identifies operator gaps (DR-01, prod checklists) vs by-design limits (fulfill non-atomic, CERT-004 receive).
- Does **not** invent Supplier Master, dashboards, CRM, Distributor OS, or transactional email.

### Verification

- `node scripts/verify-operational-readiness-pack.mjs`
- `node scripts/verify-rc1-production-readiness.mjs` (expected CONDITIONAL / known MON WARNs)

---

## 2026-07-12 — Purchase Certification Closure

### Change

- **Docs / verification packaging only** — PUR-CERT-005 evidence pack (index, checklist, sign-off, consolidated browser UAT, parity, pre-impl) and PUR-CERT-012 Closure verify script.
- Sprint 1A–1C application behavior unchanged. No schema, API, RPC, PURCHASE_IN, ledger, reorder, permission, or RLS changes.
- Founder Gold boundary documented: Workspace · Queue · Receive · Forecast Drafts · Pending Receipts · History · Context · Trust · Navigation. Does **not** certify Supplier Master, Approvals, explainability cards, engineering decomposition, or future procurement.
- Known exclusion: `verify-procurement-inventory-flow.mjs` `@/` Node import — pre-existing; not a Purchase UX failure; not fixed.
- Gold recommendation: **CONDITIONAL GO** pending signed browser UAT. After Gold approval: freeze except bugs/security/compliance; do not begin Supplier certification.

### Verification

- `node scripts/verify-purchase-certification-closure.mjs`
- `node scripts/verify-purchase-action-feedback.mjs`
- `node scripts/verify-purchase-navigation-context.mjs`
- `node scripts/verify-purchase-workspace-simplification.mjs`
- `node scripts/verify-rc1-procurement-lifecycle.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-12 — Purchase workspace simplification (Sprint 1C)

### Change

- **UI/UX only** — Purchase operational-first page budget (primary question: What purchasing work should I do now?); single queue hierarchy (Critical Reorders → Forecast Drafts → Pending Receipts → Purchase History); collapsed KPIs/advanced details; Suppliers honesty surface; selected-PO expected action copy.
- Sprint 1A mutation feedback and Sprint 1B Start Here / strip / return context unchanged.
- No schema, API, RPC, PURCHASE_IN, ledger, ORDER_OUT, reorder engine, permission, or RLS changes.
- Closes **PUR-CERT-007**, **PUR-CERT-009**. Silver (Operational Workspace) **Met**. Does not begin Certification Closure.
- Documented known blocker: `verify-procurement-inventory-flow.mjs` fails under plain Node due to `@/` imports (not fixed in this sprint).

### Verification

- `node scripts/verify-purchase-workspace-simplification.mjs`
- `node scripts/verify-purchase-navigation-context.mjs`
- `node scripts/verify-purchase-action-feedback.mjs`
- `node scripts/verify-rc1-procurement-lifecycle.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-12 — Purchase context & workflow continuity (Sprint 1B)

### Change

- **UI/UX only** — Purchase action-oriented Start Here (existing pending/critical/blocked counts), context strip, History selection + outside-filter recovery, `primecare_purchase_return_context` with Back to Purchase on Inventory/Orders, differentiated empty states, KPI summary moved below operational work.
- Sprint 1A mutation feedback unchanged.
- No schema, API, RPC, PURCHASE_IN, ledger, ORDER_OUT, reorder engine, permission, or RLS changes.
- Closes **PUR-CERT-002**, **PUR-CERT-004**; **PUR-CERT-013** partial. Does not begin Sprint 1C.
- Documented known blocker: `verify-procurement-inventory-flow.mjs` fails under plain Node due to `@/` imports (not fixed in this sprint).

### Verification

- `node scripts/verify-purchase-navigation-context.mjs`
- `node scripts/verify-purchase-action-feedback.mjs`
- `node scripts/verify-rc1-procurement-lifecycle.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-12 — Purchase action feedback (Sprint 1A)

### Change

- **UI/UX only** — Purchase Create / Edit / Cancel / Bulk Critical drafts / Receive / Freeze use certified Action Pattern (`mapPurchaseMutationError`, `ActionErrorSummary`, busy labels, inflight guards, success toast, silent refresh).
- Receive mutation mapper ownership moved from Inventory helper to Purchase (`mapPurchaseMutationError`).
- No schema, API, RPC, PURCHASE_IN, ledger, ORDER_OUT, reorder engine, receiving eligibility, finance, permission, or RLS changes.
- Closes **PUR-CERT-003** (Trust). Does not begin Sprint 1B.

### Verification

- `node scripts/verify-purchase-action-feedback.mjs`
- `node scripts/verify-procurement-inventory-flow.mjs`
- `node scripts/verify-rc1-procurement-lifecycle.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `node scripts/verify-inventory-action-feedback.mjs`
- `npm run build`

---

## 2026-07-12 — Purchase Architecture Review Finalization

### Change

- Founder-finalized Purchase / Reorder module UX certification baseline: `docs/QA/modules/purchase/Architecture_Review_Certification_Baseline.md`.
- **PUR-CERT-001** reframed: operational complexity of combining Replenishment + Receiving + Purchase Administration — **not** engineering structure; file decomposition **RC2**; **not a Sprint 1 blocker**.
- **PUR-CERT-015** added: Explainability — recommendations without WHY; future cards (Current Stock · Min · Forecast · Supplier · Rule · Reason · Trust High/Med/Low; no percentages); **not Sprint 1; not Gold blocker**.
- Sprint 1B must use **action-oriented** Start Here (Create Purchase Orders · Receive Pending Deliveries · Review Critical Reorders · Investigate Blocked Purchase Orders) — no stats-only cards.
- Standard taxonomy enforced on all PUR-CERT defects; tiers clarified: Bronze = Domain Integrity · Silver = Operational Workspace · Gold = Certified UX + Verification + Signed Browser UAT.
- Blueprint: [11_Inventory_Rules.md](./11_Inventory_Rules.md) Purchase cert roadmap; [16_Certification_Framework.md](./16_Certification_Framework.md) methodology + Purchase baseline index.
- **No** schema, API, RPC, PO write, PURCHASE_IN, ledger, reorder engine, receiving rule, finance, permission, or RLS changes.

### Gate

Documentation only. Sprint 1A (UX-only) **ALLOWED**. Application code remains blocked until Sprint 1A kickoff.

### Verification

Domain integrity (unchanged): `verify-procurement-inventory-flow.mjs`, `verify-rc1-procurement-lifecycle.mjs`. UX verify scripts deferred to sprints.

---

## 2026-07-12 — Inventory Certification Closure

### Change

- **INV-CERT-005** — Consolidated certification evidence pack under `docs/QA/modules/inventory/Certification_*`.
- **INV-CERT-007** — Ledger display: non-opening `IN` → Historical Inventory Movement (no Adjust workflow).
- **INV-CERT-001** — Purchase visual grouping (Replenishment / Receiving / Purchase administration); dedicated Purchase certification deferred.
- No schema, API, RPC, ledger write, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, permission, or RLS changes.
- Sprint 1A–1C semantics unchanged.

### Gold recommendation

**CONDITIONAL GO** until signed Closure Manual UAT. After sign-off: Inventory Gold; freeze except bug fixes and security updates. Do not begin Purchase certification.

### Verification

- `node scripts/verify-inventory-certification-closure.mjs`
- `node scripts/verify-inventory-action-feedback.mjs`
- `node scripts/verify-inventory-navigation-context.mjs`
- `node scripts/verify-inventory-workspace-simplification.mjs`
- `node scripts/verify-inventory-admin-flow.mjs`
- `node scripts/verify-inventory-ledger-integrity.mjs`
- `node scripts/verify-order-inventory-sync.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-12 — Inventory workspace simplification (Sprint 1C)

### Change

- **UI/UX only** — operational-first Stock hub page budget; selected SKU expected action; SKU details/audit collapsed; valuation/KPI summary moved below fold in a single collapsible section.
- Single workspace marker `data-inventory-workspace="hq"` — no module split.
- No schema, API, RPC, ledger, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, permission, or RLS changes.
- Sprint 1A mutation feedback and Sprint 1B return-context behavior unchanged.

### Verification

- `node scripts/verify-inventory-workspace-simplification.mjs`
- `node scripts/verify-inventory-navigation-context.mjs`
- `node scripts/verify-inventory-action-feedback.mjs`
- `node scripts/verify-inventory-admin-flow.mjs`
- `node scripts/verify-inventory-ledger-integrity.mjs`
- `node scripts/verify-order-inventory-sync.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-11 — Inventory context & workflow continuity (Sprint 1B)

### Change

- **UI/UX only** — Stock hub Start Here (existing `stockHealth` counts), Inventory context strip, SKU selection + outside-filter recovery, differentiated empty states, `primecare_inventory_return_context` with Back to Inventory on Purchase / Master Catalog / Orders.
- Valuation/KPI summary collapsed to secondary details (not removed).
- No schema, API, RPC, ledger, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, permission, or RLS changes.
- Sprint 1A mutation feedback unchanged.

### Verification

- `node scripts/verify-inventory-navigation-context.mjs`
- `node scripts/verify-inventory-action-feedback.mjs`
- `node scripts/verify-inventory-admin-flow.mjs`
- `node scripts/verify-inventory-ledger-integrity.mjs`
- `node scripts/verify-order-inventory-sync.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-11 — Inventory action feedback (Sprint 1A)

### Change

- **UI/UX only** — Master Catalog create/edit/enable/disable and Purchase Receive use certified Action Pattern (`mapInventoryMutationError`, `ActionErrorSummary`, busy labels, duplicate-submit guards, success toast, silent refresh).
- Modal/form stays open on failure with values preserved; closes / clears only on success.
- No schema, API, RPC, ledger, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, permission, or RLS changes.

### Verification

- `node scripts/verify-inventory-action-feedback.mjs`
- `node scripts/verify-inventory-admin-flow.mjs`
- `node scripts/verify-inventory-ledger-integrity.mjs`
- `node scripts/verify-order-inventory-sync.mjs`
- `node scripts/verify-no-finance-mutation.mjs`
- `npm run build`

---

## 2026-07-11 — Inventory module UX certification baseline (Founder-finalized)

### Change

- **Architecture documentation only** — no schema, API, RPC, ledger, ORDER_OUT, PURCHASE_IN, opening stock, reorder engine, permissions, or RLS changes.
- Baseline: `docs/QA/modules/inventory/Architecture_Review_Certification_Baseline.md`
- [11_Inventory_Rules.md](./11_Inventory_Rules.md) — module UX certification status, logical workspaces, Sprint 1A–1C / Closure / Future / RC2 roadmap.
- [16_Certification_Framework.md](./16_Certification_Framework.md) — reusable module UX methodology; **standard certification taxonomy** (Architecture, Discoverability, Context, Explainability, Trust, Page Budget, Functional Parity, Verification, Manual UAT); Bronze = Domain Integrity · Silver = Operational Workspace · Gold = Certified UX + Verification + Signed Manual UAT.
- Founder decisions incorporated: INV-CERT-001 = Purchase ops cognitive load (not LOC); INV-CERT-012 = recommendation explainability (future, not Sprint 1); Sprint 1B = **action-oriented** Start Here.

### Not changed

- Application code, inventory ledger semantics, stock calculations, procurement receive, fulfillment deduction, freeze policy, role matrix.

### Verification

- Documentation gate only. Domain verifies remain: `verify-inventory-reconciliation.mjs`, `verify-procurement-inventory-flow.mjs`, `verify-inventory-dashboard-kpi.mjs`.

---

## 2026-07-11 — HQ Orders workspace simplification (Sprint 1C)

### Change

- **Operational-first page budget** — header primary question; Start Here before portfolio KPIs.
- **Collapsed secondary** — Order portfolio summary, order metadata, activity/notes.
- **Detail hierarchy** — expected action + Status Actions elevated; empty-detail mini KPI grid removed.
- **No module split** — single HQ Orders workspace (`data-orders-workspace="hq"`).

### Not changed

- Schema, APIs, RPCs, lifecycle, inventory, finance, permissions, RLS, queue calculations, routing.
- Sprint 1A mutation feedback; Sprint 1B context strip / return path.

### Verification

- `node scripts/verify-orders-workspace-simplification.mjs`
- `node scripts/verify-orders-navigation-context.mjs`
- `node scripts/verify-orders-action-feedback.mjs`
- `node scripts/verify-orders-admin-flow.mjs`
- `node scripts/verify-order-payment-sync.mjs`
- `node scripts/verify-transaction-integrity-rpcs.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — HQ Orders context & workflow continuity (Sprint 1B)

### Change

- **Start Here** on existing Awaiting fulfillment queue + Review Next Order CTA.
- **OrdersContextStrip** — queue / order / lab / search / freeze orientation.
- **Selected-order clarity** — visual + `aria-selected`; outside-filter recovery without silent auto-clear.
- **Return context** — `primecare_orders_return_context`; Back to Orders on Collections / Labs / Logistics.
- **Differentiated empty states** with recovery actions.

### Not changed

- Schema, APIs, RPCs, lifecycle, inventory, ORDER_OUT, AR, invoice/shipment, pricing, taxes, permissions, RLS.
- Sprint 1A Status Actions mutation semantics.
- Lab Ordering, admin on-behalf checkout, routes, workspace split.

### Verification

- `node scripts/verify-orders-navigation-context.mjs`
- `node scripts/verify-orders-action-feedback.mjs`
- `node scripts/verify-orders-admin-flow.mjs`
- `node scripts/verify-order-payment-sync.mjs`
- `node scripts/verify-transaction-integrity-rpcs.mjs`
- `node scripts/verify-orders-projection-network-audit.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — HQ order action feedback (Sprint 1A)

### Change

- **Status Actions inline `ActionErrorSummary`** for Mark Processing / Fulfilled / Cancel / Reset failures on `OrdersPage`.
- **`mapOrderMutationError.js`** — business-facing messages (already fulfilled, cannot cancel, not found, inventory unavailable, permission denied, unexpected write failure).
- **Loading labels** + `aria-busy` + duplicate-submit guard; success toast; refresh affected order only (preserve selection/filters/search/scroll).

### Not changed

- Schema, APIs, RPCs, order lifecycle, inventory deduction, ORDER_OUT, AR posting, invoice/shipment generation, pricing, taxes, permissions, RLS.
- Checkout, Lab Ordering, layout, routing, workspace split.

### Verification

- `node scripts/verify-orders-action-feedback.mjs`
- `node scripts/verify-orders-admin-flow.mjs`
- `node scripts/verify-order-payment-sync.mjs`
- `node scripts/verify-transaction-integrity-rpcs.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Collections certification closure (COL-CERT-011 / 003 / 004)

### Change

- **COL-CERT-011:** High-Risk Interventions “Start here” queue at top of Credit & Risk; Record Payment primary CTA.
- **COL-CERT-003:** `CollectionsContextStrip` for workspace / filter / selected lab orientation.
- **COL-CERT-004:** Agent Visits/Labs return path to Collections with Back to Collections CTA.

### Not changed

- Business rules, finance, APIs, schema, RLS, routing, allocation.
- God-page orchestrator, RC2 polish items.

### Verification

- `node scripts/verify-collections-certification-closure.mjs`
- `node scripts/verify-credit-risk-admin-flow.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Collections workspace separation (Sprint 1C)

### Change

- **Dedicated workspace shells** per persona — agent, HQ credit & risk, HQ receivables, lab account.
- **`collectionsViewMode.js`** — `resolveCollectionsWorkspace`, primary-question metadata.
- **`CollectionsWorkspaceShell`** + **`CollectionsSearchBar`** — visual boundaries and shared search chrome.
- **Section labels** — summary / find / act areas with `aria-label` and `data-workspace`.

### Not changed

- APIs, schema, RLS, RPCs, payment allocation, AR calculations, business rules, routing.
- Data loading, mutations, ownership filter, route ordering.

### Verification

- `node scripts/verify-collections-workspace-separation.mjs`
- `node scripts/verify-credit-risk-admin-flow.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Agent collections interaction feedback (Sprint 1B)

### Change

- **Selected lab highlight** — queue card ring + context strip when payment drawer open.
- **Debounced search (300ms)** — agent work queue filter; search-aware empty states.
- **Queue refresh feedback** — success toast, list skeleton overlay, drawer re-hydrate on refresh.
- **Session persistence** — agent search + selected lab in `sessionStorage`.
- **Evidence upload UX** — field `uploadStatus`, progress %, drawer stays open on proof failure after payment.
- **Duplicate submission guard** — in-flight ref on `handleSaveCollection`.

### Not changed

- Payment write APIs, allocation, AR calculations, RPCs, schema, RLS.
- Navigation architecture, HQ Command Center, routing, distributor embed.
- Ownership filtering, route ordering, Daily OS prioritization.

### Verification

- `node scripts/verify-agent-collections-interaction-feedback.mjs`
- `node scripts/verify-agent-collections-ownership-filter.mjs`
- `node scripts/verify-credit-risk-admin-flow.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Collections payment action feedback (Sprint 1A)

### Change

- **Drawer-local `ActionErrorSummary`** for payment / follow-up mutation failures on `CollectionsPage`.
- **`mapCollectionMutationError.js`** — business-facing error mapping for known collection write failures.
- **Context-aware loading labels** — `Recording payment…`, `Saving follow-up…`, `Uploading proof…`.
- **Success/failure lifecycle** — agent / Credit & Risk payment drawer closes only on successful save; entered values preserved on failure.

### Not changed

- Navigation, Command Center, Agent Queue, workspace split, routing.
- APIs (`createPaymentWrite`, `updateCollectionNotesWrite`), RPCs, payment allocation, AR calculations.
- Schema, RLS, permissions.

### Verification

- `node scripts/verify-collections-payment-action-feedback.mjs`
- `node scripts/verify-credit-risk-admin-flow.mjs`
- `node scripts/verify-agent-collections-ownership-filter.mjs`

### Blueprint

- New: `24_Collections_Credit_Risk.md`

---

## 2026-07-11 — People Operations navigation & context (Sprint 1D)

### Change

- **Clickable breadcrumbs** with route metadata — ancestors navigate via `navigatePeopleOps`.
- **Reporting period/run** persisted in `sessionStorage`; restored on refresh.
- **Context strip** (`Viewing:`) on module frames — period, run, employee, plan filter.
- **Stronger active states** on module nav and selected payroll period row.
- **Workspace breadcrumb** unified: People Operations > Employees > Directory > {name}.
- **Payroll preview empty state** mentions selected period when available.

### Not changed

- Assignment workflow (1A), payroll workflow (1B), directory interaction (1C).
- Budgeting, Collections, Distributor OS business logic.
- Schema, APIs, RLS, permissions, calculations.

### Verification

- `node scripts/verify-people-operations-navigation-context.mjs`
- `node scripts/verify-people-operations-enterprise-ux.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Employee Directory interaction feedback (Sprint 1C)

### Change

- Debounced search (300ms) with search-aware empty states.
- Stronger selected-row styling; bulk bar only when rows selected.
- Directory refresh with inline errors, scroll preservation, filter/search retention.
- Export CSV: progress label, success toast, inline failure.
- Quick View: retry on error, focus returns to originating row on close.
- Open Workspace: immediate loading state.

### Not changed

- Employee Workspace architecture, APIs, schema, RLS, permissions.
- Compensation Assignments, Payroll, Navigation, Budgeting.

### Verification

- `node scripts/verify-employee-directory-interaction-feedback.mjs`
- `node scripts/verify-people-operations-enterprise-ux.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Payroll workflow action feedback (Sprint 1B)

### Change

- **Payroll workflow** mutation errors appear inside `PayrollWorkflowToolbar` or workflow modals via `ActionErrorSummary` — not global page banner.
- **Confirm modals** replace `window.confirm` for submit, approve, lock, and export.
- Workflow/reject/paid modals **close only on `success === true`**.
- **Loading labels** on all workflow actions (generate, approve, lock, export, mark paid, reject, submit).
- Mapper: `mapPayrollWorkflowMutationError.js`.

### Not changed

- Schema, APIs (write semantics), RLS, permissions, payroll calculations, business rules.
- Compensation Assignments (Sprint 1A), Directory, Budgeting, Navigation.

### Verification

- `node scripts/verify-payroll-workflow-action-feedback.mjs`
- `node scripts/verify-payroll-rbac.mjs`
- `node scripts/verify-no-payroll-mutation.mjs`
- `node scripts/verify-no-finance-mutation.mjs`

---

## 2026-07-11 — Compensation Assignments action feedback (Sprint 1A)

### Change

- **Assign / Change plan** mutation errors appear inside `CompensationActionDrawer` via `ActionErrorSummary` — not global page banner.
- **End assignment** requires `CompensationEndAssignmentDialog` confirmation; errors appear inside dialog.
- Handlers return `{ success, error? }`; drawer/dialog close only on `success === true`.
- **Loading labels** on assign, change, and end submit buttons while async.
- Mapper: `mapCompensationAssignmentMutationError.js` — active assignment, role mismatch, not found, forbidden.

### Not changed

- Schema, APIs (write semantics), RLS, permissions, payroll/compensation calculations, business rules.
- Payroll, Directory, Budgeting, Navigation (deferred to Sprint 1B+).

### Verification

- `node scripts/verify-compensation-assignment-action-feedback.mjs`
- `node scripts/verify-compensation-plan-assignment.mjs`
- `node scripts/verify-compensation-no-finance-mutation.mjs`

---

## 2026-07-11 — Compensation Plans action feedback and page simplification

### Change

- **Compensation Plans** operational page simplified — answers "Are plans ready, and which plan needs management?"
- **Create Plan** moved to `CompensationPlanActionDrawer` (no inline wizard on page).
- **Mutation errors** appear inside drawer/details via `ActionErrorSummary` — not global page banner.
- **False-success fix** — handlers return `{ success, error? }`; drawer closes only on `success === true`.
- **Duplicate constraint mapping** — `compensation_plans_code_version_key` mapped to business copy with Open Existing Plan / Change Version recovery.
- **Page budget** — one readiness card, search/filter, one table; removed executive summary stack, duplicate KPIs, payroll workflow strip from Plans screen.
- Platform rule documented: **"The result of an action must appear where the action occurred."**

### Not changed

- Schema, Supabase constraints, APIs (write semantics), RLS, permissions, payroll/compensation calculations, business rules.

### Verification

- `node scripts/verify-compensation-plan-action-feedback.mjs`
- `node scripts/verify-compensation-ui-actions.mjs`
- `node scripts/verify-compensation-plan-management.mjs`

---

## 2026-07-11 — Employee Workspace (canonical Employee 360)

### Change

- **Employee Workspace** is the canonical full-page employee experience (`employees/workspace`).
- **Employee Quick View** is the compact Today-only drawer (directory overflow).
- Today tab page budget: max 1 NBA, 5 tasks, 1 Operational Status, 1 Snapshot, 1 Relationship Summary.
- **Operational Status** vocabulary: Ready / Needs Attention / Blocked (no numeric health score).
- Timeline + Activity merged into **History** tab (milestone vs activity icons).
- HR tabs (Documents, Assets, Leave) gated by `PEOPLE_OPS_HR_MODULE_ENABLED = false`.
- Quick Actions route to owner modules (`CompensationActionDrawer`, Payroll, Ownership, Operations Center).
- `EmployeeCompensation360Panel` deprecated in favor of `Employee360Workspace` (file retained for verify scripts).

### Not changed

- Schema, Supabase, APIs, RLS, permissions, payroll/compensation calculations, write paths, business rules.

### Verification

- `node scripts/verify-employee360-workspace.mjs`
- `node scripts/verify-employee360-business-profile.mjs`
- `node scripts/verify-people-operations-enterprise-ux.mjs`
- `node scripts/verify-compensation-ui-actions.mjs`

### Known gap

- Employee Workspace route is in-page state only — browser refresh does not restore workspace/selection.

---

## 2026-07-09 — RC6 Founder Dashboard Business Language & Actionability

### Change

- **Current Payroll Cycle** replaces Workflow: status + business explanation + primary CTA for Draft → Paid.
- **Business Activity Today** maps internal events to founder titles (no snake_case event names).
- **What needs my attention today?** day board: Needs Attention / In Progress / Completed.
- Data-quality warnings tightened (missing plans, missing lab owners, empty payroll run) with CTAs.
- Section help (`?`) on payroll cycle, day board, and activity; Context → Current Reporting Period; Work Inbox → Requires Your Attention.
- Language audit on People Ops UI surfaces (orphan/preview lines/derive/projection/snapshot avoided in user copy).

### Not changed

- Schema, Supabase, APIs, read models, payroll/compensation/collections calculations, write paths, RLS.

### Verification

- `node scripts/verify-rc6-founder-language.mjs`
- `node scripts/audit-rc6-founder-certification.mjs`

---

## 2026-07-09 — RC5 Founder UX & Business Language Transformation (People Operations)

### Change

- Replaced technical data-quality warnings with **Problem → Reason → Action** business blockers (Payroll Blocker, Commission Blocker, Generate Payroll Preview).
- Employee 360: identity/business summary card; renamed sections to Business Ownership, Current Pay Structure, Payroll History, Performance; helper copy for commission labs.
- Compensation: post-create “Assign Employees →” next step; executive widgets (Most Used Plan, Highest Commission %, Promotion Eligible, Inactive Plans, Plans without Employees).
- Business Ownership: organisation explainer, commission path labels on lab drawer, coverage CTAs.
- Payroll Preview: expandable pay breakdown + “How was this calculated?”; business empty state with reasons and CTAs.
- Reports: Business Summary KPIs first (best agent, needs attention, territories, payroll, collections, promotion candidates).
- Page help popovers (“What does this page do?”), dismissible guided onboarding, business empty states and terminology.

### Not changed

- Schema, Supabase, APIs, read models, business logic, payroll/finance/collections calculations, workflows, RLS, write paths.

### Verification

- `node scripts/verify-rc5-business-language.mjs`
- `node scripts/audit-rc5-founder-certification.mjs`

---

## 2026-07-08 — RC4 Enterprise Finish Pass (People Operations)

### Change

- Further dashboard compression (~15–20%); compact quick-action toolbar; operational timeline zone.
- Universal **PeopleOpsReportingContextBar** in Context widget — removed duplicate period/version/status from dashboard.
- Standardized KPI card height, typography, icon sizing, and refresh animation.
- **ReportsExecutiveSummary** before charts; charts suppressed when no meaningful data.
- **OwnershipCoveragePanel** with progress bar, completeness, and orphan indicators.
- Compensation widgets: most used plan, highest commission, pending changes, inactive plans (read-only compose).
- Payroll run review order: timeline → sticky totals → summary → tables.
- **PeopleOpsTableToolbar**: density toggle, column chooser, saved filter presets.
- Expanded UI validation warnings (inactive plans, missing budget, stale period, orphan ownership).

### Not changed

- Schema, Supabase, APIs, read models, business logic, payroll/finance/collections calculations, workflows, RLS.

### Verification

- `node scripts/audit-rc4-ui-certification.mjs`

---

## 2026-07-08 — RC3 Enterprise UX Finalization (People Operations)

### Change

- Compressed dashboard vertical spacing; executive work zones (action, activity, operations snapshot).
- Unified **Work Inbox** (approvals + notifications); **Recent Activity** replaces Favorites on dashboard.
- Compact sticky **Context Widget**; workflow progress only on Dashboard, Payroll, and Compensation.
- Dense KPI cards globally; sticky payroll totals on Run Review; compensation executive summary widgets.
- Employee directory: sticky headers, row hover, clickable rows, role-colored avatars/chips, keyboard navigation.
- Budget KPI-first layout; configured vs unconfigured envelope labels; hide empty charts.
- Business Ownership: summary KPIs before hierarchy; tree search/filter/expand controls.
- Reports meaningful empty states with primary actions; Settings active vs roadmap separation.
- UI data quality banners (`peopleOpsDataQualityModel`) and misleading-zero formatting (`formatPeopleOpsMetricValue`).

### Not changed

- Schema, Supabase, APIs, business logic, payroll/finance/collections calculations, workflows, RLS.

### Verification

- `node scripts/audit-rc3-ui-certification.mjs`

---

## 2026-07-08 — RC2 Enterprise UX Hardening

### Change

- Enterprise design tokens (`enterpriseLayout.js`) and dense typography/spacing.
- Shared RC2 components: `RoleChip`, `EnterpriseMetricStrip`, `ExecutiveCommandCenterShell`, `Lab360SectionNav`.
- Compact KPI cards, section cards, module frames, and table density.
- Executive Command Center (Admin Dashboard) and Founder Command Center layouts.
- People Ops dashboard metric strip + inline reporting toolbar.
- Employee directory avatars + role chips; Employee 360 business-first section order.
- Lab 360 tabbed drawer navigation; professional Settings landing copy.

### Not changed

- Schema, Supabase, APIs, business logic, calculations, payroll engine, finance, collections, workflows, RLS.

### Verification

- `node scripts/audit-rc2-ui-certification.mjs`

---

## 2026-07-08 — Phase 9.3 Collection Compensation & Executive Performance (Year 1–3 final business layer)

### Change

- Read-model compose layer connecting payroll preview, ownership hierarchy, collections, and intelligence.
- `collectionCompensationModel`, `hierarchicalCompensationModel`, `executivePerformanceModel`, `employee360BusinessProfileModel`, `labPerformanceContributionModel`, `founderPerformanceCardsEngine`.
- Collection Compensation Dashboard on People Ops payroll run-review.
- Hierarchical compensation panel on Business Ownership.
- Executive performance KPIs + rankings on Reports.
- Employee 360 business profile (read-only).
- Lab performance contribution in Commercial Lab 360 and Lab Ownership 360.
- Founder OS performance decision cards (rule-based).
- Business ownership role rollups (executive / admin / agent / lab).

### Not changed

- Schema, migrations, RLS, payroll engine, commission engine, finance mutation paths, collections workflow, commercial SoT.

### Verification

- `node scripts/audit-phase-9-3-certification.mjs`

---

## 2026-07-08 — Phase 9.2 Founder Operating System & Decision Engine

### Change

- Blueprint `23_Founder_Operating_System.md`.
- Founder OS page (`founderOperatingSystem`) — compose workspace over ops, commercial, compensation reads.
- Rule-based insights + top-5 priorities + decision queue + global search index.
- Executive FOUNDER sidebar section; `founderNavigation` aliases to Founder OS.

### Not changed

- Finance, payroll, compensation engines, commercial compose logic, schema, RLS, workflow engines.

### Verification

- `node scripts/audit-phase-9-2-certification.mjs`

---

## 2026-07-08 — Phase 9.1 Platform Consolidation & Production Readiness Foundation

### Change

- Blueprint `22_Platform_Consolidation.md`.
- `platformConsolidationModel.js` — workspace homes, deep-link nav keys, KPI/report ownership, financial SoT registry, tech debt registry.
- `productionReadinessModel.js` + `ProductionReadinessDashboardPage.jsx` — Architecture Readiness (not Founder OS).
- Executive/Admin sidebar: Commercial only in GROWTH; FOUNDER section removed; deep-link keys hidden globally.
- Control Tower quick link → Commercial (not Qualification Analytics).

### Not changed

- Finance, payroll, commission engines, Commercial compose logic, schema, RLS, API mutations.

### Verification

- `node scripts/audit-phase-9-1-certification.mjs`

---

## 2026-07-08 — Phase 9.0 Commercial CRM & Lab Growth Platform

### Discovery

- No Salesforce-style CRM exists. Commercial ops already live in Qualification (`lab_qualifications`), Visits (`agent_visits`), Contracts (`lab_contracts`), Labs lifecycle, Ownership (`lab_ownership`), Revenue Funnel, and Dist OS.
- Phase 9.0 is a **compose workspace** (`commercialCrm`) — read façades only. No new CRM tables.

### Change

- Blueprint `21_Commercial_CRM.md`.
- Commercial module: Dashboard, Pipeline, Labs, Activities, Contracts, Forecast, Reports.
- Derivations in `commercialWorkspaceModel.js`; reads via existing qualification / contracts / visits APIs.

### Not changed

- Orders, Collections, Finance, Payroll, Inventory, RLS, People Ops engines, qualification/contract write APIs.

### Verification

- `node scripts/audit-phase-9-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.4 Business Ownership

### Discovery

- Canonical ownership SoT already exists: `lab_ownership` + `labOwnershipEngine` + Operations Center writes.
- Phase 8.4 reuses that model as a People Ops **read façade** — does not invent a second ownership system.
- Legacy `labs.assigned_agent_id` remains sync fallback only.

### Change

- New **Business Ownership** module: Explorer, Territories, Dashboard, Timeline.
- Derivations in `businessOwnershipModel.js` — reuses `labOwnershipEngine`, `getLabOwnershipRead`, compensation read bundle.
- Lab Ownership drawer, Employee 360 ownership section, Future Hierarchical Compensation preview (placeholders only).
- Parallel read `loadPeopleOpsOwnershipRead` — ACTIVE + INACTIVE `lab_ownership` rows; no schema migration.

### Not changed

- Payroll/compensation engines, workflow, reporting context math, finance tables, commission calculations, RLS, exports, budgeting calculations, Operations Center ownership writes.

### Verification gates

- `node scripts/audit-phase-8-4-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.3 Workforce Planning & Budgeting

### Change

- New **Budgeting** module: Budget Overview, Headcount Planning, Department Budget, Scenario Planning, Budget History.
- Planning derivations in `workforceBudgetingModel.js` — reuses `executiveCompensationModel`, `reportingContext`, `forecastMetrics`, employee directory.
- Session-only headcount positions and scenario history (`sessionStorage`) — no persistence, no mutations.
- Approved budget = derived planning envelope from reporting-context payroll (25% headroom); not Finance P&L.

### Not changed

- Payroll/compensation engines, workflow, APIs, schema, RLS, finance tables, exports.

### Verification gates

- `node scripts/audit-phase-8-3-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.2 Enterprise UX Hardening

### Change

- Employees: enterprise directory table with KPI strip, filters, bulk actions; Employee 360 in slide-over drawer.
- Compensation: executive summary cards, overflow action menus, improved status badges.
- Payroll: summary strip + workflow progress on run review; Open Preview primary CTA.
- Dashboard: reporting-context KPI cards, actionable pending tasks, no analytical duplication.
- Settings: intentional configuration landing (Phase 8.6 placeholders).
- Navigation: breadcrumbs, sticky module nav, standardized table chrome.
- QA: `seed-qa-people-ops-display-names.mjs` for realistic demo personas.

### Not changed

- Payroll/compensation engines, APIs, schema, RLS, workflow rules, finance boundaries.

### Verification gates

- `node scripts/audit-phase-8-2-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.1B Executive Productivity

### Change

- Executive workspace: Quick Actions, Approval Inbox, Notifications Center, Recent Activity, Recently Viewed, Favorites.
- Global search (⌘K / Ctrl+K) across loaded People Operations data — employees, plans, assignments, payroll, exports, reports.
- Context panel with reporting context, workflow progress visualization, and current selection.
- Productivity derivations in `peopleOpsProductivityModel.js`; session state via `sessionStorage`.
- Quick actions reuse `buildPayrollWorkflowActions` — no duplicate workflow logic.

### Not changed

- Payroll/compensation engines, APIs, schema, RLS, reporting context calculations, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-productivity.mjs`
- `node scripts/audit-phase-8-1b-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.1A UI/UX Unification

### Change

- Introduce shared People Operations UX primitives: `PeopleOpsModuleFrame`, `PeopleOpsSectionCard`, `PeopleOpsFilterBar`, `PeopleOpsDashboard`, `PeopleOpsReportsPanel`, `peopleOpsStatusTokens`.
- Operational dashboard: payroll status, pending actions, current payroll, employees, notifications, current period — **no trend charts**.
- Analytical content moved to **Reports** (trends + intelligence panel).
- Standardize errors (`DataFetchError` + retry), freshness (`DataFreshnessLabel`), success feedback (`usePortalToast`).
- Fix `ReadHealthBanner` prop (`health` not `readHealth`).
- Module state preservation: employee search/filters/360 selection retained when switching modules.
- Meaningful empty states across payroll, exports, directory.
- Navigation polish: design tokens, ARIA tablist on module nav.

### Not changed

- Payroll/commission calculations, reporting context, APIs, workflow logic, schema, RLS, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-ux.mjs`
- `node scripts/audit-phase-8-1a-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.0 / 8.1 Shell

### Change

- Add canonical product document `20_People_Operations.md` — Executive Compensation evolves into **People Operations** (module hierarchy, reuse matrix, vertical slices 8.1–8.6).
- Phase **8.1** delivers module navigation shell: Dashboard, Employees, Compensation, Payroll, Reports, Settings.
- Replace flat nine-tab UI with `PeopleOperationsModuleNav` + `peopleOpsNavigation.js`.
- Rename page export to `PeopleOperationsPage`; preserve `ExecutiveCompensationCenterPage` alias and `compensationPayroll` route key.
- Menu label: **People Operations** (`enterpriseCopy.compensationPayroll`).
- Move `ExecutiveCompensationIntelligencePanel` from Dashboard to **Reports → Analytics**.
- Settings → Configuration placeholder (no new backend).

### Not changed

- Payroll engine, compensation engine, reporting context, Employee 360, workflow, plan/assignment APIs, analytics helpers, export/audit APIs, schema, RLS, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-shell.mjs`
- `node scripts/audit-phase-8-1-certification.mjs`
- Existing compensation/payroll regression scripts

---

## 2026-07-08 — Executive Compensation Phase 7.2 Analytics Context

### Change

- Introduce canonical **Executive Reporting Context** (`periodId` + `payrollRunId`) for all executive compensation analytics.
- Refactor read-model analytics into focused helpers under `src/compensation/analytics/`; `executiveCompensationModel.js` remains the façade.
- Overview KPIs, intelligence ratios/rankings/territory/forecast baseline derive from **one selected payroll run** only.
- Add Payroll % Cash Collected and Payroll % Revenue Generated (same period window).
- Exclude Probe/smoke/automation/QA fixture identities from executive analytics.
- Profile-primary employee metrics (`profile_user_id`); trend charts use latest run per historical period only.
- Reporting Context card in Executive Compensation Center UI.

### Not changed

- Finance, AR, payments, orders, invoices, payroll approval/export/paid workflow, plan administration, assignments, RLS, schema migrations.

### Verification gates

- `node scripts/verify-executive-reporting-context.mjs`
- `node scripts/verify-compensation-ratios.mjs`
- `node scripts/verify-compensation-rankings.mjs`
- `node scripts/verify-compensation-forecast.mjs`
- `node scripts/verify-compensation-territories.mjs`
- `node scripts/audit-phase-7-2-certification.mjs`
- Existing compensation regression scripts

---

## 2026-07-07 — Enterprise Compensation Phase 7.1

### Change

- Refactor compensation domain from agent-centric to **profile-primary enterprise employee compensation**.
- Migration `20260707140000_enterprise_compensation_phase_7_1.sql`: `profile_user_id` required on assignments; `agent_id` optional except agent role; role-aware `compensation_plans.role_scope` check; HQ employee profile roles extended.
- Add role scopes: agent, admin, executive, hr, warehouse, delivery, operations, support, future.
- New Plan wizard with role defaults; Activate Plan; Assign Employee APIs and UI.
- Employee Directory + Employee Compensation 360 replace Agent-only directory (Agent 360 preserved via compatibility aliases).
- Payroll preview includes all active assigned employees; commission remains cash-only and agent-role only.

### Not changed

- Finance, AR, payments, orders, invoices, payroll approval workflow, export, GL, bank, accounting.

### Verification gates

- `node scripts/verify-enterprise-compensation-roles.mjs`
- `node scripts/verify-employee-directory.mjs`
- `node scripts/verify-role-based-payroll-preview.mjs`
- `node scripts/verify-agent-commission-isolation.mjs`
- `node scripts/verify-role-plan-validation.mjs`
- `node scripts/verify-compensation-ui-actions.mjs`
- All existing compensation verify scripts

---

## 2026-07-04 — Executive Compensation Phase 6A.1 Certification Cleanup

### Change

- Refresh stale `verify-payroll-preview.mjs` checks for Executive Compensation UI and split preview vs workflow audit ownership.
- Allow preview regeneration when a paid period has an active reopened draft run (`assertPayrollPeriodDraftForPreview` + draft-run line artifact replacement).
- Skip invalid paid-period status churn during reopened run workflow (`shouldSyncPeriodStatus` in payroll domain API).
- Add QA-only compensation seed script (`seed-qa-compensation-data.mjs --apply`) and Phase 6A.1 certification audit script.

### Not changed

- No finance, AR, payments, orders, invoice, allocation, inventory, logistics, GL, bank, or accounting mutation paths.

### Verification gates

- `node scripts/verify-payroll-preview.mjs`
- `node scripts/verify-payroll-period-generation.mjs`
- `node scripts/verify-payroll-preview-idempotency.mjs`
- `node scripts/seed-qa-compensation-data.mjs --apply` (QA only)
- `node scripts/audit-phase-6a1-certification.mjs` (QA only)

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 6A Payroll Approval Workflow UI

### Change

- Add **Payroll Workflow** toolbar to Executive Compensation Center Payroll Periods and Payroll Preview tabs.
- Wire status-gated actions: submit, approve, reject, lock, export metadata, mark paid evidence.
- Reuse Phase 3C `payrollDomainSupabaseApi` writers; no payroll calculation or finance mutation changes.
- Add confirmation for irreversible actions; reject and paid evidence forms require reason/reference fields.
- RBAC: Executive full workflow; HR generate/submit only; Admin view-only.

### Not changed

- No bank payout, GL, accounting, finance, AR, payments, orders, invoice, allocation, inventory, or logistics mutation.
- No payroll calculation rule or compensation plan rule changes.

### Verification gates

- `node scripts/verify-payroll-approval-ui.mjs`
- `node scripts/verify-payroll-workflow-actions.mjs`
- `node scripts/verify-payroll-export-ui.mjs`
- `node scripts/verify-payroll-paid-evidence.mjs`
- `node scripts/verify-payroll-no-finance-mutation.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 5B Agent Compensation 360

### Change

- Add **Agent Compensation 360** as the single employee compensation profile from Executive Compensation → Agents.
- Add bounded read loader `loadAgentCompensation360Read` and directory loader `loadAgentCompensationDirectoryRead`.
- Add seven read-focused sections: Overview, Payroll History, Commission History, Compensation Plan (+ history), Adjustments (read-only), Promotion (review-only), Audit Timeline.
- Reuse Phase 5A `changeEmployeePlanAssignment` for plan changes from 360; no new payroll or finance mutation paths.
- Extend RBAC: Executive full view + plan change; HR view + assign plan; Admin view-only; Agent own-profile contract (future); Lab/Distributor blocked.

### Not changed

- No payroll preview calculation, approval workflow, export, mark paid, accounting, finance, AR, payments, orders, or O2C mutation.

### Verification gates

- `node scripts/verify-agent-compensation-profile.mjs`
- `node scripts/verify-agent-payroll-history.mjs`
- `node scripts/verify-agent-commission-history.mjs`
- `node scripts/verify-agent-plan-history.mjs`
- `node scripts/verify-agent-compensation-security.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 5A Compensation Administration

### Change

- Add **Compensation Plans** and **Plan Assignments** permanent tabs to Executive Compensation Center.
- Add compensation plan administration APIs for create, draft edit, active version create, duplicate, deactivate, assignment change/end.
- Add plan details panel with fixed/variable/promotion/bonus/incentive/audit sections.
- Add read-only compensation simulator and promotion eligibility review panel (no automatic promotion).
- Extend page access to Executive (full CRUD), HR (read + assign), Admin (read-only). Agent remains own-plan read contract only.
- Enforce active-plan versioning: edits create a new plan version; retired versions preserve assignment history.

### Not changed

- No payroll preview calculation changes, approval workflow, export, paid evidence, finance, AR, payments, orders, or O2C mutation.

### Verification gates

- `node scripts/verify-compensation-plan-management.mjs`
- `node scripts/verify-compensation-plan-versioning.mjs`
- `node scripts/verify-compensation-plan-assignment.mjs`
- `node scripts/verify-compensation-simulator.mjs`
- `node scripts/verify-compensation-role-security.mjs`

---

## 2026-07-04 — Executive Compensation UI hotfix (export read columns)

### Change

- Add `generatePayrollPreview()` with draft-only payroll run, line, and commission entry persistence from cash-collected inputs.
- Add idempotent regeneration: existing draft preview for a period is cleared and rebuilt without duplicate lines or commission entries.
- Add preview generation audit evidence: generated_by/at, period, plan versions, rule version, source payment hash, calculation version.
- Add Executive UI **Generate Payroll Preview** action for draft payroll periods in the Executive Compensation Center.
- Bump compensation rule version to `PC_COMP_YEAR1_2026_PHASE4B`.

### Not changed

- No approval, lock, export, mark paid, finance/O2C mutation, or period status advancement beyond draft preview artifacts.

### Verification gates

- `node scripts/verify-payroll-preview-generation.mjs`
- `node scripts/verify-payroll-preview-idempotency.mjs`
- `node scripts/verify-payroll-calculation-rules.mjs`
- `node scripts/verify-payroll-plan-resolution.mjs`
- `node scripts/verify-payroll-period-generation.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 4A Executive Compensation Center (Read-Only UI)

### Change

- Add Executive-only read-only Executive Compensation Center UI with dashboard KPIs, payroll periods table, payroll preview grid, agent compensation detail, compensation history timeline, and trend charts.
- Restrict `compensationPayroll` navigation and page permission to `executive` only for Phase 4A.
- Add read-only bounded loader `loadExecutiveCompensationCenterRead` sourcing payroll/compensation tables only.
- Add Phase 4A verification scripts: `verify-compensation-dashboard.mjs`, `verify-payroll-preview-ui.mjs`, `verify-compensation-history.mjs`, `verify-compensation-role-ui.mjs`.

### Not changed

- No payroll approval, lock, export, mark paid, adjustment editing, plan editing, finance mutation, database schema, or workflow behavior.
- HR/Admin/Agent/Lab/Distributor have no Executive Compensation Center access in Phase 4A.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-dashboard.mjs`
- `node scripts/verify-payroll-preview-ui.mjs`
- `node scripts/verify-compensation-history.mjs`
- `node scripts/verify-compensation-role-ui.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-compensation-rls.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 4B gate

- GO only after Phase 4A read-only UI gates pass and review confirms no mutation hooks, finance reads beyond compensation tables, or workflow bypass.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3C Payroll Domain Completion

### Change

- Add backend/domain payroll workflow states through `paid`: `draft -> previewed -> submitted -> approved -> locked -> exported -> paid`.
- Define `paid` as payroll-domain evidence only, with no `payments`, AR, allocation, invoice, order, inventory, logistics, accounting, GL, bank, or disbursement mutation.
- Add immutable-after-lock rules: locked/exported/paid payroll runs and detail rows cannot be edited; reopen creates a new draft run version.
- Add adjustment domain rules for positive, negative, recovery, advance, and correction adjustments with Executive approval for payable impact.
- Add audit/workflow event vocabulary for preview, submit, approve, reject, lock, export, pay, reopen, and adjustment request/approval/rejection.
- Add CSV, Excel-ready, and accounting-ready export model rules with export metadata/checksum only.
- Add Phase 3C verification bundle for locking, immutability, RBAC, audit, export, lifecycle, adjustments, and versioning.

### Not changed

- No payroll UI, Executive dashboard, or agent self-view UI was built.
- No Finance, AR, Payments, Orders, Invoices, Collections, Inventory, Logistics, legacy Commission Engine calculation, Projection Engine, projection flag, or O2C business rule behavior changed.
- No accounting entries, bank payouts, GL postings, payment disbursement records, or bank files are created.
- Phase 3B calculation engine remains unchanged.

### Verification gates

- `node scripts/verify-payroll-lifecycle.mjs`
- `node scripts/verify-payroll-locking.mjs`
- `node scripts/verify-payroll-immutability.mjs`
- `node scripts/verify-payroll-rbac.mjs`
- `node scripts/verify-payroll-audit.mjs`
- `node scripts/verify-payroll-export.mjs`
- `node scripts/verify-payroll-adjustments.mjs`
- `node scripts/verify-payroll-versioning.mjs`
- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Executive UI gate

- GO only after Phase 3C backend/domain gates pass and review confirms no UI, payout, accounting, bank, or Finance/O2C mutation was introduced.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3B Preview Calculation

### Change

- Add preview-only compensation calculation engine scope: cash-only commission, Year-1 salary/allowance rules, collection efficiency, promotion eligibility, draft payroll preview totals, attribution snapshot fallback, and versioned calculation snapshots.
- Define that Phase 3B may write only draft compensation/payroll preview rows and calculation audit start/finish events.
- Add verification gates for calculation, cash-only commission, promotion eligibility, attribution snapshots, payroll preview, and plan versioning.

### Not changed

- No payroll approval, submission workflow, lock, export, payout, bank integration, accounting entry, GL posting, employee portal, dashboard, UI page, manual adjustment UI, or bonus approval workflow.
- No Finance, AR, Payments, Orders, Invoices, Collections, Inventory, Logistics, legacy Commission Engine, Projection Engine, projection flag, or O2C business rule behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-schema.mjs`
- `node scripts/verify-compensation-calculation.mjs`
- `node scripts/verify-cash-only-commission.mjs`
- `node scripts/verify-promotion-eligibility.mjs`
- `node scripts/verify-attribution-snapshots.mjs`
- `node scripts/verify-payroll-preview.mjs`
- `node scripts/verify-plan-versioning.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 3C gate

- GO only after Phase 3B verification passes and review confirms draft-only preview behavior with no approval/export/payout or O2C mutation.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3A Foundation

### Change

- Add Phase 3A compensation/payroll foundation migration for new domain tables, lifecycle constraints, indexes, RLS helpers, RLS policies, and HR role SQL constraint support.
- Implement `hr` role metadata, labels, provisioning guardrails, and placeholder navigation only.
- Add read-only foundation verification scripts: `verify-compensation-schema.mjs`, `verify-compensation-rls.mjs`, `verify-payroll-period-lifecycle.mjs`, `verify-compensation-audit.mjs`, and `verify-compensation-role-access.mjs`.
- Update Blueprint and Certification docs from planned schema to Phase 3A foundation status.

### Not changed

- No commission calculations, payroll calculations, payroll preview generation, approval workflow API, lock/export engine, payroll dashboard, payroll UI page, accounting entry, bank payout, GL posting, or disbursement record.
- No Finance, AR, Payments, Invoices, Orders, Inventory, Logistics, Collections, legacy Commission Engine calculation, Projection Engine, projection flag, or O2C business rule behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-schema.mjs`
- `node scripts/verify-compensation-rls.mjs`
- `node scripts/verify-payroll-period-lifecycle.mjs`
- `node scripts/verify-compensation-audit.mjs`
- `node scripts/verify-compensation-role-access.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 3B gate

- GO only after Phase 3A gates pass and local review confirms no O2C mutation or calculation behavior was introduced.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Blueprint

### Change

- Add Blueprint doc `19_Executive_Compensation_Payroll_Engine.md` defining the HQ-owned compensation/payroll domain.
- Define planned `hr` role as HQ payroll support: maintain payroll data and generate previews only; no payout approval, commission approval, lock, export, accounting, or finance mutation authority.
- Resolve existing Commission Engine conflict: distributor/revenue-based commission analytics are not payroll SoT.
- Establish cash-only commission rule: `attributable_cash_collected × applicable_rate`.
- Forbid order value, invoice value, fulfilled revenue, projected revenue, outstanding receivables, or allocation totals as commission amount.
- Define canonical agent attribution: `payments.agent_id` when populated and certified; otherwise active `lab_ownership` snapshot at payment date, persisted with audit evidence.
- Define Year-1 baseline and promotion rules: first 3 months ₹20,000 salary + ₹5,000 fuel + ₹500 mobile + 3%; promotion after cumulative collections >= ₹5,00,000, collection efficiency >= 80%, and no account overdue > 90 days; promoted salary ₹25,000 + 3.5% commission.
- Define payroll ownership: Executive approves/locks/authorizes/exports; HR previews/submits; Admin views/recommends; Agent views own locked/exported history; Distributor OS has no payroll ownership.

### Not changed

- Documentation only. No app code, SQL, RLS policy, role provisioning, order lifecycle logic, finance, AR, invoice, payment, allocation, collection source records, inventory, logistics, existing commission source records, accounting, commit, or push changed.

### Implementation gate

- GO for Phase 2 implementation planning.
- NO-GO for implementation until HR role/RLS, payroll schema migrations, cash-only commission replacement, attribution snapshot design, approval/export workflows, verification scripts, and UAT checklist are reviewed and approved.

---

## 2026-07-03 — Admin On-Behalf Ordering Blueprint Update

### Change

- Clarify that `admin` and `executive` users may create orders on behalf of `ACTIVE` labs when `ordering_mode` is `hq_managed`, `hybrid`, or `self_service`.
- Block admin-on-behalf order creation when `labs.status = INACTIVE` or `ordering_mode = suspended`.
- Require reuse of the existing `LabOrderingPage` catalog/cart/checkout flow in explicit `adminOnBehalf` mode.
- Prohibit lab-user impersonation: the selected lab remains the customer and the authenticated HQ user remains the actor.
- Require order/audit metadata to identify `source = admin_on_behalf`, originating screen, selected customer lab, authenticated HQ actor, lifecycle status, and ordering mode at submit time.
- Preserve existing pricing, catalog, credit, inventory, finance, delivery, AR, shipment, and commission behavior.

### Not changed

- Documentation only. No app code, SQL, RLS policy, order lifecycle logic, finance, AR, invoice, payment, inventory, shipment, commission, delivery behavior, commit, or push changed.

### Implementation gate

- GO for implementation planning after review.
- NO-GO for implementation until the on-behalf UI/API audit path, verification extension, and UAT checklist are reviewed against this Blueprint update.

---

## 2026-07-03 — Sprint 9 Phase 2A Lab Lifecycle Backend

### Change

- Implement backend/domain API `updateLabLifecycleStatusWrite` for approved lab lifecycle transitions.
- Enforce admin/executive-only authorization, confirmation, mandatory reason for inactivation/reactivation, and allowed transition validation.
- Force `ordering_mode = suspended` only on `ACTIVE -> INACTIVE`; `INACTIVE -> ACTIVE` does not restore Ordering Mode.
- Record lifecycle audit events using the existing operational audit pattern (`user_provisioning_events` with `event_type = updated` and action `lab_lifecycle_status_changed`).
- Refresh `proj_lab_profile_v1` after lifecycle and ordering-mode writes so `read_labs_list_v1` reflects lifecycle status and ordering mode.
- Add `verify-lab-lifecycle-status-flow.mjs` with read-only/static default mode and guarded reversible QA mutation mode via `--apply` or `CONFIRM_MUTATION=true`.

### Not changed

- No UI/browser component, SQL migration, RLS policy, feature flag, finance, AR, invoice, payment, payment allocation, order, shipment, logistics, inventory, commission, delivery rule, or `proj_lab_receivable_v1` behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `CONFIRM_MUTATION=true node scripts/verify-lab-lifecycle-status-flow.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-projection-staleness.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

---

## 2026-07-03 — Phase 1.2 Projection Registry Documentation Cleanup

### Change

- Remove stale references to missing `docs/Architecture/Projection_Registry.md`.
- Document `src/projectionOps/projectionOpsCatalog.json` as the canonical runtime / ops registry.
- Document `docs/Certification_Framework/08_Read_Model_Certification_Matrix.md` as the human certification view for registry IDs, SLAs, adapter RPCs, status, and gates.
- Replace stale references to missing `docs/Architecture/Projection_Ops_Center.md` with the Projection Operations Center section in `18_Domain_Projection_Architecture.md` and generated `docs/QA/Projection_Ops_Report.*` artifacts.
- Remove stale reference to missing `docs/Architecture/Technical_Debt_Register.md` from projection architecture related-docs.

### Not changed

- No app code, SQL, RLS policy, projection behavior, projection schema, feature flag, finance, AR, invoice, payment, allocation, order, shipment, inventory, commission, or operational write behavior changed.
- No commit or push performed.

### Phase 2 gate

- Phase 2 Lab Lifecycle implementation may proceed after review of this documentation cleanup, subject to the normal Blueprint-first implementation gate.

---

## 2026-07-03 — Sprint 9 Phase 1 Lab Lifecycle Blueprint

### Change

- Define approved Lab Lifecycle Status states: `PROSPECT`, `ACTIVE`, and `INACTIVE`.
- Document admin/executive-only lifecycle transitions, confirmation requirements, mandatory reason requirements, and audit expectations.
- Establish the `INACTIVE` invariant: lifecycle state must never hide or alter AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting, or authorized HQ visibility.
- Define Ordering Mode interaction: `ACTIVE -> INACTIVE` forces `ordering_mode = suspended`; `INACTIVE -> ACTIVE` does not restore previous ordering mode.
- Expand Labs KPI definitions to `Total Labs`, `Prospect Labs`, `Active Labs`, `Inactive Labs`, `Order-Eligible Labs`, and `Ordering Suspended`.
- Document inactive Lab Portal behavior: login allowed when provisioned, checkout/reorder blocked, invoices/payments/Track Order/history available.
- Record projection expectations: `proj_lab_profile_v1` reflects `status` and `ordering_mode`; `proj_lab_receivable_v1` remains unchanged and finance-owned.

### Not changed

- No app code, SQL, RLS policy, projection schema, feature flag, finance, AR, invoice, payment, allocation, order, shipment, inventory, commission, or operational write behavior changed.
- No commit or push performed.

### Verification gates

- Planned `verify-lab-lifecycle-status-flow.mjs`
- `node scripts/verify-labs-admin-flow.mjs`
- `node scripts/verify-lab-ordering-flow.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- Browser smoke covering admin lifecycle controls and inactive Lab Portal read-only history access.

---

## 2026-07-03 — Sprint 8B Labs KPI Definition

### Change

- Define `Active Labs` as lifecycle-active labs (`labs.status == ACTIVE`) and explicitly state that it is unaffected by `ordering_mode`.
- Define `Order-Eligible Labs` as lifecycle-active labs with `ordering_mode != suspended` and `ordering_eligible == true`.
- Define `Ordering Suspended` as labs where `ordering_mode == suspended`; checkout is intentionally blocked while invoices, payments, Track Order, finance, logistics, and history remain available.
- Update Labs certification references so `verify-labs-admin-flow.mjs` validates the three KPI definitions.

### Not changed

- No SQL, schema, RLS policy, projection table, projection flag, finance, AR, payment, invoice, order lifecycle, inventory, logistics, commission, or ordering behavior changes.
- `Active Labs` semantics are preserved and not silently redefined.

### Verification gates

- `npm run build`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- Manual Labs Portfolio Summary UAT: suspend/re-enable ordering and confirm only Order-Eligible / Ordering Suspended counts move.

---

## 2026-07-03 — Sprint 8A.1 Labs Projection Hardening

### Change

- Harden `readLabsListV1` so stale/unavailable/empty/failed projection reads fall back to the existing `getLabsCredit` / `v_labs_credit` path with `degraded: true` and `source: "fallback"`.
- Make `verify-labs-projection-parity.mjs` read-only by default; Labs projection rebuilds move to `repair-labs-projection.mjs --apply`.
- Extend Labs projection certification for deterministic `read_labs_list_v1` ordering/limit windows and SECURITY DEFINER adapter visibility vs projection table RLS.

### Not changed

- No finance, AR, payments, invoices, orders, inventory, logistics, commissions, delivery charge rules, business logic ownership, RLS policy, SQL semantics, or production flag changes.
- `VITE_READ_ADAPTER_LABS_V1` remains disabled by default.

### Verification gates

- `npm run build`
- `node scripts/verify-scripts-readonly.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- Full Sprint 8A regression bundle before QA flag review.

---

## 2026-07-03 — Sprint 8A Labs Projection QA Shadow

### Change

- Add the approved Laboratory domain projection `proj_lab_profile_v1` at `(tenant_id, lab_id)` grain for lab identity/profile/ownership/qualification/ordering display fields.
- Add `read_labs_list_v1` as a read adapter that composes `proj_lab_profile_v1` with the finance-owned `proj_lab_receivable_v1` to preserve the existing `v_labs_credit` UI contract without duplicating receivable ownership.
- Register `PRJ-LAB-PROFILE-v1` in projection registry, staleness, Projection Ops, and Labs parity certification.
- Add `VITE_READ_ADAPTER_LABS_V1` as a disabled-by-default shadow flag.
- Optimize `read_labs_list_v1` with an explicit adapter visibility predicate: admin uses the equivalent own-tenant fast path; all other roles continue through `distributor_lab_record_visible`.

### Not changed

- No finance, AR, payments, allocations, invoices, orders, inventory, logistics, commissions, delivery charge rules, or business logic ownership changes.
- No production flag enablement.
- No `proj_lab_credit_v1`; receivable data remains owned by `proj_lab_receivable_v1`.

### Verification gates

- `npm run build`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-projection-staleness.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`

---

## 2026-07-03 — Sprint 7B Data Path Optimization & Progressive Loading

### Change

- Split Executive Financial Intelligence initial load from deep analytics: core summary renders first; portfolio/payments/shipments/catalog/commission analytics load after idle.
- Removed default EFI order-line fallback from initial analytics; EFI uses `orders.total_amount` as the merchandise SoT and leaves line fallback opt-in for deep diagnostics.
- Removed founder snapshot RPC from the default Operations Command Center load path; Operations initial and extended panels no longer block on founder analytics.
- Reused the Sprint 7A shared read broker in the distributor/founder portfolio loader for shared labs, orders, and collections reads.

### Not changed

- No SQL, schema, RLS, projection architecture, projection adapters, projection flags, finance, AR, invoice, payment, inventory, logistics lifecycle, delivery charge, ordering, pricing, or commission business logic changed.
- Existing verification scripts were not modified for Sprint 7B.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`

---

## 2026-07-03 — Sprint 7A Client-Side Read Orchestration

### Change

- Add a client-only shared read broker for high-reuse reads with in-flight dedupe, TTL cache reuse, scoped cache keys, and standardized read health envelopes.
- Add route prefetch measurement for role-route alignment and a duplicate-read broker measurement probe.
- Keep existing Supabase/RLS/API contracts as the source of truth; broker reads wrap existing read APIs only.

### Not changed

- No SQL, schema, RLS, projection flags, write APIs, finance, AR, invoice, payment, inventory, logistics, ordering, pricing, or commission business logic changed.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/measure-route-prefetch.mjs`
- `node scripts/measure-data-broker-duplicates.mjs`

---

## 2026-07-03 — Sprint 6A.1 Read-Only Verification Safety Gate

### Change

- `verify-ar-reconcile.mjs` is now read-only and runs only the collection inconsistency audit.
- AR reconciliation mutation moved to `repair-ar-reconcile.mjs`, dry-run by default and requiring `--apply` or `CONFIRM_MUTATION=true` for the `reconcile_ar_from_payments` RPC.
- `verify-scripts-readonly.mjs` added to audit `verify-*`, `check-*`, `measure-*`, and `run-*-certification.mjs` scripts for obvious mutation patterns.
- `verify-production-readiness.mjs` now runs the read-only guard before nested readiness checks.
- Legacy mutation-capable verification probes now require an explicit apply confirmation for default safety.

### Not changed

- No finance, AR, payment, invoice, allocation, Orders adapter, RLS, schema, projection, inventory, or logistics business logic changed.
- No production deployment.

### Verification gates

- `node scripts/verify-scripts-readonly.mjs`
- Sprint 6A read-only certification bundle before commit recommendation.

---

## 2026-07-03 — Sprint 6A Orders Projection Adapter (QA enablement)

### Change

- `VITE_READ_ADAPTER_ORDERS_V1=true` enabled on QA (`.env.local`) — HQ Orders list now reads from `proj_order_v1` via `read_orders_list_v1`.
- Other read adapters remain **OFF** (`VITE_READ_ADAPTER_RECEIVABLES_V1`, `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1`).
- `OrdersPage.jsx`: skips `enrichOrdersListWithItemCounts` (transactional `order_lines`/`order_items` fan-out) when the list is projection-sourced — projection rows already carry `item_count`.
- `getOrdersRead` (`primecareSupabaseApi.js`): projection path now shares the same in-flight coalesce + 45 s TTL cache as the transactional path, so sidebar summary + Orders page + Operations Center coalesce to one RPC per TTL.
- Detail drawer path (`getOrderDetailsRead`) unchanged — transactional SoT reads permitted for a single order.

### Not changed

- No SoT writes, no lifecycle changes, no RLS changes, no finance/AR/inventory/logistics logic, no projection schemas.
- Production deployment untouched. QA-only.

### Verification gates (Sprint 6A)

- `verify-projection-parity.mjs`, `verify-projection-staleness.mjs`
- `verify-hq-list-detail-parity.mjs` (list `itemCount` vs detail drawer)
- `verify-admin-dashboard-no-transactional-lines.mjs`, `verify-financial-reconciliation.mjs`, `verify-delivery-charge-policy.mjs`, `verify-production-readiness.mjs`, `verify-runtime-import-safety.mjs`
- `run-browser-smoke-all-roles.mjs`, `measure-all-role-page-performance.mjs`

### References

- `18_Domain_Projection_Architecture.md` (adapter flags, staleness SLA)
- `05_Order_Lifecycle.md`, `06_Finance_Rules.md`, `15_Do_Not_Break_Rules.md`

---

## 2026-07-02 — Sprint 3A Production Safety Hardening

### Implemented (approved P0 fixes only)

| ID | Fix | Artifact |
|----|-----|----------|
| TD-025 / SEC-01 | Tenant auth on all `refresh_proj_*` SECURITY DEFINER RPCs | `20260702170000_sprint3a_production_safety_hardening.sql` |
| TD-032 | Least-privilege EXECUTE grants on refresh RPCs | Same migration |
| TD-027 / SEC-03 | Cross-tenant guard on `reset-platform-user-password` | Edge function |
| TD-026 / SEC-04 | Tenant-scoped `todayCollections` in `read_lab_receivables_list_v1` | Same migration |
| TD-028 / REL-01 | Dashboard `readFailed` — no silent zero KPIs | `primecareSupabaseApi.js` |
| TD-031 / REL-03 | `ReadHealthBanner` on Dashboard, Ops, Executive, Projection Ops | UI + `readHealth.js` |
| WS3 | Migration inventory + manifest + remediation plan | `Sprint3A_Migration_*` |
| WS4 | Observability abstraction + health endpoint + correlation IDs | `src/observability/` |
| WS5 | Backup/restore/rollback checklists + production runbook | `docs/operations/Sprint3A_*` |

### Verification scripts added

- `verify-security-hardening.mjs`
- `verify-migration-integrity.mjs`
- `verify-production-readiness.mjs`
- `verify-observability.mjs`

### Out of scope (unchanged)

- No `VITE_READ_ADAPTER_*` flag flips
- No projection architecture / read adapter logic changes
- No finance / logistics / inventory business rules

---

## 2026-07-02 — Projection Operations Center (ops monitoring)

### Added (design + implementation)
- Blueprint 18 Projection Operations Center section (10 modules)
- Projection Operations Center spec now lives in `18_Domain_Projection_Architecture.md`; generated ops artifacts live under `docs/QA/Projection_Ops_Report.*`
- Cert matrix 08 ops gates
- TD-022, TD-023, TD-024 registered
- TD-021 mitigated (Phase 2 deployed QA)

### Scope
- Read-only monitoring via `hq_projection_meta_v1` + catalog
- No projection/adapter/flag changes
- Executive UI + CLI verification scripts

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-024 | ops | Refresh timeline limited to meta + local rebuild history (no append-only event log yet) | OPEN |
| GAP-BP-025 | ops | Parity dashboard requires cert script run for full field compare | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 2 Dashboard & Executive (design)

### Added (design only — no schema yet)
- Blueprint 18 Sprint 2 Phase 2 section — domain metrics + thin dashboard/executive composites
- Registry entries: PRJ-ORD-METRICS-v1, PRJ-COL-METRICS-v1, PRJ-DSH-METRICS-v1, PRJ-EXE-METRICS-v1
- Cert matrix 08 Phase 2 gates + verification scripts planned
- TD-019, TD-020, TD-021 registered

### Design decisions
- Incremental refresh from `proj_order_v1` / `proj_lab_receivable_v1` only — no SoT at adapter read
- Replaces `getAdminDashboardRead` and `get_founder_snapshot` hot paths
- Flags `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1` default OFF
- 14-day shadow for composites before flag flip

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-022 | architecture | Phase 2 migration not deployed | OPEN |
| GAP-BP-023 | cert | Dashboard/executive parity scripts not yet implemented | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 1 Domain Projections

### Added
- Migration `20260705120000_sprint2_domain_projections_phase1.sql` (+ fix migrations 001, 002)
- Client adapters, feature flags, parity/staleness certification scripts
- Cert matrix `08_Read_Model_Certification_Matrix.md`
- ADR-001 committed

### Updated
- Projection Registry status: `shadow`
- TD-001 mitigated (Orders + Collections); TD-003 closed

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-019 | architecture | Screen-oriented names | **CLOSED** — `proj_*` / `read_*` deployed |
| GAP-BP-020 | architecture | Event queue / worker | OPEN — Phase 1 uses row refresh + rebuild |
| GAP-BP-021 | cert | Flag flip after 7-day shadow | OPEN |

---

## 2026-07-02 — Domain Projection Architecture v2

### Added
- Blueprint `18_Domain_Projection_Architecture.md` — domain-driven read layer (replaces screen-oriented read model naming)
- Projection registry contract; current canonical runtime registry is `src/projectionOps/projectionOpsCatalog.json`

### Updated
- `README.md` — doc 18 in index; link to Projection Registry
- Sprint 2 implementation plan — **must rename** before schema:
  - `hq_orders_summary_v1` → `proj_order_v1`
  - `hq_collections_summary_v1` → `proj_lab_receivable_v1`
  - `get_*_summary_v1` → `read_*_v1` (read adapters, not projections)

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-017 | gap | ADR-001 not committed; superseded by domain naming in doc 18 | OPEN |
| GAP-BP-018 | gap | Blueprint 17 (`HQ_Read_Model`) never created — superseded by doc 18 | CLOSED |
| GAP-BP-019 | architecture | Screen-oriented read model names in Sprint 2 draft | OPEN — rename required |
| GAP-BP-020 | architecture | No projection event queue / worker yet — Phase 1 uses row refresh + sweep | OPEN |

### Migration impact
**None** — documentation only until approved schema change.

---

## 2026-07-02 — Phase 2 Certification Framework

### Added
- Blueprint `16_Certification_Framework.md` — framework index and workflow
- `docs/Certification_Framework/` — 7 artifacts (object catalog, screen catalog, dependency graph, browser golden path, browser regression, release scorecard, performance matrix)
- `docs/Certification_Framework/browser-regression-manifest.json` — suite definitions
- `scripts/run-browser-certification.mjs` — API prereq orchestrator + manual checklist printer

### Updated
- `README.md` — doc 16 in index
- `13_Verification_Matrix.md` — framework cross-reference
- `14_Release_Gates.md` — cert framework + browser orchestrator gates

### Migration impact
**None** — documentation and non-mutating orchestration only.

---

## 2026-06-30 — AI Architect Mode + doc restructure

### Added
- Cursor rule: `.cursor/rules/primecare-ai-architect.mdc`
- Blueprint numbering 00–15 + templates/
- Legacy docs `01_schema_catalog.md` … `12_verification_matrix.md` superseded by 00–15 (retained for reference)

### Conflicts / gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-001 | Schema drift | `supabase/migrations/` (13) vs `supabase/sql/` (52) — unclear single apply order | OPEN |
| GAP-BP-002 | Dual model | `order_items` + `order_lines` coexist | OPEN — detail reads try both |
| GAP-BP-003 | Type drift | `tenant_id` uuid vs text in legacy rows | OPEN |
| GAP-BP-004 | Migration | Phase 3A delivery columns may be missing on QA while client deployed | OPEN — shipment insert PGRST204 |
| GAP-BP-005 | RLS | `event_log` enabled without policies | OPEN |
| GAP-BP-006 | Product | No DB enum for lab ordering mode (HQ Managed / Hybrid / Self-Service) | MITIGATED — `labs.ordering_mode` Phase 4 |
| GAP-BP-007 | Audit | No single `audit` table — scattered audit tables | DOCUMENTED |
| GAP-BP-008 | Legacy | Apps Script fallback can show misleading errors if unguarded | MITIGATED in lab track path |
| GAP-BP-009 | Architecture | Catalog create seeds inventory (GAP-001 / DA-001) | DEFERRED |
| GAP-BP-010 | Roles | `read_only_auditor`, distributor roles not in pilot launch | BY DESIGN |

### Resolved (reference)

| ID | Resolution |
|----|------------|
| GAP-BP-011 | Lab Track Order — `getLabOrderDetailsRead` + cache handoff (code fix 2026-06-30) |
| GAP-BP-012 | Lab delivery snapshot PATCH 406 — `persist_order_delivery_snapshot` SECURITY DEFINER RPC (2026-07-01) |
| GAP-BP-013 | Lab ordering governance — `labs.ordering_mode` + initiation gates (2026-07-03) |
| GAP-BP-014 | Logistics Phase 4 route planning — `delivery_routes` + stop sequencing (2026-07-04) |
| GAP-BP-015 | Lab checkout false-success — persistence read-back gate before success banner (2026-07-02) |
| GAP-BP-015b | Lab checkout hardening — RPC order-row required, retry confirmation, structured diagnostics + build stamp, pending-track UX (2026-06-28) |
| GAP-BP-016 | Track Order stale-drawer fix + HQ Orders item count from order_lines/order_items quantities (2026-06-28) |

### Open (reference)

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-012 | conflict | Lab checkout called client PATCH on `orders` for delivery snapshot; `orders_update_by_role` blocks lab UPDATE → PGRST116/406 | MITIGATED — RPC path |

---

## How to add entries

```markdown
## YYYY-MM-DD — Short title

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-0NN | conflict / gap / resolved | ... | OPEN / MITIGATED / CLOSED |
```

**Type:** `conflict` = blueprint vs code; `gap` = missing feature/schema; `resolved` = fixed.

---

## Sync with docs/QA

Mirror closed gaps to `docs/QA/QA_Gap_Register.md` when certified.
