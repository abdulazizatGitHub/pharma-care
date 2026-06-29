/**
 * Session 13A verification — make a test sale with discount, then
 * query the journal entry to confirm 4900 debit line appears.
 *
 * Run: node scripts/test_sale_discount.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mrnjrxvlrscupalpwauh.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ybmpyeHZscnNjdXBhbHB3YXVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDY0ODA3OSwiZXhwIjoyMDk2MjI0MDc5fQ.m8VCuDIKMQQSCuvQ_0lYG3GHvmmTi7ylxsM_uUe530E';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function sep(label) {
  console.log('\n' + '='.repeat(60));
  console.log(label);
  console.log('='.repeat(60));
}

async function main() {

  // ── 1. Find a usable stock batch ──────────────────────────────
  sep('1. Finding a sellable stock batch');

  const { data: batches, error: batchErr } = await sb
    .from('stock_batches')
    .select('id, medicine_id, batch_no, quantity, purchase_price, mrp, sale_price')
    .eq('is_deleted', false)
    .gt('quantity', 2)
    .not('mrp', 'is', null)
    .not('sale_price', 'is', null)
    .order('quantity', { ascending: false })
    .limit(1);

  if (batchErr || !batches?.length) {
    // Fallback: any batch with quantity > 0 and mrp set (sale_price may be null)
    const { data: fallback, error: fbErr } = await sb
      .from('stock_batches')
      .select('id, medicine_id, batch_no, quantity, purchase_price, mrp, sale_price')
      .eq('is_deleted', false)
      .gt('quantity', 2)
      .not('mrp', 'is', null)
      .limit(1);

    if (fbErr || !fallback?.length) {
      console.error('No usable batch found:', batchErr ?? fbErr);
      process.exit(1);
    }
    batches.push(...fallback);
  }

  const batch = batches[0];
  const unitPrice = batch.sale_price ?? batch.mrp;
  console.log('Batch found:', JSON.stringify(batch, null, 2));
  console.log('Unit price to use:', unitPrice);

  // ── 2. Find a pharmacist profile ─────────────────────────────
  sep('2. Finding a cashier (pharmacist profile)');

  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, email, role')
    .eq('is_deleted', false)
    .eq('role', 'pharmacist')
    .limit(1);

  let cashierId;
  if (profErr || !profiles?.length) {
    // Fallback: any profile
    const { data: anyP, error: anyErr } = await sb
      .from('profiles')
      .select('id, email, role')
      .eq('is_deleted', false)
      .limit(1);
    if (anyErr || !anyP?.length) {
      console.error('No profiles found:', profErr ?? anyErr);
      process.exit(1);
    }
    cashierId = anyP[0].id;
    console.log('Using profile (fallback):', anyP[0]);
  } else {
    cashierId = profiles[0].id;
    console.log('Using pharmacist:', profiles[0]);
  }

  // ── 3. Call complete_sale with a discount of 10 ──────────────
  sep('3. Calling complete_sale RPC (qty=1, discount=10)');

  const discountAmt = 10;
  const items = [
    {
      medicine_id:  batch.medicine_id,
      batch_id:     batch.id,
      quantity:     1,
      unit_price:   unitPrice,
      discount_pct: 0,
    },
  ];

  console.log('RPC params:', JSON.stringify({
    p_cashier_id:   cashierId,
    p_customer_id:  null,
    p_payment_type: 'cash',
    p_items:        items,
    p_discount_amt: discountAmt,
    p_bag_charge:   0,
    p_amount_paid:  unitPrice + 100,
    p_notes:        'SESSION 13A VERIFICATION TEST',
  }, null, 2));

  const { data: saleResult, error: saleErr } = await sb.rpc('complete_sale', {
    p_cashier_id:   cashierId,
    p_customer_id:  null,
    p_payment_type: 'cash',
    p_items:        items,
    p_discount_amt: discountAmt,
    p_bag_charge:   0,
    p_amount_paid:  unitPrice + 100,
    p_notes:        'SESSION 13A VERIFICATION TEST',
  });

  if (saleErr) {
    console.error('complete_sale FAILED:', saleErr);
    process.exit(1);
  }

  console.log('Sale result:', JSON.stringify(saleResult, null, 2));

  // ── 4. Run the verification SELECT ───────────────────────────
  sep('4. Querying journal entry for the new sale');

  // Use the receipt_no from the sale result to find the journal entry
  const receiptNo = saleResult?.receipt_no;
  console.log('Receipt no:', receiptNo);

  const { data: jeRows, error: jeErr } = await sb
    .from('journal_entries')
    .select(`
      entry_no,
      description,
      journal_lines (
        direction,
        amount,
        amount_pkr,
        accounts ( code, name )
      )
    `)
    .eq('reference_type', 'sale')
    .order('created_at', { ascending: false })
    .limit(1);

  if (jeErr) {
    console.error('Journal entries query failed:', jeErr);
    process.exit(1);
  }

  if (!jeRows?.length) {
    console.error('No journal entry found for this sale!');
    process.exit(1);
  }

  const je = jeRows[0];
  console.log('\nJournal Entry:', je.entry_no, '—', je.description);
  console.log('\nLines:');
  console.log('─'.repeat(70));
  console.log(
    'entry_no'.padEnd(20),
    'direction'.padEnd(10),
    'code'.padEnd(6),
    'name'.padEnd(30),
    'amount'
  );
  console.log('─'.repeat(70));

  let hasDiscount = false;
  for (const line of je.journal_lines ?? []) {
    const code = line.accounts?.code ?? '?';
    const name = line.accounts?.name ?? '?';
    console.log(
      je.entry_no.padEnd(20),
      line.direction.padEnd(10),
      code.padEnd(6),
      name.padEnd(30),
      line.amount
    );
    if (code === '4900') hasDiscount = true;
  }

  console.log('─'.repeat(70));
  console.log('\n✔ 4900 discount line present:', hasDiscount);

  if (!hasDiscount) {
    console.error('\n✘ FAIL — 4900 line missing. Migration 032 may not be active.');
    process.exit(1);
  } else {
    console.log('\n✔ PASS — complete_sale() correctly posts separate 4900 discount debit.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
