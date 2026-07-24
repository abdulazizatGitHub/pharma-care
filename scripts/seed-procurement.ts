import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

function requireDemoProject() {
  if (!SUPABASE_URL.includes('gnxtmvkfawfkmyyqebwi')) {
    console.error('REFUSING: wrong project ref:', SUPABASE_URL);
    process.exit(1);
  }
}

function supa() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SUPPLIERS = [
  { name: 'Medi-Tech Distributors', contact_person: 'Mr. Khalid Hussain', phone: '0300-8521467', email: 'orders@meditech-dist.pk', address: 'Plot 45, SITE Area, Karachi', credit_limit: 500000, credit_days: 30 },
  { name: 'PharmaPak Wholesale', contact_person: 'Ms. Nadia Siddiqui', phone: '0321-4789632', email: 'sales@pharmapak.com.pk', address: 'Shop 12, Urdu Bazaar, Lahore', credit_limit: 350000, credit_days: 15 },
  { name: 'Al-Shifa Medical Supplies', contact_person: 'Mr. Ibrahim Khan', phone: '0345-9123456', email: 'ibrahim@alshifa-medical.pk', address: 'Main Boulevard, DHA Phase 2, Lahore', credit_limit: 600000, credit_days: 45 },
  { name: 'National Pharma Distributors', contact_person: 'Mr. Asif Mehmood', phone: '0311-7654321', email: 'asif@nationalpharma.pk', address: 'Saddar Commercial Area, Rawalpindi', credit_limit: 400000, credit_days: 30 },
  { name: 'Capital Drug House', contact_person: 'Ms. Sana Tariq', phone: '0333-2145678', email: 'sana@capitaldrug.pk', address: 'F-8 Markaz, Islamabad', credit_limit: 450000, credit_days: 21 },
];

