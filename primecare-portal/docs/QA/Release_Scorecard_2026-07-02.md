# Release Scorecard — 2026-07-02 (QA Hardening Sprint)

## Run metadata

| Field | Value |
|-------|-------|
| **Release** | Year-1 O2C — QA Hardening Sprint |
| **Branch** | `qa` |
| **Commit** | local (uncommitted hardening) |
| **Environment** | QA — https://primecare-portal.vercel.app |
| **Certifier** | PrimeCare AI Architect Mode |
| **Date** | 2026-07-02 |

---

## Executive summary

QA hardening sprint completed: **HQ Orders list item-count root cause fixed** (bulk `.in()` statement timeouts on `order_items`), **QA Diagnostics panel** added, page perf instrumentation wired, and **list/detail parity verification** passes on live QA. API prereq gate **10/10 PASS**. Browser UAT from prior session remains valid; **deploy required** for Vercel bundle to pick up fixes. **CONDITIONAL GO** for QA pilot after deploy; **NO-GO** for production until deploy + browser re-sign-off on item counts.

---

## PASS / FAIL matrix

| # | Domain | Automated | Manual UAT | Status | Evidence |
|---|--------|-----------|------------|--------|----------|
| 1 | Lab ordering | PASS | PASS (prior) | **PASS** | `verify-lab-ordering-flow` |
| 2 | HQ Orders | PASS | CONDITIONAL | **CONDITIONAL PASS** | parity script + BGP-A |
| 3 | Fulfillment | PASS | PASS (prior) | **PASS** | golden path |
| 4 | Logistics | PASS | PASS (prior) | **PASS** | `verify-logistics-dispatch-flow` |
| 5 | Finance | PASS | — | **PASS** | no changes |
| 6 | Performance | WARN | WARN | **WARN** | surface report |
| 7 | Security / RLS | PASS | — | **PASS** | `verify-hq-rls-reads` |
| 8 | Regression bundle | PASS | — | **PASS** | build + 10 scripts |
| 9 | Browser golden path | — | CONDITIONAL | **CONDITIONAL PASS** | BGP-A/E/L prior run |

---

## Fixed issues (this sprint)

| ID | Issue | Fix |
|----|-------|-----|
| P1 | HQ Orders list `0 items` while detail shows correct units | Root cause: `fetchOrderUnitCountsForOrders` used 200-ID `.in()` chunks → **statement timeout** on QA `order_items`. Fixed: chunk size **20**, **parallel chunks**, **business order_id only**, UUID alias merge, non-zero line/item preference |
| P1 | List/detail drift | `verify-hq-list-detail-parity.mjs` — **9/9 sampled orders PASS** |
| P2 | No in-app perf visibility | QA Diagnostics panel (build stamp, commit, branch, env, tenant, user, API/RPC/render timings, FCP/LCP) |
| P2 | Slow perceived loads | Orders cache hydration; EFI **90s session cache** (stale-while-revalidate); Logistics header-first skeleton; parallel labMap + lineCounts in `getOrdersRead` |
| P2 | Detail drawer list mismatch UX | OrdersPage syncs `itemCount` from detail lines on drawer open |

---

## Remaining issues

| Severity | Item | Accept for pilot? |
|----------|------|-------------------|
| P1 | **Vercel QA still on old bundle** (`index-GBpIZ8HT.js`) — fixes not deployed | **No** |
| P2 | `orders-list` API cold ~2s (chunked line counts) — target 350ms | Monitor after deploy |
| P2 | `admin-dashboard` cold can spike under QA load | Monitor |
| P2 | Browser FCP/LCP 6–8s on heavy HQ surfaces (prior UAT) | Yes with diagnostics |
| P3 | `qa` branch unpushed / uncommitted hardening | No for prod |

---

## Performance report (API cold, post-fix)

| Surface | API ms | Target | Status |
|---------|--------|--------|--------|
| admin-dashboard | ~31.7s peak / variable | 350 | **FAIL** (QA DB load) |
| orders-list | ~1.9s | 350 | **WARN** (correctness fixed; chunked counts) |
| collections | ~1.4s | 200 | **WARN** |
| lab-invoices | ~518 | 300 | **WARN** |
| logistics-shipments | ~133 | 400 | **PASS** |
| executive-fi-sidebar | ~0 warm | 400 | **PASS** |

**Top slowest API operations:** admin-dashboard → orders-list → collections → lab-invoices → logistics-shipments.

**Browser timings:** Use **QA Diagnostics** floating panel (QA/dev only) on Dashboard, Orders, Executive FI, Logistics, Lab Invoice Center for FCP, LCP, and page render-ready ms.

---

## Browser UAT summary (prior session + hardening)

| Track | Verdict |
|-------|---------|
| Admin BGP-A | **CONDITIONAL PASS** (full O2C chain; list item count fixed in code, pending deploy) |
| Executive BGP-E | **PASS** |
| Lab Invoice Center | **PASS** |
| BGP-L | **PASS** |

---

## Scoring

| Criterion | Weight | Score |
|-----------|--------|-------|
| Automated regression | 30% | 95 |
| Golden path API | 20% | 95 |
| Security | 15% | 100 |
| Performance | 15% | 60 |
| Manual UAT | 15% | 85 |
| Deploy hygiene | 5% | 50 |

### **Production readiness score: 84 / 100**

---

## Recommendation

| Gate | Decision |
|------|----------|
| **QA pilot** | **CONDITIONAL GO** |
| **Production** | **NO-GO** |

**Conditions for full GO:**

1. Deploy hardening sprint to Vercel QA; confirm bundle stamp updates and BGP-A03 list row item counts match detail.
2. Re-run `verify-hq-list-detail-parity.mjs` against deployed QA.
3. Browser spot-check QA Diagnostics panel + Orders list on live URL.

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | AI Architect | 2026-07-02 | Sprint complete (uncommitted) |
| QA | — | — | Pending deploy verify |
| Product / Founder | — | — | Pending |
