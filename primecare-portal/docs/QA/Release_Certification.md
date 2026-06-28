# PrimeCare Release Certification

## Release Candidate
- Branch: `main`
- Source commit: `3292c90` or newer
- Environment: Production
- Production Supabase: `alxhrnotnvwpblsiadxj`

## Certification Table

| Area | Status | Evidence / Notes |
|---|---|---|
| Vercel production deployment | ✅ | Latest production deployment from `main`. |
| Supabase production connection | ✅ | Network requests go to `alxhrnotnvwpblsiadxj.supabase.co`. |
| Auth URL correctness | ✅ | Fixed `VITE_SUPABASE_URL`; no `/rest/v1/auth/v1`. |
| Founder login | ✅ | Executive profile seeded. |
| Admin login | ✅ | Admin profile seeded; product creation moved past grants. |
| Lab login | ✅ | Lab Portal loads. |
| Agent login | ⏳ | Pending. |
| Product creation | ✅ | Product created from Master Catalog after grants. |
| Inventory visibility | ✅ | Inventory displays created SKU. |
| Notifications | ✅ | `notification_events` table created. |
| Legacy Apps Script fallback | ⚠️ | Cleanup recommended. |

## Verdict
Not final GO yet. Continue business-flow smoke test.
