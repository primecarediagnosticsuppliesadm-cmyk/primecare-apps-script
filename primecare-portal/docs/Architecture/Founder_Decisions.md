# PrimeCare Founder Decisions

## FD-001: HQ-first production strategy
PrimeCare will certify HQ Admin, Executive, Agent, and Lab workflows before expanding Distributor OS.

## FD-002: Supabase replaces Apps Script for production
Production should be Supabase-first. Legacy Apps Script should be disabled unless explicitly needed.

## FD-003: One GitHub repo, branch-based environments
Use one codebase and separate environments:

- `qa` branch -> QA Vercel -> QA Supabase
- `main` branch -> Production Vercel -> Production Supabase

## FD-004: Tenant means workspace, not only distributor
PrimeCare HQ itself is a tenant. Future distributors will be additional tenants.

## FD-005: Inventory redesign deferred
The current Master Catalog + opening stock flow is acceptable for pilot. A ledger-first inventory redesign is deferred.
