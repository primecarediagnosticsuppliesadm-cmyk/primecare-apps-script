# Sprint 3A Migration Remediation Plan

**Status:** Plan only — legacy SQL not deleted (WS3 gate).

## P0 — Before Production cutover

1. **Pick one deploy track per environment** — Track A (manual manifest) or Track B (CLI migrations); never both for same objects (GAP-BP-001 / TD-007).
2. **Consolidate projection SQL** — Ensure Sprint 3A migration `20260702170000_sprint3a_production_safety_hardening.sql` applied after Phase 2 migrations.
3. **Verify** — `node scripts/verify-migration-integrity.mjs` on every release candidate.

## P1 — Next sprint

4. Generate unified migration chain from Track A manifest (automated squash — do not hand-merge without review).
5. Mark orphan `supabase/sql/` files as DIAGNOSTIC or ARCHIVE in HQ_SQL_MIGRATION_MANIFEST.md.
6. Add CI gate: migration manifest drift fails PR when new SQL lacks registry entry.

## P2 — Future

7. Retire Track A manual apply after Track B parity proven on staging + prod.
8. Enable Supabase PITR on production project.

## Do NOT (this sprint)

- Delete `supabase/sql/**` files
- Auto-apply orphan SQL without manifest classification
