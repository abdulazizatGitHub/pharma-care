# PharmaCare — Phase 4B: PO Edit Lifecycle, Force Close & Soft Delete

## Overview

This phase hardens the Purchase Order lifecycle with three deliverables:

1. **Edit permissions by state** — always-visible inline editing on the PO detail page, Edit action in the PO list table, gated strictly by PO status
2. **Force Close PO** — formal mechanism to close a `partially_received` PO when remaining items will not arrive, with shortage recorded for supplier analysis
3. **Soft delete + Revert** — cancelled POs can be soft-deleted (hidden from list) or reverted to Draft; all destructive actions confirmed via dialog

---

## 1. Status Permission Matrix

This is the single source of truth for what is allowed at each status. The agent must derive all conditional rendering from this matrix.

| Status | Edit Line Items | Add Line Item | Remove Line Item | Revert to Draft | Cancel | Force Close | Soft Delete |
|---|---|---|---|---|---|---|---|
| `draft` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `pending_approval` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `confirmed` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `partially_received` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (superadmin only) | — |
| `received` | ✗ | ✗ | ✗ | ✗ | ✗ | — | — |
| `closed_short` | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✓ (superadmin only) |
| `cancelled` | ✗ | ✗ | ✗ | ✓ | — | — | ✓ (superadmin only) |

**Role restriction:** All write actions require `canWrite` permission. Force Close, Soft Delete, and Revert Delete are superadmin-only regardless of `canWrite`.

**"Editable state"** (used throughout this spec) = `draft` OR `pending_approval` OR `confirmed`.

---

## 2. Database Changes — Migration 025

### 2.1 New `closed_short` status

The current `purchase_orders.status` CHECK constraint (as of migration 024) covers:
`draft`, `pending_approval`, `confirmed`, `partially_received`, `received`, `cancelled`

Add `closed_short`:

```sql
-- Drop existing constraint and re-add with new value
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft', 'pending_approval', 'confirmed',
    'partially_received', 'received',
    'cancelled', 'closed_short'
  ));
```

### 2.2 New columns on `purchase_orders`

```sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS shortage_notes TEXT,
  ADD COLUMN IF NOT EXISTS closed_short_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_short_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);
```

> **Agent note:** `is_deleted BOOLEAN DEFAULT FALSE` follows existing convention on this table (migration 001). Verify it already exists with `\d purchase_orders` before adding. Do NOT add it twice.

### 2.3 New RPC: `force_close_po()`

```sql
CREATE OR REPLACE FUNCTION force_close_po(
  p_po_id UUID,
  p_closed_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- Lock the row
  SELECT status INTO v_current_status
  FROM purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_current_status <> 'partially_received' THEN
    RAISE EXCEPTION 'Only partially_received POs can be force closed. Current status: %', v_current_status;
  END IF;

  UPDATE purchase_orders
  SET
    status = 'closed_short',
    shortage_notes = p_notes,
    closed_short_at = NOW(),
    closed_short_by = p_closed_by,
    updated_at = NOW()
  WHERE id = p_po_id;
END;
$$;
```

### 2.4 RLS Policy for new columns

The existing RLS policy on `purchase_orders` covers row-level access. No new policy needed — the new columns inherit the same row permissions. `SECURITY DEFINER` on the RPC bypasses RLS correctly for the atomic update.

---

## 3. Server Actions

All actions live in `app/actions/purchase-orders.ts`. All follow the existing pattern: verify session + role, Zod validate, logAction(), return `{ data, error }`.

### 3.1 `forceClosePO(poId, notes)`

```typescript
// Zod schema
const ForceCloseSchema = z.object({
  poId: z.string().uuid(),
  notes: z.string().max(500).optional(),
})

// Action
export async function forceClosePO(poId: string, notes?: string) {
  // 1. Verify session — superadmin only
  // 2. Zod validate
  // 3. Call force_close_po RPC
  // 4. logAction(ACTION_TYPES.PO_FORCE_CLOSED, { po_id: poId, notes })
  // 5. Return { data, error }
}
```

### 3.2 `softDeletePO(poId)`

```typescript
export async function softDeletePO(poId: string) {
  // 1. Verify session — superadmin only
  // 2. Fetch PO — must be status: 'cancelled' or 'closed_short'
  //    If not, return error: 'Only cancelled or closed_short POs can be deleted'
  // 3. Update: is_deleted=true, deleted_at=NOW(), deleted_by=userId
  // 4. logAction(ACTION_TYPES.PO_DELETED, { po_id: poId })
  // 5. Return { data, error }
}
```