// PO narrative: supplier, order date, target total (informational only — actual total_amount
// is computed from items), status, items (medicine name -> quantity)
const POS = [
  { code: 'PO-001', supplier: 'Medi-Tech Distributors', date: '2026-04-03', status: 'received', items: [
    ['Amoxicillin 500mg Capsules (Amoxil)', 220], ['Ciprofloxacin 500mg Tablets (Cifran)', 200],
    ['Paracetamol 500mg Tablets (Panadol)', 500], ['Ibuprofen 400mg Tablets (Brufen)', 300],
    ['Omeprazole 20mg Capsules (Losec)', 200],
  ]},
  { code: 'PO-002', supplier: 'Al-Shifa Medical Supplies', date: '2026-04-08', status: 'received', items: [
    ['Amlodipine 5mg Tablets (Norvasc)', 150], ['Losartan 50mg Tablets (Cozaar)', 120],
    ['Atenolol 50mg Tablets (Tenormin)', 150], ['Atorvastatin 20mg Tablets (Lipitor)', 90],
    ['Metformin 500mg Tablets (Glucophage)', 130],
  ]},
  { code: 'PO-003', supplier: 'PharmaPak Wholesale', date: '2026-04-15', status: 'received', items: [
    ['Centrum Adults Tablets', 30], ['Neurobion Forte Tablets', 150],
    ['Vitamin D3 1000IU Tablets (D-Sol)', 60], ['Vitamin C 500mg Tablets (Redoxon)', 100],
    ['Calcium Carbonate 500mg Tablets (Caltrate)', 40],
  ]},
  { code: 'PO-004', supplier: 'Medi-Tech Distributors', date: '2026-05-06', status: 'received', items: [
    ['Amoxicillin 500mg Capsules (Amoxil)', 100], ['Cephalexin 500mg Capsules (Keflex)', 80],
    ['Cefixime 400mg Tablets (Cefix)', 60], ['Levofloxacin 500mg Tablets (Levaquin)', 40],
    ['Tramadol 50mg Capsules (Tramal)', 60],
  ]},
  { code: 'PO-005', supplier: 'National Pharma Distributors', date: '2026-05-14', status: 'received', items: [
    ['Salbutamol 100mcg Inhaler (Ventolin)', 50], ['Fluticasone 125mcg Inhaler (Flixotide)', 25],
    ['Budesonide 200mcg Inhaler (Pulmicort)', 20], ['Ciprofloxacin 0.3% Eye Drops (Ciloxan)', 40],
    ['Sodium Chloride 0.9% Eye Drops', 40],
  ]},
  { code: 'PO-006', supplier: 'Capital Drug House', date: '2026-05-22', status: 'partially_received', items: [
    ['Metformin 500mg Tablets (Glucophage)', 100], ['Glibenclamide 5mg Tablets (Daonil)', 80],
    ['Sitagliptin 100mg Tablets (Januvia)', 15], ['Insulin Glargine 100IU/ml (Lantus)', 10],
  ], excludeFromReceipt: ['Insulin Glargine 100IU/ml (Lantus)'] },
  { code: 'PO-007', supplier: 'Al-Shifa Medical Supplies', date: '2026-06-04', status: 'received', items: [
    ['Fusidic Acid 2% Cream (Fucidin)', 40], ['Mupirocin 2% Ointment (Bactroban)', 30],
    ['Clotrimazole 1% Cream (Canesten)', 60], ['Terbinafine 1% Cream (Lamisil)', 20],
  ]},
  { code: 'PO-008', supplier: 'PharmaPak Wholesale', date: '2026-06-18', status: 'received', items: [
    ['Ibuprofen 400mg Tablets (Brufen)', 150], ['Diclofenac 50mg Tablets (Voltaren)', 100],
    ['Omeprazole 20mg Capsules (Losec)', 80], ['Aluminium Hydroxide Suspension (Gaviscon)', 60],
    ['Domperidone 10mg Tablets (Motilium)', 60], ['Vitamin C 500mg Tablets (Redoxon)', 60],
  ]},
  { code: 'PO-009', supplier: 'Medi-Tech Distributors', date: '2026-06-25', status: 'confirmed', items: [
    ['Amoxicillin 500mg Capsules (Amoxil)', 120], ['Ciprofloxacin 500mg Tablets (Cifran)', 100],
    ['Amlodipine 5mg Tablets (Norvasc)', 100], ['Losartan 50mg Tablets (Cozaar)', 80],
    ['Atorvastatin 20mg Tablets (Lipitor)', 60],
  ]},
];

function purchasePriceFor(mrp: number): number {
  return Math.round(mrp * 0.62 * 100) / 100;
}

async function getAdminId(supabase: ReturnType<typeof supa>): Promise<string> {
  const { data, error } = await supabase.from('profiles').select('id').eq('role', 'admin').single();
  if (error || !data) { console.error('Could not find admin profile:', error?.message); process.exit(1); }
  return data.id;
}

