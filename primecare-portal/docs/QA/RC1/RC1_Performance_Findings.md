# RC1 Performance Findings

**Date:** 2026-07-08  
**Script:** `scripts/verify-performance-readiness.mjs`  
**Rule:** Safe fixes only — no architectural rewrites in RC1

---

## Largest Bundles (build output)

| Chunk | Size (gzip) | Risk |
|---|---|---|
| `predator-tools-*.js` | ~340 kB | Dev/QA tooling — hide in prod nav |
| `ExecutiveCompensationCenterPage-*.js` | ~54 kB | Acceptable with lazy load |
| `supabase-vendor-*.js` | ~52 kB | Expected |
| `react-vendor-*.js` | ~61 kB | Expected |
| `CollectionsPage-*.js` | ~27 kB | God component source |
| `OperationsCenterAdminPage-*.js` | ~27 kB | Acceptable |

Vite warns on chunks >500 kB — primarily `predator-tools` dev bundle.

---

## God Components (LOC)

| File | LOC | Recommendation (post-RC1) |
|---|---|---|
| `CollectionsPage.jsx` | ~3,243 | Extract allocation drawer + KPI panel |
| `AgentVisitPage.jsx` | ~3,082 | Extract visit form + geo sections |
| `ExecutiveCompensationCenterPage.jsx` | ~1,381 | Tab lazy-load already partial |

**RC1 action:** Document only — no rewrite per feature freeze.

---

## Slowest / Unbounded Reads

| Path | Issue | RC1 Status |
|---|---|---|
| Orders list (perf tenant) | 0 rows at 100k bound — MON-14 FAIL | Document; seed perf tenant post-RC1 |
| Payments list (perf tenant) | Same | Document |
| Labs/agents | At 1000 cap — OK | PASS |
| `profiles` unbounded in Ops Center | Medium | Documented GAP-020 |

---

## Repeated Reads / Renders

- `hqReadCoordinator.js` — dedupes parallel HQ reads (PASS)
- Admin dashboard session cache — no tenant key (low risk single-tenant pilot)
- Route prefetch — `measure-route-prefetch.mjs` available for regression

---

## Safe Fixes Applied in RC1

None required for pilot gate — performance issues are documented, not blocking golden path.

---

## Verdict

**PASS** for single-HQ pilot scale.  
**FAIL** for enterprise scale (10k+ orders) until MON-14 perf tenant seeded and bounds verified.