### 3.3 `revertCancelledToDraft(poId)`

> This may already exist for confirmed → draft. Extend it to also accept `cancelled` status as a valid source state.

```typescript
export async function revertToDraft(poId: string) {
  // Valid source statuses: 'confirmed', 'pending_approval', 'cancelled'
  // Guard: if any GRN exists for this PO, REJECT (GRN means stock was touched)
  //   SELECT COUNT(*) FROM grns WHERE po_id = poId
  // Update: status = 'draft'
  // logAction(ACTION_TYPES.PO_REVERTED_TO_DRAFT, { po_id: poId, from_status: previousStatus })
}
```

> **Agent note:** Check if `revertToDraft` already handles `pending_approval` and `confirmed`. If so, just add `cancelled` to the valid source statuses array. Do NOT create a duplicate function.

### 3.4 `updatePOItem(itemId, qty, unitPrice)` — verify existing

This should already exist from Phase 4. Verify it:
- Validates the parent PO is in an editable state before updating
- Returns updated line total
- Does NOT call logAction on every keystroke — only on successful save

### 3.5 `deletePOItem(itemId)` — verify existing

Verify it checks parent PO is in editable state. If it doesn't exist, create it:

```typescript
export async function deletePOItem(itemId: string) {
  // 1. Fetch po_item → get po_id
  // 2. Verify parent PO status is in editable state
  // 3. Soft-delete or hard-delete the line item
  //    (po_items do not have is_deleted by convention — hard delete is fine here
  //     since the PO audit log records the state at each point)
  // 4. logAction(ACTION_TYPES.PO_ITEM_REMOVED, { item_id: itemId, po_id })
}
```

---

## 4. Per-Line Item Receipt Status (Computed, No Schema Change)

On the PO detail page for `partially_received`, `received`, and `closed_short` POs, each line item must show its fulfillment status. This is **computed from existing GRN data** — no schema change required.

### Query Logic

For each `po_item`, sum `quantity_received` across all `grn_items` where `medicine_id` matches and the parent GRN belongs to this PO:

```sql
SELECT
  poi.id,
  poi.medicine_id,
  poi.quantity AS ordered_qty,
  poi.unit_price,
  COALESCE(SUM(gi.quantity_received), 0) AS received_qty
FROM po_items poi
LEFT JOIN grn_items gi ON gi.medicine_id = poi.medicine_id
  AND gi.grn_id IN (
    SELECT id FROM grns WHERE po_id = poi.po_id
  )
WHERE poi.po_id = $1
GROUP BY poi.id, poi.medicine_id, poi.quantity, poi.unit_price
```

> **Agent note:** Add this as a server action `getPOItemsWithReceipt(poId)` that runs this query and returns the enriched items. Use this instead of the plain `po_items` fetch on the detail page for non-editable states.

### Status Badges (derived from received_qty vs ordered_qty)

| Condition | Badge | Color |
|---|---|---|
| `received_qty === 0` | Not Received | Red / destructive |
| `received_qty > 0 && received_qty < ordered_qty` | Partial (X of Y) | Amber / warning |
| `received_qty === ordered_qty` | Fully Received | Green / success |

Show this badge in a new STATUS column on the line items table, only visible for `partially_received`, `received`, and `closed_short` POs.

---

## 5. UI Changes

### 5.1 PO List Table (`POTable.tsx`)

**ACTIONS column — render rules:**

```
if status is in editable states AND canWrite:
  show [Edit ✏] — links to /[role]/purchase-orders/[id]
  (this is just navigation to the detail page; editing happens there)

else:
  show [View ↗]

Additionally (below or alongside primary action):

if status === 'confirmed' AND canWrite:
  show [Revert to Draft] button — triggers confirmation dialog

if status === 'cancelled' AND isSuperAdmin:
  show [Revert to Draft] button — triggers confirmation dialog
  show [Delete] button — triggers confirmation dialog (soft delete)

if status === 'closed_short' AND isSuperAdmin:
  show [Delete] button — triggers confirmation dialog (soft delete)
```

**Status badge for `closed_short`:** Add to the existing status badge map. Use a neutral grey/slate color with label "Closed (Short)".

**Filters:** Add `Closed` tab alongside existing All / Draft / Pending / Confirmed / Partial / Received / Cancelled. This tab shows `closed_short` POs.

