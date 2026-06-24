# HQ Golden Path Certification

**Date:** 2026-06-24T05:30:00Z  
**Environment:** `https://zipuzmfkwwucbchlphcj.supabase.co`  
**HQ Tenant:** `f168b98f-47a6-42c3-b788-24c00436fac2`  
**Account:** `qa.executive@primecare.test` (read-only validation)  
**Result:** **PASS** (chain linkage verified)

## Record chain — QA_LAB_001

| Step | Table | ID | Status |
|------|-------|-----|--------|
| Qualification | `lab_qualifications` | `00b40bf2-d673-4cb0-b169-d9b9654319c1` | `pipeline_stage=won` |
| Contract | `lab_contracts` | `contract-golden-mqrh9f19` | `Active` |
| Order | `orders` | `ORD-1779891526918-x4rfj7` | `Fulfilled` |
| Payment | `payments` | `QA_PAY_001` | linked `order_id=QA_ORD_001` |
| Commission | `commission_entries` | `comm-golden-mqrhd7t6` | `approved` |

## Linkage verification

- Payment `QA_PAY_001` → order `QA_ORD_001` → lab `QA_LAB_001`
- Qualification won precedes active contract for same lab
- Fulfilled order exists for same lab
- Commission row exists for HQ distributor tenant

## Notes

- Guntur tenant chain also present (`787999b9-72f5-4163-a860-551c12ce3414`) — not modified during certification.
- Prior doc `docs/hq-audit/GUNTUR_GOLDEN_PATH_REPORT.md` marked pending; superseded by this runtime evidence for HQ pilot tenant.
