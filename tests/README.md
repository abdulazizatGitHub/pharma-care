# PharmaCare Test Suite

## Running the tests

```bash
npx jest --runInBand
```

**Always use `--runInBand`.** Jest parallelizes multiple test *files* into
separate OS worker processes by default. `accounting.test.ts`,
`inventory.test.ts`, `business-rules.test.ts`, `reports.test.ts`, and
`smoke.test.ts` all call `post_journal_entry()` (directly or via `complete_sale()`
/ `complete_grn()` / `process_return()`), which generates its `entry_no` via
`SELECT COUNT(*) + 1 FROM journal_entries WHERE entry_no LIKE 'JE-<date>-%'`.
Two of those files running as genuinely concurrent processes against the same
shared dev database race on that count and produce real
`journal_entries_entry_no_key` unique-constraint violations — not a flaky
test, a real cross-process race. `route-access.test.ts`, `rls-policies.test.ts`,
and `functional-flows.test.ts` don't need it (they don't hammer journal
posting the same way), but there's no harm running everything with
`--runInBand` uniformly.

To run a single file (safe without `--runInBand`, since Jest runs tests
within one file sequentially by default):

```bash
npx jest tests/accounting.test.ts
```

To run more than one file together, always add it:

```bash
npx jest tests/accounting.test.ts tests/inventory.test.ts --runInBand
```

## Environment variables

Read from `.env.local` (via `tests/helpers/setup.ts`, a Jest `setupFiles`
entry that loads it with `dotenv`). No separate `.env.test` is used.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase REST API base URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon-key client, for RLS-level tests that sign in as a real user |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role client (`adminClient`/`serviceClient`) — bypasses RLS for test setup/cleanup |
| `SUPABASE_DB_URL` | **required** for `tests/accounting.test.ts`, `inventory.test.ts`, `business-rules.test.ts`, `reports.test.ts`, `smoke.test.ts` — a direct Postgres connection (via `pg`), needed ONLY to temporarily disable the `journal_lines_immutable` / `journal_entries_protect_posted` triggers during cleanup (see below). Not needed by `route-access.test.ts` / `rls-policies.test.ts` / `functional-flows.test.ts`. |

`route-access.test.ts` additionally requires the Next.js dev server running
on `http://localhost:3000` (`npm run dev` in a separate terminal) — it makes
real HTTP requests to check redirect/auth behavior. The other six files talk
directly to Supabase and don't need a dev server.

## Why journal_lines/journal_entries cleanup needs a direct Postgres connection

`journal_lines` and `journal_entries` are protected by real `BEFORE
UPDATE OR DELETE` triggers (`journal_lines_immutable` on `journal_lines`,
`journal_entries_protect_posted` on `journal_entries`) — this is intentional
production behavior (see CLAUDE.md's "Phase 7 Rules — Ledger & Accounting":
*"journal_lines is IMMUTABLE — no UPDATE, no DELETE, ever"*). Even the
service-role client cannot bypass a trigger — service role only bypasses
**RLS**, which is a separate mechanism. Removing test-created journal rows
therefore requires `cleanupJournalEntries()` in `tests/helpers/test-client.ts`,
which opens a direct `pg` connection (`SUPABASE_DB_URL`), disables both
triggers, deletes by **exact tracked UUID only** (never a `LIKE` pattern —
too risky against a shared dev database), then re-enables them — all inside
one transaction, so if anything fails partway, the trigger-disable itself
rolls back too (DDL is transactional in Postgres) and the triggers are never
left off.

Every test file that creates a business row which itself posts a journal
entry (a sale, GRN, return, expense, or payment) must track **both** the
business row's id and its resulting `journal_entries.id`, and pass both to
cleanup in `afterAll`. Missing the journal-entry half is a real, easy-to-hit
bug: the business row deletes fine, but the orphaned `journal_entries` row
lingers and poisons the *next* run's `entry_no` generation for the rest of
that calendar day (see `tests/helpers/test-client.ts`'s header comment on the
`rpc()` retry wrapper for the full mechanism).

## Test data isolation

Every row a test creates uses the `TEST_RUN_ID` prefix
(`__test_16_<timestamp>_`, from `tests/helpers/test-client.ts`) somewhere in
a text column — `medicines.name`, `stock_batches.batch_no`,
`suppliers.name`, `sales.notes`, `expenses.description`, etc. — so leftover
rows from an aborted run are always identifiable later, even though normal
cleanup matches by exact tracked UUID rather than the prefix (the prefix is
a diagnostic aid, not the cleanup mechanism itself).

## What each file covers