> Do NOT show soft-deleted POs (is_deleted=true) in any tab, including All. They are gone from the UI permanently.

---

### 5.2 PO Detail Page

#### Header action bar (top-right of PO card)

Render buttons based on status:

**Editable states (draft / pending_approval / confirmed):**
- [Cancel PO] — confirmation dialog required
- [Save] — only visible if unsaved changes exist (track dirty state)

**confirmed only (in addition to above):**
- [Revert to Draft] — confirmation dialog required

**partially_received only:**
- [Force Close PO] — superadmin only — confirmation dialog required (see section 6)

**cancelled only (superadmin only):**
- [Revert to Draft] — confirmation dialog required
- [Delete PO] — confirmation dialog required

**received / closed_short:** No action buttons. Read-only banner (see below).

#### Read-only banners

Display a subtle info banner below the PO header for non-editable states:

| Status | Banner text |
|---|---|
| `received` | "This purchase order has been fully received and cannot be modified." |
| `closed_short` | "This purchase order was closed with shortage. [shortage_notes if present]" |
| `cancelled` | "This purchase order is cancelled." |
| `partially_received` | "This order has been partially received. Record additional GRNs or force close if remaining items will not arrive." |

---

#### Line Items section — editable state

For POs in editable states, the line items table shows always-visible input fields:

| Column | Editable state | Non-editable state |
|---|---|---|
| Medicine | Text (read-only — medicine cannot change after creation; use trash icon to remove and re-add) | Plain text |
| QTY | `<input type="number" min="1">` — saves on blur | Plain text |
| Unit Price | `<input type="number" min="0" step="0.01">` — saves on blur | Plain text |
| Total | Computed display (qty × price), updates live as user types | Plain text |
| Actions | Trash/delete icon per row | — |

**Save behavior:**
- On blur or Enter: validate (qty ≥ 1, price ≥ 0), if unchanged skip server call, else call `updatePOItem()` optimistically, roll back on error
- Show a subtle inline spinner on the row during save
- Do NOT show a toast for every field save — only show error toasts on failure
- Show a success toast only if user explicitly clicks a [Save Changes] button (optional, for users who want confirmation)

**Add line item row:**
- Below the last item, show a persistent "+ Add Medicine" row with a medicine search dropdown and quantity/price fields
- On submit: call `addPOItem()`, clear the row, focus medicine search again
- This row only appears in editable states

**Delete line item:**
- Trash icon on each row (editable states only)
- No confirmation dialog for line item delete — it is reversible by re-adding the item and the stakes are low
- Immediately removes the row optimistically, calls `deletePOItem()`, rolls back on error

---

#### Line Items section — partially_received / received / closed_short

Show the enriched item list with receipt status badges (from `getPOItemsWithReceipt()`):

```
MEDICINE          QTY ORDERED    RECEIVED    STATUS            UNIT PRICE    TOTAL
Panadol 500mg     10             10          ✓ Fully Received   Rs 50.00     Rs 500.00
Brufen 400mg      10             7           ⚠ Partial (7/10)   Rs 30.00     Rs 300.00
Augmentin 625mg   10             0           ✗ Not Received     Rs 120.00    Rs 1,200.00
```

All cells are read-only. No inputs, no trash icons.

---

#### GRN History section

Already exists. No changes needed for this section — GRNs are immutable once recorded.

---

### 5.3 Force Close PO — Detail Modal

When superadmin clicks [Force Close PO] on a `partially_received` PO:

Show a modal (not a simple confirm dialog — this needs a notes field):

```
┌─────────────────────────────────────────────────────┐
│  Close PO with Shortage                             │
├─────────────────────────────────────────────────────┤
│  The following items will be marked as undelivered: │
│                                                     │
│  • Brufen 400mg — 3 units short                     │
│  • Augmentin 625mg — 10 units not received          │
│                                                     │
│  Reason / Notes (optional)                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ e.g. Supplier confirmed shortage, no ETA   │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  This action cannot be undone. The PO will be       │
│  marked as Closed (Short) and no further GRNs       │
│  can be recorded against it.                        │
│                                                     │
│  [Cancel]                    [Close with Shortage]  │
└─────────────────────────────────────────────────────┘
```

The "undelivered items" list is computed from `getPOItemsWithReceipt()` — show only items where `received_qty < ordered_qty`.

