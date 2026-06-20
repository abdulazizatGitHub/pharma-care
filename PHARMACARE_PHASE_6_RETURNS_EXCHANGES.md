# PHARMACARE — PHASE 6: RETURNS & EXCHANGES
> **Version:** 1.0  
> **Architecture:** Policy-driven approval, atomic reversal RPC, full ledger integration  
> **Depends on:** Phase 5 (POS), Phase 7 (Ledger)  
> **Read ALL previous spec documents before writing any code.**

---

## 0. AGENT INSTRUCTIONS

This module reverses financial transactions. The same rigor that applies to 
the ledger module (Phase 7) applies here — every return/exchange must be 
atomic and must balance in the double-entry ledger.

Non-negotiable rules:
- Returns/exchanges MUST use a single atomic Postgres RPC (`process_return()`)
  — never separate client-side insert/update calls
- Every return reverses: stock quantity, sale record status, journal entries
  (revenue reversal + COGS reversal), and cash book — in ONE transaction
- Policy checks happen BOTH at the UI layer (instant feedback) AND inside
  the RPC (authoritative enforcement) — UI checks alone are not sufficient
- Returned stock goes back to the EXACT batch it was sold from — the batch_id
  is already stored on sale_items, so this is a lookup, not a guess
- Controlled/Schedule B medicines are NEVER returnable regardless of policy
  overrides — this is hardcoded, not configurable

---

## 1. POLICY SYSTEM

### 1.1 Policy settings (stored in existing `settings` table)

```sql
return_window_days          -- default 3 — days since sale within which 
                             -- return is allowed without approval
return_requires_receipt     -- default true
return_controlled_allowed   -- default false — HARDCODED false in RPC 
                             -- regardless of this setting (safety override)
return_opened_pack_allowed  -- default false — cashier self-declares 
                             -- "pack opened" checkbox at return time
return_auto_approve_limit   -- default 1000 (PKR) — returns above this 
                             -- value always need approval regardless of 
                             -- window/pack status
exchange_window_days        -- default 7
exchange_price_diff_payer   -- default 'either' — who settles price 
                             -- difference: 'customer', 'pharmacy', 'either'
```

All editable from `/superadmin/settings` — new "Returns & Exchanges" section.
Changes take effect immediately — policies are read fresh on every return
request, never cached.

### 1.2 Policy evaluation (real-time, at return time)

When a pharmacist initiates a return, the system evaluates:

```
1. Is the medicine Schedule B/Controlled? 
   → YES: DENY immediately, no override possible

2. Is the sale within return_window_days?
   → NO: requires approval (reason: "window expired")

3. Is the pack marked as opened AND return_opened_pack_allowed = false?
   → YES: requires approval (reason: "opened pack")

4. Is the return value > return_auto_approve_limit?
   → YES: requires approval (reason: "exceeds auto-approve limit")

5. None of the above triggered?
   → AUTO-APPROVED — processes immediately, no admin involvement
```

If multiple reasons trigger, all reasons are recorded and shown to the
approver. A pharmacist sees the policy check result in real time as they
build the return — before submitting.

### 1.3 Approval workflow

```
AUTO-APPROVED  → process_return() runs immediately, return completed
PENDING        → return request saved as 'pending_approval'
                  Stock NOT yet adjusted, ledger NOT yet posted
                  Superadmin sees it in an approval queue
                  Superadmin can [Approve] or [Deny] with a note
                  On Approve: process_return() runs now
                  On Deny: request marked 'denied', nothing changes
```

---

## 2. DATABASE SCHEMA — Migration 019

### 2.1 returns table (new)