async function main() {
  requireDemoProject();
  const supabase = supa();
  const step = process.argv[2];

  if (step === 'suppliers') {
    const { data, error } = await supabase.from('suppliers').insert(SUPPLIERS).select('id, name');
    if (error) { console.error('Supplier insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} suppliers.`);
    return;
  }

  if (step === 'pos') {
    const adminId = await getAdminId(supabase);
    const { data: suppliers, error: supErr } = await supabase.from('suppliers').select('id, name');
    if (supErr) { console.error(supErr.message); process.exit(1); }
    const supplierByName = new Map(suppliers!.map(s => [s.name, s.id]));

    const { data: meds, error: medErr } = await supabase.from('medicines').select('id, name, mrp');
    if (medErr) { console.error(medErr.message); process.exit(1); }
    const medByName = new Map(meds!.map(m => [m.name, m]));

    const rows = POS.map(po => {
      const total = po.items.reduce((sum, [name, qty]) => {
        const med = medByName.get(name as string);
        if (!med) throw new Error(`Medicine not found: ${name}`);
        return sum + purchasePriceFor(Number(med.mrp)) * (qty as number);
      }, 0);
      const supplierId = supplierByName.get(po.supplier);
      if (!supplierId) throw new Error(`Supplier not found: ${po.supplier}`);
      return {
        po_number: po.code,
        supplier_id: supplierId,
        status: 'confirmed', // complete_grn() requires confirmed/partially_received; RPC transitions status itself
        total_amount: Math.round(total * 100) / 100,
        created_by: adminId,
        approved_by: adminId,
        approved_at: po.date + 'T10:00:00Z',
        created_at: po.date + 'T09:00:00Z',
        updated_at: po.date + 'T09:00:00Z',
      };
    });

    const { data, error } = await supabase.from('purchase_orders').insert(rows).select('id, po_number, total_amount');
    if (error) { console.error('PO insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} purchase orders.`);
    console.log(data!.map(d => `${d.po_number}: PKR ${d.total_amount}`).join('\n'));
    return;
  }

  if (step === 'po_items') {
    const { data: pos, error: poErr } = await supabase.from('purchase_orders').select('id, po_number');
    if (poErr) { console.error(poErr.message); process.exit(1); }
    const poByCode = new Map(pos!.map(p => [p.po_number, p.id]));

    const { data: meds, error: medErr } = await supabase.from('medicines').select('id, name, mrp');
    if (medErr) { console.error(medErr.message); process.exit(1); }
    const medByName = new Map(meds!.map(m => [m.name, m]));

    const rows: any[] = [];
    for (const po of POS) {
      const poId = poByCode.get(po.code);
      if (!poId) throw new Error(`PO not found: ${po.code}`);
      for (const [name, qty] of po.items) {
        const med = medByName.get(name as string);
        if (!med) throw new Error(`Medicine not found: ${name}`);
        const unitPrice = purchasePriceFor(Number(med.mrp));
        rows.push({
          po_id: poId,
          medicine_id: med.id,
          quantity: qty,
          unit_price: unitPrice,
        });
      }
    }
    const { data, error } = await supabase.from('purchase_order_items').insert(rows).select('id');
    if (error) { console.error('PO items insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} purchase order items across ${POS.length} POs.`);
    return;
  }

  if (step === 'grns') {
    const adminId = await getAdminId(supabase);
    const { data: pos, error: poErr } = await supabase.from('purchase_orders').select('id, po_number');
    if (poErr) { console.error(poErr.message); process.exit(1); }
    const poByCode = new Map(pos!.map(p => [p.po_number, p.id]));

    const { data: meds, error: medErr } = await supabase.from('medicines').select('id, name, mrp');
    if (medErr) { console.error(medErr.message); process.exit(1); }
    const medByName = new Map(meds!.map(m => [m.name, m]));

    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    let batchCounter = 2001;
    let grnCount = 0;

    for (const po of POS) {
      if (po.code === 'PO-009') { console.log(`Skipping ${po.code} (intentionally left confirmed, no GRN).`); continue; }
      const poId = poByCode.get(po.code);
      const isPartial = po.status === 'partially_received';
      const excluded = new Set(po.excludeFromReceipt || []);

      const items = po.items
        .filter(([name]) => !excluded.has(name as string))
        .map(([name, qty]) => {
          const med = medByName.get(name as string)!;
          return {
            medicine_id: med.id,
            batch_no: `BN-2026-${batchCounter++}`,
            expiry_date: '2027-11-30',
            quantity: qty,
            unit_price: purchasePriceFor(Number(med.mrp)),
          };
        });

      const res = await client.query(
        `SELECT complete_grn($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::boolean) as grn_id`,
        [poId, adminId, `GRN for ${po.code}`, JSON.stringify(items), isPartial]
      );
      const grnId = res.rows[0].grn_id;
      grnCount++;
      console.log(`${po.code} -> GRN ${grnId} (is_partial=${isPartial}, items=${items.length}${excluded.size ? ', excluded: ' + [...excluded].join(', ') : ''})`);
    }

    console.log(`\nTotal complete_grn() calls: ${grnCount}`);
    await client.end();
    return;
  }

  console.error('Usage: seed-procurement.ts <suppliers|pos|po_items|grns>');
  process.exit(1);
}

main();