| File | What it tests | Needs dev server? | Needs `SUPABASE_DB_URL`? |
|---|---|---|---|
| `route-access.test.ts` | Route-level auth/redirect guards for all three roles | Yes | No |
| `rls-policies.test.ts` | Row-level security policies, tested via real signed-in JWTs per role | No | No |
| `functional-flows.test.ts` | User lifecycle, MRP trigger, soft delete, audit log immutability | No | No |
| `accounting.test.ts` | `complete_sale()`, `complete_grn()`, `process_return()`, `post_journal_entry()`, `recordExpense()`/`recordSupplierPayment()`/`recordCustomerPayment()` (business logic replicated directly — those are `'use server'` actions needing a session), borrowing accounting | No | Yes |
| `inventory.test.ts` | GRN stock batch creation, `complete_sale()` deduction behavior, `process_return()` stock restoration, `adjustStock()`/`writeOffBatch()` (replicated directly) | No | Yes |
| `business-rules.test.ts` | MRP/shift/expiry rules, PO status transition (non-)enforcement, return policy (controlled meds, window, double-return, approve/deny), soft-delete RLS behavior, audit log integrity, opening-balances guard | No | Yes |
| `reports.test.ts` | `get_financial_summary()`, `get_balance_sheet()`, `get_trial_balance()`, `get_cash_book()`, `get_party_ledger()` | No | Yes |
| `smoke.test.ts` | End-to-end flows spanning DB + journal + stock + party ledger in one scenario each: sale, GRN, return, supplier payment, customer credit cycle, expense void, discounted-sale return | No | Yes |

## Known bugs/findings these tests deliberately assert (not work around)

See CLAUDE.md's Phase 16A–16D changelog entries for full detail and file:line
context. In short, several tests assert *actual* (surprising, sometimes
buggy) behavior rather than what a first read of the spec might assume:

- **Report-function reversal undercounting** (`reports.test.ts`,
  `smoke.test.ts` 4.6): `get_financial_summary()` / `get_balance_sheet()`
  (and, by the same shared filter pattern, presumably `get_trial_balance()`
  / `get_cash_book()` / `get_party_ledger()` too) do not net a reversed entry
  back to zero when the original and its reversal both fall in the query
  window — the original is excluded, the reversal counts as new activity.
  Tests assert the actual delta (e.g. `-500` for a voided Rs 500 expense),
  not the "correct" `0` a naive read of the spec would expect.
- `complete_sale()` has no shift-open check, no expiry check, and no FEFO
  logic — it deducts exactly the `batch_id` given.
- `adjustStock()` takes an absolute target quantity, not a delta.
- `medicines_select` RLS has no `is_deleted` filter (unlike `suppliers_select`).
- PO status transitions have zero DB-level enforcement (app-layer only).
- `audit_logs` has no trigger — only RLS protects it, which a service-role
  caller bypasses.

## How to add new tests

Follow the existing pattern in any of `accounting.test.ts` /
`inventory.test.ts` / `business-rules.test.ts` / `reports.test.ts` /
`smoke.test.ts`:

1. Import what you need from `tests/helpers/test-client.ts` — `serviceClient`,
   `rpc` (a `post_journal_entry`/`complete_sale`/etc. wrapper with a retry for
   the entry_no race — see its header comment), `TEST_RUN_ID`, `uniqueSuffix`,
   `getTestUserIds`, `createTestMedicine`, `createTestBatch`,
   `createTestSupplier`, `createTestCustomer`, `createTestPO`, `approveTestPO`,
   `getMedicineStock`, `getBatchQty`, `getJournalEntry`, `getJournalEntryById`,
   `getJournalLines`, `findLine`, `computeBalance`, `assertBalanced`,
   `cleanupJournalEntries`, `closePool`. Only add a new factory to
   `test-client.ts` if an existing one genuinely doesn't cover what you need —
   most test files define their own small local helpers (e.g. `callCompleteSale`)
   for anything specific to that file's scenarios, rather than growing
   `test-client.ts` unboundedly.
2. Declare `Set<string>` id-tracking variables at the top of your `describe`
   block(s) for every table you'll create rows in, and push to them the moment
   a row is successfully created — including the journal entry id for
   anything that posts one (see the isolation section above).
3. Write a top-level `afterAll` that deletes rows in FK-safe order: anything
   with a `journal_entry_id` FK (expenses, payments, returns) *before*
   calling `cleanupJournalEntries()`, then the rest. Wrap each step so one
   failure doesn't block the others, and always call `closePool()` in a
   `finally`.
4. If you need to test a server action's business logic and it requires an
   authenticated session (most `'use server'` files do — they read cookies
   via `createClient()` from `@/lib/supabase/server`), don't try to fake a
   session. Either replicate the exact table operations the action performs
   directly against `serviceClient` (the established pattern — see
   `postExpense`/`adjustStockDirect` in `accounting.test.ts`/`inventory.test.ts`
   for examples), or, if the underlying logic is itself an RPC, call the RPC
   directly. Document anything you genuinely can't exercise this way as a
   coverage gap rather than skipping it silently.
5. Before writing assertions about what a function *should* do, read its
   live definition (`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE
   proname = '...'`) rather than trusting a migration file or a written spec
   — migrations can drift from what's actually deployed, and specs can be
   wrong about implementation details (Phase 16B found FEFO was UI-only and
   `adjustStock()` takes an absolute quantity; Phase 16C found a real report
   bug this way). If what you find differs from what was assumed, write the
   test for the real behavior and add a comment explaining the discrepancy —
   don't silently "fix" your test's expectation to match the wrong assumption,
   and don't silently skip it either.
