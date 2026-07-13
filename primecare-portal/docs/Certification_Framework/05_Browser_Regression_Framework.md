# 05 — Browser Regression Framework

**Structured manual browser regression with manifest, tiers, orchestration, and sign-off.**

No Playwright/Cypress in Year-1 — framework is **manifest-driven manual regression** with API prereq gates. Automation slot reserved for Phase 3.

---

## Architecture

```
browser-regression-manifest.json
        ↓
run-browser-certification.mjs  ──→  API prereq scripts (exit 1 on FAIL)
        ↓
Printed checklist (BGP-* steps)
        ↓
Manual browser execution (04_Browser_Golden_Path.md)
        ↓
Release Scorecard (06) browser section
```

---

## Regression tiers

| Tier | When | Scope | Gate |
|------|------|-------|------|
| **T0 Smoke** | Every deploy | Login + dashboard per role | 5 min |
| **T1 O2C Golden** | Release candidate | Full BGP-L + BGP-A + BGP-E | Required for GO |
| **T2 Module** | Feature touch | Affected manifest `suites` only | Per 13_Verification_Matrix |
| **T3 Device** | Pre-production | `HQ_BROWSER_DEVICE_UAT_CHECKLIST.md` | Optional pilot |

---

## Manifest

Location: `docs/Certification_Framework/browser-regression-manifest.json`

Each suite defines:
- `id` — suite identifier
- `roles` — actors required
- `paths` — URL paths to visit
- `steps` — BGP step IDs from doc 04
- `prereqScripts` — API scripts that must PASS before browser work
- `perfSurfaces` — keys into performance matrix

---

## Orchestration

```bash
# Full O2C browser cert (default)
node scripts/run-browser-certification.mjs

# API prereq only (no checklist)
node scripts/run-browser-certification.mjs --prereq-only

# Specific suite
node scripts/run-browser-certification.mjs --suite o2c-golden

# List suites
node scripts/run-browser-certification.mjs --list
```

**Exit codes:**
- `0` — all prereq scripts PASS (browser still requires manual sign-off)
- `1` — at least one prereq FAIL (do not start browser UAT)

---

## Sign-off matrix

| Role | Minimum browser coverage |
|------|--------------------------|
| Lab | T0 + BGP-L01–L06, L09 |
| Admin | T0 + BGP-A01–A12 |
| Executive | T0 + BGP-E01, E03 |
| Agent | T0 + agent dashboard (optional Year-1) |

---

## Regression rules

1. **API green before browser** — never debug UI when prereq scripts FAIL.
2. **One order chain per run** — use disposable checkout; avoid polluting KPIs.
3. **Hide smoke orders** — confirm ORD-VERIFY filter before HQ Orders sign-off.
4. **Capture order_id chain** — lab checkout ID must flow to fulfill → invoice → payment.
5. **No ORD-VERIFY in screenshots** for stakeholder sign-off unless QA layer intentional.
6. **Freeze awareness** — during HQ freeze, confirm writes blocked but review/payment paths work (`verify-hq-freeze-policy`).

---

## Future automation (Phase 3 — not implemented)

Reserved structure for Playwright when added:

```
primecare-portal/e2e/
├── fixtures/qa-accounts.json
├── golden-path.spec.ts      # BGP-L03, BGP-A05, BGP-A11
└── smoke-login.spec.ts      # T0
```

Manifest `automationReady: false` until e2e directory exists.

---

## Related docs

- [04_Browser_Golden_Path.md](./04_Browser_Golden_Path.md) — step definitions
- [06_Release_Scorecard.md](./06_Release_Scorecard.md) — PASS/FAIL recording
- `docs/operations/HQ_BROWSER_DEVICE_UAT_CHECKLIST.md` — device/browser matrix
