# PharmaCare — Agent Instructions

Before writing any code, read `PHARMACARE_AGENT_CONTEXT.md` in full.
That document is your single source of truth for schema, roles, features, and compliance rules.

## Hard rules (never violate these)
- No localStorage for any business data. All persistence via Supabase.
- Never hard-delete any record. Soft-delete only (is_deleted = true).
- Every write must insert a row into audit_logs.
- Both RLS (DB layer) AND Next.js middleware guards must be implemented.
- No sale item unit_price may exceed medicines.mrp.
- controlled_drug_register is append-only. No UPDATE or DELETE ever.

## Current task
See PHARMACARE_AGENT_CONTEXT.md → Section 9 for the phased task list.
Complete phases in order. Run acceptance tests before moving to the next phase.

## Environment
- Next.js 16, TypeScript, Tailwind CSS v4, Supabase
- .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEYPHARMACARE_AGENT_CONTEXT.md