```sql
CREATE TABLE returns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_no       TEXT NOT NULL UNIQUE,  -- RET-YYYYMMDD-XXXX
  original_sale_id UUID NOT NULL REFERENCES sales(id),
  
  return_type     TEXT NOT NULL CHECK (return_type IN ('return', 'exchange')),
  
  -- Policy evaluation results
  status          TEXT NOT NULL DEFAULT 'pending_approval' CHECK (
                    status IN ('auto_approved', 'pending_approval', 
                               'approved', 'denied', 'completed')
                  ),
  policy_flags    JSONB,  -- ['window_expired', 'opened_pack', 'exceeds_limit']
  
  -- Financial
  refund_amount   NUMERIC(12,2) DEFAULT 0,  -- cash refunded to customer
  charge_amount   NUMERIC(12,2) DEFAULT 0,  -- additional charge (exchange upgrade)
  net_amount      NUMERIC(12,2) NOT NULL,   -- refund_amount - charge_amount
  
  -- For exchanges: link to the new sale created
  exchange_sale_id UUID REFERENCES sales(id),
  
  reason          TEXT NOT NULL,  -- why customer is returning
  pack_opened     BOOLEAN DEFAULT FALSE,  -- cashier self-declaration
  
  -- Approval trail
  requested_by    UUID REFERENCES profiles(id),
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  denial_reason   TEXT,
  
  -- Journal reference
  journal_entry_id UUID REFERENCES journal_entries(id),
  
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at    TIMESTAMPTZ,
  is_deleted      BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_returns_sale ON returns(original_sale_id);
CREATE INDEX idx_returns_status ON returns(status);
```

### 2.2 return_items table (new)

