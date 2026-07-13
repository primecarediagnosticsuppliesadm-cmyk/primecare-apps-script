# 12 — Executive Analytics Rules

Founder and Executive Financial Intelligence — **read-only** analytics over operational data.

---

## Modules

| Module | Page key | Roles |
|--------|----------|-------|
| Founder Navigation / Strategy | founderNavigation, founderStrategy | executive |
| Founder Financial Intelligence | founderFinancialIntelligence | executive |
| Executive Financial Intelligence (EFI) | executiveFinancialIntelligence | executive |
| Revenue Funnel | revenueFunnel | executive |
| Pilot Readiness | pilotReadiness | executive |
| Founder snapshot RPC | — | executive |
| Executive Compensation / Payroll | planned executiveCompensation/payroll keys | executive; hr support after approval |

---

## Design constraints

| Rule | Detail |
|------|--------|
| **Read-only** | No new write APIs or SQL in EFI phase |
| **Reuse engines** | Extend existing KPI/financial bundles — no duplicate revenue SoT |
| **Bounded reads** | Same limits as HQ dashboards |
| **No finance mutation** | EFI must not post payments, fulfill orders, or change AR |
| **Payroll boundary** | EFI may display read-only payroll KPIs only after payroll domain certification; approval, lock, and export belong to the compensation/payroll module, not EFI |

---

## EFI sections (7)

1. Revenue  
2. Collections  
3. Orders  
4. Logistics  
5. Inventory  
6. Lab Performance  
7. Executive Alerts  

Payroll KPIs may be displayed in Executive dashboards only from approved payroll domain tables or certified payroll projections. EFI must not calculate payable commission from orders, invoices, revenue, receivables, or projections.

Source: `executiveFinancialIntelligenceEngine.js` — aggregates from existing read APIs.

---

## Founder snapshot

- RPC: `get_founder_snapshot`
- Client: `founderSnapshotApi.js`
- Verified: `verify-founder-snapshot.mjs`

---

## Logistics in analytics

- Shipment counts/KPIs from `order_shipments` — operational metrics only
- Do not treat delivery charge as revenue in Phase 3A

---

## Verification

- `verify-executive-financial-intelligence.mjs` — isolation, 7 sections, no write API touch
- Planned payroll dashboard checks: `verify-compensation-cash-only.mjs`, `verify-compensation-approval-workflow.mjs`, `verify-compensation-no-finance-mutation.mjs`

---

## Related docs

- `docs/Architecture/Founder_Decisions.md`
- Finance SoT: [06_Finance_Rules.md](./06_Finance_Rules.md)
- Compensation / payroll: [19_Executive_Compensation_Payroll_Engine.md](./19_Executive_Compensation_Payroll_Engine.md)
