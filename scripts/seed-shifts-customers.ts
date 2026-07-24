import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
  console.error('REFUSING: wrong project ref:', url);
  process.exit(1);
}

function supa() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function workingDays(start: string, end: string): string[] {
  const days: string[] = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const endDate = new Date(Date.UTC(ey, em - 1, ed));
  while (cur <= endDate) {
    if (cur.getUTCDay() !== 0) { // 0 = Sunday
      const y = cur.getUTCFullYear();
      const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cur.getUTCDate()).padStart(2, '0');
      days.push(`${y}-${m}-${d}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const CUSTOMERS = [
  { name: 'Ahmad Furniture Store', contact_person: 'Mr. Bilal Ahmad', phone: '0300-4521789', credit_limit: 50000 },
  { name: 'Hassan Family', contact_person: 'Mr. Tariq Hassan', phone: '0321-8745632', credit_limit: 25000 },
  { name: 'Malik Enterprises', contact_person: 'Ms. Rabia Malik', phone: '0345-6321478', credit_limit: 75000 },
  { name: 'Dr. Imran Clinic', contact_person: 'Dr. Imran Sheikh', phone: '0311-9632547', credit_limit: 100000 },
  { name: 'Zafar Medical Centre', contact_person: 'Mr. Zafar Iqbal', phone: '0333-7412589', credit_limit: 60000 },
];

async function main() {
  const supabase = supa();
  const step = process.argv[2];

  if (step === 'shifts') {
    const { data: pharmacist, error: pErr } = await supabase.from('profiles').select('id').eq('role', 'pharmacist').single();
    if (pErr || !pharmacist) { console.error('Pharmacist not found:', pErr?.message); process.exit(1); }

    const days = [
      ...workingDays('2026-04-06', '2026-04-30'),
      ...workingDays('2026-05-01', '2026-05-31'),
      ...workingDays('2026-06-01', '2026-06-27'),
    ];

    const rows = days.map(date => ({
      cashier_id: pharmacist.id,
      opened_at: `${date}T09:00:00+05:00`,
      closed_at: `${date}T21:00:00+05:00`,
      status: 'closed',
      opening_cash: 5000,
    }));

    const { data, error } = await supabase.from('shifts').insert(rows).select('id');
    if (error) { console.error('Shift insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} shifts (${days[0]} to ${days[days.length - 1]}).`);
    return;
  }

  if (step === 'customers') {
    const rows = CUSTOMERS.map(c => ({
      name: c.name,
      phone: c.phone,
      credit_limit: c.credit_limit,
      credit_balance: 0,
      notes: `Contact: ${c.contact_person}`,
    }));
    rows.push({ name: 'Walk-in Customer', phone: null as any, credit_limit: 0, credit_balance: 0, notes: 'Default anonymous cash-sale customer' });

    const { data, error } = await supabase.from('customers').insert(rows).select('id, name');
    if (error) { console.error('Customer insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} customers.`);
    return;
  }

  console.error('Usage: seed-shifts-customers.ts <shifts|customers>');
  process.exit(1);
}

main();