```sql
CREATE TABLE return_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id       UUID NOT NULL REFERENCES returns(id),
  
  -- Original sale item being returned
  sale_item_id    UUID NOT NULL REFERENCES sale_items(id),
  medicine_id     UUID NOT NULL REFERENCES medicines(id),
  batch_id        UUID NOT NULL REFERENCES stock_batches(id),
  
  quantity_returned INTEGER NOT NULL CHECK (quantity_returned > 0),
  unit_price        NUMERIC(10,2) NOT NULL,  -- price at original sale
  line_refund       NUMERIC(12,2) NOT NULL,  -- quantity × unit_price
  
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### 2.3 exchange_items table (new — for the new items in an exchange)

```sql
CREATE TABLE exchange_items (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id       UUID NOT NULL REFERENCES returns(id),
  
  medicine_id     UUID NOT NULL REFERENCES medicines(id),
  batch_id        UUID NOT NULL REFERENCES stock_batches(id),
  
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL,
  line_total      NUMERIC(12,2) NOT NULL,
  
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### 2.4 sales table — add return tracking columns

```sql
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS return_status TEXT DEFAULT 'none' CHECK (
    return_status IN ('none', 'partial', 'full')
  ),
  ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(12,2) DEFAULT 0;
```

### 2.5 Settings seed

```sql
INSERT INTO settings (key, value, label) VALUES
  ('return_window_days', '3', 
   'Days after sale within which returns are auto-approved'),
  ('return_requires_receipt', 'true', 
   'Require receipt number to process a return'),
  ('return_controlled_allowed', 'false', 
   'Allow returns of controlled/Schedule B medicines (hardcoded override: always false)'),
  ('return_opened_pack_allowed', 'false', 
   'Allow returns of opened packs without approval'),
  ('return_auto_approve_limit', '1000', 
   'Returns above this value (PKR) always require approval'),
  ('exchange_window_days', '7', 
   'Days after sale within which exchanges are allowed'),
  ('exchange_price_diff_payer', 'either', 
   'Who can settle price difference in exchange: customer, pharmacy, either')
ON CONFLICT (key) DO NOTHING;
```

---

## 3. THE ATOMIC RPC — process_return()

```sql
CREATE OR REPLACE FUNCTION process_return(
  p_original_sale_id  UUID,
  p_return_items       JSONB,  -- [{sale_item_id, quantity_returned}]
  p_exchange_items      JSONB,  -- [{medicine_id, batch_id, quantity, unit_price}] or NULL
  p_reason             TEXT,
  p_pack_opened        BOOLEAN,
  p_requested_by       UUID,
  p_force_status       TEXT DEFAULT NULL  -- used when superadmin approves a pending return
)
RETURNS JSONB AS $$
DECLARE
  v_return_id      UUID;
  v_return_no      TEXT;
  v_item           JSONB;
  v_sale_item      RECORD;
  v_total_refund   NUMERIC(12,2) := 0;
  v_total_charge   NUMERIC(12,2) := 0;
  v_net            NUMERIC(12,2);
  v_status         TEXT;
  v_policy_flags   JSONB := '[]'::JSONB;
  v_sale_date      DATE;
  v_window_days    INT;
  v_auto_limit     NUMERIC;
  v_opened_allowed BOOLEAN;
  v_has_controlled BOOLEAN;
  v_exchange_sale_id UUID;
BEGIN
  -- 1. Fetch sale date and check controlled substance ban (HARDCODED)
  SELECT created_at::DATE INTO v_sale_date FROM sales WHERE id = p_original_sale_id;

  SELECT EXISTS (
    SELECT 1 FROM return_items_check rc -- conceptual; actual check below
  ) INTO v_has_controlled; -- placeholder, replaced by per-item check in loop

  -- 2. Read policy settings
  SELECT value::INT INTO v_window_days FROM settings WHERE key = 'return_window_days';
  SELECT value::NUMERIC INTO v_auto_limit FROM settings WHERE key = 'return_auto_approve_limit';
  SELECT value::BOOLEAN INTO v_opened_allowed FROM settings WHERE key = 'return_opened_pack_allowed';

  -- 3. Validate each return item — check controlled status, calc refund
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    SELECT si.*, m.schedule INTO v_sale_item
    FROM sale_items si
    JOIN medicines m ON m.id = si.medicine_id
    WHERE si.id = (v_item->>'sale_item_id')::UUID;

    IF v_sale_item.schedule IN ('controlled', 'narcotics') THEN
      RAISE EXCEPTION 'Controlled/narcotic medicines cannot be returned (medicine: %)', v_sale_item.medicine_id;
    END IF;

    IF (v_item->>'quantity_returned')::INT > v_sale_item.quantity THEN
      RAISE EXCEPTION 'Cannot return more than originally sold';
    END IF;

    v_total_refund := v_total_refund + (
      (v_item->>'quantity_returned')::INT * v_sale_item.unit_price
    );
  END LOOP;

  -- 4. Validate exchange items (if any) and calc charge
  IF p_exchange_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_exchange_items) LOOP
      v_total_charge := v_total_charge + (
        (v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC
      );
    END LOOP;
  END IF;

  v_net := v_total_refund - v_total_charge;

  -- 5. Policy evaluation (skip if p_force_status given — approval path)
  IF p_force_status IS NOT NULL THEN
    v_status := p_force_status;
  ELSE
    IF (CURRENT_DATE - v_sale_date) > v_window_days THEN
      v_policy_flags := v_policy_flags || '["window_expired"]'::JSONB;
    END IF;
    IF p_pack_opened AND NOT v_opened_allowed THEN
      v_policy_flags := v_policy_flags || '["opened_pack"]'::JSONB;
    END IF;
    IF v_total_refund > v_auto_limit THEN
      v_policy_flags := v_policy_flags || '["exceeds_limit"]'::JSONB;
    END IF;

    v_status := CASE WHEN jsonb_array_length(v_policy_flags) = 0 
                     THEN 'auto_approved' ELSE 'pending_approval' END;
  END IF;

  -- 6. Generate return number
  SELECT 'RET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*) + 1 FROM returns 
          WHERE return_no LIKE 'RET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%')::TEXT, 4, '0')
  INTO v_return_no;

  -- 7. Insert return header
  INSERT INTO returns (
    return_no, original_sale_id, return_type, status, policy_flags,
    refund_amount, charge_amount, net_amount, reason, pack_opened,
    requested_by
  ) VALUES (
    v_return_no, p_original_sale_id, 
    CASE WHEN p_exchange_items IS NOT NULL THEN 'exchange' ELSE 'return' END,
    v_status, v_policy_flags,
    v_total_refund, v_total_charge, v_net, p_reason, p_pack_opened,
    p_requested_by
  ) RETURNING id INTO v_return_id;

  -- 8. If pending approval: STOP HERE — no stock/ledger changes yet
  IF v_status = 'pending_approval' THEN
    RETURN jsonb_build_object(
      'return_id', v_return_id, 'return_no', v_return_no,
      'status', v_status, 'policy_flags', v_policy_flags
    );
  END IF;

  -- 9. AUTO-APPROVED or superadmin-APPROVED path: execute the reversal

  -- 9a. Insert return_items + restore stock to original batch
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items) LOOP
    SELECT si.* INTO v_sale_item FROM sale_items si 
    WHERE si.id = (v_item->>'sale_item_id')::UUID;

    INSERT INTO return_items (
      return_id, sale_item_id, medicine_id, batch_id,
      quantity_returned, unit_price, line_refund
    ) VALUES (
      v_return_id, v_sale_item.id, v_sale_item.medicine_id, v_sale_item.batch_id,
      (v_item->>'quantity_returned')::INT, v_sale_item.unit_price,
      (v_item->>'quantity_returned')::INT * v_sale_item.unit_price
    );

    -- Restore quantity to the EXACT original batch
    UPDATE stock_batches 
    SET quantity = quantity + (v_item->>'quantity_returned')::INT,
        updated_at = NOW()
    WHERE id = v_sale_item.batch_id;
  END LOOP;

  -- 9b. If exchange: insert exchange_items, create new sale, decrement stock
  IF p_exchange_items IS NOT NULL THEN
    -- Create the exchange sale record (simplified — reuses complete_sale pattern)
    INSERT INTO sales (
      receipt_no, cashier_id, payment_type, subtotal, total_amount,
      status, notes
    ) VALUES (
      'EXC-' || v_return_no, p_requested_by, 'cash', v_total_charge, v_total_charge,
      'completed', 'Exchange for ' || v_return_no
    ) RETURNING id INTO v_exchange_sale_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_exchange_items) LOOP
      INSERT INTO exchange_items (
        return_id, medicine_id, batch_id, quantity, unit_price, line_total
      ) VALUES (
        v_return_id, (v_item->>'medicine_id')::UUID, (v_item->>'batch_id')::UUID,
        (v_item->>'quantity')::INT, (v_item->>'unit_price')::NUMERIC,
        (v_item->>'quantity')::INT * (v_item->>'unit_price')::NUMERIC
      );

      UPDATE stock_batches 
      SET quantity = quantity - (v_item->>'quantity')::INT, updated_at = NOW()
      WHERE id = (v_item->>'batch_id')::UUID;
    END LOOP;

    UPDATE returns SET exchange_sale_id = v_exchange_sale_id WHERE id = v_return_id;
  END IF;

  -- 9c. Post the reversal journal entry (ledger + cash book integration)
  -- Reverses revenue + COGS proportionally; nets against any exchange charge
  PERFORM post_journal_entry(
    CURRENT_DATE,
    'Return ' || v_return_no,
    'sale_return',
    v_return_id,
    'PKR', 1.0,
    jsonb_build_array(
      jsonb_build_object('account_code','4000','direction','debit','amount', v_total_refund::TEXT),
      jsonb_build_object('account_code','1000','direction','credit','amount', v_net::TEXT)
    ) || CASE WHEN v_total_charge > 0 THEN
      jsonb_build_array(
        jsonb_build_object('account_code','4000','direction','credit','amount', v_total_charge::TEXT)
      ) ELSE '[]'::JSONB END,
    p_requested_by
  );

  -- 9d. Update original sale's return_status
  UPDATE sales SET 
    return_status = 'partial', -- determined by comparing total returned vs total sold
    returned_amount = returned_amount + v_total_refund
  WHERE id = p_original_sale_id;

  UPDATE returns SET status = 'completed', completed_at = NOW() WHERE id = v_return_id;

  RETURN jsonb_build_object(
    'return_id', v_return_id, 'return_no', v_return_no,
    'status', 'completed', 'net_amount', v_net,
    'exchange_sale_id', v_exchange_sale_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**NOTE TO AGENT:** The function body above is a structural reference, not 
final SQL — the agent must verify exact column names against the live 
schema (e.g. `medicines.schedule` may be named differently), correct the 
placeholder `return_items_check` logic (it was left as a conceptual marker), 
and decide the exact COGS-reversal lines based on the original sale's 
batch purchase_price. Treat Section 3 as a detailed blueprint, not 
copy-paste-ready code.

---

## 4. SERVER ACTIONS

File: `app/actions/returns.ts`

```typescript
evaluateReturnPolicy(saleId, items, packOpened)
  // Pure read — runs the same policy checks as the RPC, 
  // for instant UI feedback before submission
  // Returns { wouldAutoApprove, flags }

initiateReturn(saleId, items, exchangeItems?, reason, packOpened)
  // pharmacist, admin, superadmin
  // Calls process_return() RPC
  // Returns { returnId, returnNo, status, policyFlags }

getPendingReturns()
  // superadmin only
  // Returns all status='pending_approval' returns with full detail

approveReturn(returnId, note?)
  // superadmin only
  // Calls process_return() again with p_force_status='approved'
  // using the ORIGINAL stored items (re-fetch from return_items)
  // Completes the reversal now

denyReturn(returnId, reason)
  // superadmin only
  // Sets status='denied', denial_reason
  // No stock/ledger changes ever made

getSaleForReturn(receiptNo or saleId)
  // Looks up a completed sale + its items for the return UI
  // Includes: already-returned quantities (so cashier can't double-return)

getReturnHistory(filters?)
  // superadmin, admin
  // Paginated list of all returns
```

---

## 5. UI

### 5.1 Initiate return — entry point

At `/pharmacist/pos`, add a secondary action: **"Returns"** button 
(separate from the main sale flow, opens a dedicated panel/modal).

```
┌─────────────────────────────────────┐
│  Process Return                     │
│                                      │
│  Receipt Number: [SR-20260610-0042] │
│  [Look Up Sale]                     │
└─────────────────────────────────────┘
```

### 5.2 Return builder (after sale found)

```
Sale SR-20260610-0042 — 10 Jun 2026

Items in this sale:
☑ Panadol 500mg   2 sold, 0 returned   Qty to return: [2▼]
☐ Brufen 400mg    1 sold, 0 returned   Qty to return: [0▼]

Pack opened? ○ No  ● Yes

Reason for return: [dropdown: Customer changed mind / 
  Wrong medicine / Side effects / Other]

[ ] This is an exchange (add replacement items below)

  [If exchange checked — search bar to add new items]

Policy check (live):
  ✓ Within return window (3 days)
  ⚠ Pack marked as opened — requires approval

→ This return will be sent for SUPERADMIN APPROVAL

Refund amount: Rs 30.00
[Submit Return]
```

If exchange items added, show net settlement:
```
Return value:    Rs 30.00
Exchange value:  Rs 45.00
─────────────────────────
Customer pays:   Rs 15.00
```

### 5.3 Superadmin approval queue

`/superadmin/returns` — new page

```
Pending Returns (2)

RET-20260610-0001 · Sale SR-20260610-0042
Panadol 500mg ×2 · Rs 30.00 · Reason: Side effects
⚠ Opened pack
[View Detail] [Approve] [Deny]
```

### 5.4 Returns & Exchanges settings section

Add to `/superadmin/settings` as a new sidebar section, same pattern 
as existing sections:

```
Return window (days): [3]
Require receipt for return: [toggle]
Allow opened pack returns: [toggle]  
Auto-approve limit (PKR): [1000]
Exchange window (days): [7]
Price difference payer: [Customer / Pharmacy / Either]
```

---

## 6. EXECUTION PLAN

**Phase 6A** — Migration 019 (returns, return_items, exchange_items tables 
+ sales columns + settings seed). Show SQL, run manually, verify.

**Phase 6B** — `process_return()` RPC. This is the highest-risk function 
in the system — test extensively with manual SQL calls before any UI 
touches it. Test: auto-approved return, pending-approval return, approval 
flow, denial flow, exchange with customer-pays, exchange with pharmacy-pays.

**Phase 6C** — Server actions (`app/actions/returns.ts`).

**Phase 6D** — UI: return builder at POS, approval queue, settings section.

**Phase 6E** — Verification: full browser test of every policy branch, 
route tests, full suite run.

---

## 7. VERIFICATION CHECKLIST

```
[ ] Return within window, no opened pack, under limit → auto-approved
[ ] Return outside window → pending approval, flag shown
[ ] Return with opened pack → pending approval, flag shown
[ ] Return above auto-approve limit → pending approval, flag shown
[ ] Controlled medicine return attempt → hard denied, no override
[ ] Superadmin approves a pending return → stock + ledger updated
[ ] Superadmin denies a pending return → nothing changes
[ ] Exchange where customer owes difference → charge recorded correctly
[ ] Exchange where pharmacy owes difference → refund recorded correctly
[ ] Stock returns to EXACT original batch (verify batch_id match)
[ ] Journal entry balances (debits = credits) for every return
[ ] Cannot return more than originally sold
[ ] Cannot double-return the same sale_item
[ ] Original sale shows return_status updated correctly
```

---

*End of PHARMACARE_PHASE_6_RETURNS_EXCHANGES.md*