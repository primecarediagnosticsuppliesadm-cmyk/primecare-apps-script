# ADR-001 — Domain Projection Read Model (Phase 1)

**Status:** Accepted  
**Date:** 2026-07-02  
**Supersedes:** Screen-oriented `hq_*_summary_v1` naming (Sprint 2 draft)

## Context

HQ Orders and Collections list reads fan out across transactional tables (`orders` + line metrics; AR + payments + labs). QA cold loads exceed 1–2 s; Admin Dashboard fan-out remains a separate Phase 3 concern.

Blueprint 18 defines domain-driven projections with read adapters.

## Decision

Implement Phase 1 domain projections:

| Artifact | Name |
|----------|------|
| Order projection | `proj_order_v1` |
| Lab receivable projection | `proj_lab_receivable_v1` |
| Read adapters | `read_orders_list_v1`, `read_lab_receivables_list_v1` |
| Workers | `refresh_proj_order_row_v1`, `refresh_proj_lab_receivable_row_v1` |
| Rebuild | `rebuild_projection_v1` |
| Metadata | `hq_projection_meta_v1` |

Feature flags (default **OFF** — shadow mode):

- `VITE_READ_ADAPTER_ORDERS_V1`
- `VITE_READ_ADAPTER_RECEIVABLES_V1`

## Consequences

- Single order projection serves all future order-list consumers (Dashboard, Ops, EFI deferred to Phase 3).
- RLS on projections mirrors `distributor_lab_record_visible`.
- Write SoT unchanged; refresh is fire-and-forget after order writes.
- Flag flip gated on parity + staleness certification.

## References

- Blueprint 18: `docs/PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md`
- Registry: `docs/Architecture/Projection_Registry.md`