On confirm: call `forceClosePO(poId, notes)`, redirect to PO detail (now read-only), show success toast.

---

## 6. Confirmation Dialogs

Rule: dialogs for state changes and deletions. No dialogs for inline field edits.

| Action | Dialog required | Dialog message |
|---|---|---|
| Cancel PO | ✓ | "Cancel this purchase order? It can be reverted to draft later." |
| Revert to Draft | ✓ | "Revert this PO to draft? It will need to go through approval again." |
| Force Close PO | ✓ (full modal, see 5.3) | Full modal with shortage summary + notes field |
| Soft Delete PO | ✓ | "Permanently hide this PO? It will no longer appear in any list. This cannot be undone from the UI." |
| Delete Line Item | ✗ | No dialog — reversible by re-adding |

**Dialog component:** Use the existing shadcn/ui `AlertDialog` component already in the project. Do not build a custom dialog.

**Button labels must match the action exactly:**
- Destructive actions: red/destructive variant button with the exact action name ("Cancel PO", "Delete PO", "Close with Shortage")
- Safe actions: default variant ("Revert to Draft")
- Always provide a neutral cancel option

---

## 7. Audit Log Actions

Add these to `lib/audit.ts` ACTION_TYPES if not already present:

```typescript
PO_FORCE_CLOSED = 'PO_FORCE_CLOSED',
PO_DELETED = 'PO_DELETED',           // soft delete
PO_REVERTED_TO_DRAFT = 'PO_REVERTED_TO_DRAFT',  // may already exist
PO_ITEM_REMOVED = 'PO_ITEM_REMOVED',
```

---

## 8. Implementation Phases

Break this into two agent sessions to avoid large diffs:

### Session A — DB + server actions (no UI)
1. Migration 025 (new status, new columns, force_close_po RPC)
2. Server actions: `forceClosePO`, `softDeletePO`, extend `revertToDraft` for cancelled source
3. Server action: `getPOItemsWithReceipt` query
4. Audit log entries
5. Verify: run verification SQL (see below), tsc clean

### Session B — UI only (no DB changes)
1. `POTable.tsx` — Edit/View action logic, new action buttons, closed_short badge, Closed tab filter
2. `PODetail` page — always-visible inputs for editable states, read-only banners, receipt status badges, Force Close modal, confirmation dialogs
3. Full test suite re-run
4. tsc clean + next build

---

## 9. Verification SQL (run after Session A migration)

```sql
-- 1. Confirm new status accepted
SELECT status FROM purchase_orders WHERE status = 'closed_short' LIMIT 1;
-- (no rows expected yet — just confirm no constraint error on this value)
INSERT INTO purchase_orders (supplier_id, status, created_by, ...) 
  VALUES (..., 'closed_short', ...) -- test then rollback

-- 2. Confirm new columns exist
SELECT 
  column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'purchase_orders'
  AND column_name IN (
    'shortage_notes', 'closed_short_at', 'closed_short_by',
    'deleted_at', 'deleted_by', 'is_deleted'
  );
-- Expected: 6 rows (or 5 if is_deleted already existed)

-- 3. Confirm RPC exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'force_close_po';
-- Expected: 1 row

-- 4. Test force_close_po rejects wrong status
SELECT force_close_po(
  (SELECT id FROM purchase_orders WHERE status = 'confirmed' LIMIT 1),
  (SELECT id FROM profiles WHERE role = 'superadmin' LIMIT 1),
  'Test notes'
);
-- Expected: EXCEPTION 'Only partially_received POs can be force closed'

-- 5. Confirm ACTION_TYPES in audit_logs (after first use)
-- Run after triggering a force close in the UI
SELECT action_type FROM audit_logs 
WHERE action_type = 'PO_FORCE_CLOSED' 
ORDER BY created_at DESC LIMIT 1;
```

---

## 10. What is explicitly NOT in scope

- Editing line items on `partially_received`, `received`, or `closed_short` POs — these are immutable because GRN data exists
- Hard deleting any PO — soft delete only
- Editing GRN records after they are posted — GRNs are immutable (correcting entries are a future feature)
- Reverting a `received` PO — inventory has moved, journal entries posted; reversal is a future GRN amendment feature
- Any changes to `complete_grn()` RPC — it is correct as-is from migration 024

---

## Spec Version
Created: 2026-06-22
Supersedes: Phase 4 PO inline edit (partial implementation)
Migration sequence: 025 (follows 024 — Partial GRN)