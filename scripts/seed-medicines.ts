import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { createClient } from '@supabase/supabase-js';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Migration 008 already seeds 12 categories / 58 subcategories. We reuse those
// rather than creating a parallel set. Map: spec category name -> existing category name.
const CATEGORY_MAP: Record<string, string> = {
  'Antibiotics': 'Antibiotics',
  'Analgesics & Anti-inflammatory': 'Analgesics & Anti-inflammatory',
  'Cardiovascular': 'Cardiovascular',
  'Diabetes Management': 'Endocrine & Metabolic',
  'Respiratory': 'Respiratory',
  'Gastrointestinal': 'Gastrointestinal',
  'Vitamins & Supplements': 'Vitamins & Supplements',
  'Controlled Drugs': 'Controlled Substances',
  'Dermatology': 'Dermatology',
  'Ophthalmology': 'Ophthalmology & ENT',
};

// spec (category, subcategory) -> existing subcategory name, or null if it must be created new
// (Penicillins, Cephalosporins, Benzodiazepines don't exist under any category yet)
const SUBCATEGORY_MAP: Record<string, string | null> = {
  'Antibiotics::Penicillins': null,
  'Antibiotics::Cephalosporins': null,
  'Antibiotics::Fluoroquinolones': 'Fluoroquinolones',
  'Analgesics & Anti-inflammatory::NSAIDs': 'NSAIDs',
  'Analgesics & Anti-inflammatory::Paracetamol': 'Paracetamol',
  'Analgesics & Anti-inflammatory::Opioid Analgesics': 'Opioid Analgesics',
  'Cardiovascular::Antihypertensives': 'Antihypertensives',
  'Cardiovascular::Statins': 'Statins',
  'Diabetes Management::Oral Hypoglycemics': 'Oral Antidiabetics',
  'Diabetes Management::Insulins': 'Insulin',
  'Respiratory::Bronchodilators': 'Bronchodilators',
  'Respiratory::Corticosteroids (Inhaled)': 'Inhaled Corticosteroids',
  'Gastrointestinal::Proton Pump Inhibitors': 'Proton Pump Inhibitors',
  'Gastrointestinal::Antacids': 'Antacids',
  'Vitamins & Supplements::Multivitamins': 'Multivitamins',
  'Vitamins & Supplements::Single Vitamins': 'Vitamin C & D',
  'Controlled Drugs::Benzodiazepines': null,
  'Controlled Drugs::Opioids': 'Schedule B (Narcotics)',
  'Dermatology::Topical Antibiotics': 'Antibiotics Topical',
  'Dermatology::Antifungals': 'Antifungals Topical',
  'Ophthalmology::Eye Drops': 'Eye Drops',
};

// Minerals subcategory splits by medicine (existing taxonomy has separate Iron/Calcium subcats)
const MINERAL_OVERRIDE: Record<string, string> = {
  'Ferrous Sulphate 200mg Tablets (Feospan)': 'Iron Supplements',
  'Calcium Carbonate 500mg Tablets (Caltrate)': 'Calcium Supplements',
};

const NEW_SUBCATEGORIES: { category: string; name: string }[] = [
  { category: 'Antibiotics', name: 'Penicillins' },
  { category: 'Antibiotics', name: 'Cephalosporins' },
  { category: 'Controlled Substances', name: 'Benzodiazepines' },
];

type MedSpec = {
  category: string;
  subcategory: string;
  name: string;
  mrp: number;
  generic_name: string;
  manufacturer: string;
  requires_prescription: boolean;
  is_controlled?: boolean;
  reorder_level: number;
};

const MEDICINES: MedSpec[] = [
  { category: 'Antibiotics', subcategory: 'Penicillins', name: 'Amoxicillin 500mg Capsules (Amoxil)', mrp: 185, generic_name: 'Amoxicillin', manufacturer: 'GSK Pakistan', requires_prescription: true, reorder_level: 50 },
  { category: 'Antibiotics', subcategory: 'Penicillins', name: 'Ampicillin 250mg Capsules (Penbritin)', mrp: 145, generic_name: 'Ampicillin', manufacturer: 'Sami Pharma', requires_prescription: true, reorder_level: 30 },
  { category: 'Antibiotics', subcategory: 'Cephalosporins', name: 'Cefixime 400mg Tablets (Cefix)', mrp: 320, generic_name: 'Cefixime', manufacturer: 'Highnoon Labs', requires_prescription: true, reorder_level: 40 },
  { category: 'Antibiotics', subcategory: 'Cephalosporins', name: 'Cephalexin 500mg Capsules (Keflex)', mrp: 275, generic_name: 'Cephalexin', manufacturer: 'AGP Pharma', requires_prescription: true, reorder_level: 25 },
  { category: 'Antibiotics', subcategory: 'Fluoroquinolones', name: 'Ciprofloxacin 500mg Tablets (Cifran)', mrp: 195, generic_name: 'Ciprofloxacin', manufacturer: 'Genome Pharma', requires_prescription: true, reorder_level: 35 },
  { category: 'Antibiotics', subcategory: 'Fluoroquinolones', name: 'Levofloxacin 500mg Tablets (Levaquin)', mrp: 485, generic_name: 'Levofloxacin', manufacturer: 'Ferozsons', requires_prescription: true, reorder_level: 20 },

  { category: 'Analgesics & Anti-inflammatory', subcategory: 'NSAIDs', name: 'Ibuprofen 400mg Tablets (Brufen)', mrp: 95, generic_name: 'Ibuprofen', manufacturer: 'Abbott Pakistan', requires_prescription: false, reorder_level: 100 },
  { category: 'Analgesics & Anti-inflammatory', subcategory: 'NSAIDs', name: 'Diclofenac 50mg Tablets (Voltaren)', mrp: 115, generic_name: 'Diclofenac', manufacturer: 'Novartis Pakistan', requires_prescription: false, reorder_level: 80 },
  { category: 'Analgesics & Anti-inflammatory', subcategory: 'NSAIDs', name: 'Naproxen 500mg Tablets (Naprosyn)', mrp: 165, generic_name: 'Naproxen', manufacturer: 'Roche Pakistan', requires_prescription: false, reorder_level: 40 },
  { category: 'Analgesics & Anti-inflammatory', subcategory: 'Paracetamol', name: 'Paracetamol 500mg Tablets (Panadol)', mrp: 45, generic_name: 'Paracetamol', manufacturer: 'GSK Pakistan', requires_prescription: false, reorder_level: 200 },
  { category: 'Analgesics & Anti-inflammatory', subcategory: 'Paracetamol', name: 'Paracetamol 250mg Syrup (Calpol)', mrp: 85, generic_name: 'Paracetamol', manufacturer: 'GSK Pakistan', requires_prescription: false, reorder_level: 60 },
  { category: 'Analgesics & Anti-inflammatory', subcategory: 'Opioid Analgesics', name: 'Tramadol 50mg Capsules (Tramal)', mrp: 285, generic_name: 'Tramadol', manufacturer: 'Grunenthal Pakistan', requires_prescription: true, is_controlled: true, reorder_level: 20 },

  { category: 'Cardiovascular', subcategory: 'Antihypertensives', name: 'Amlodipine 5mg Tablets (Norvasc)', mrp: 225, generic_name: 'Amlodipine', manufacturer: 'Pfizer Pakistan', requires_prescription: true, reorder_level: 60 },
  { category: 'Cardiovascular', subcategory: 'Antihypertensives', name: 'Losartan 50mg Tablets (Cozaar)', mrp: 310, generic_name: 'Losartan', manufacturer: 'Highnoon Labs', requires_prescription: true, reorder_level: 50 },
  { category: 'Cardiovascular', subcategory: 'Antihypertensives', name: 'Atenolol 50mg Tablets (Tenormin)', mrp: 145, generic_name: 'Atenolol', manufacturer: 'ICI Pakistan', requires_prescription: true, reorder_level: 45 },
  { category: 'Cardiovascular', subcategory: 'Statins', name: 'Atorvastatin 20mg Tablets (Lipitor)', mrp: 385, generic_name: 'Atorvastatin', manufacturer: 'Pfizer Pakistan', requires_prescription: true, reorder_level: 40 },
  { category: 'Cardiovascular', subcategory: 'Statins', name: 'Rosuvastatin 10mg Tablets (Crestor)', mrp: 465, generic_name: 'Rosuvastatin', manufacturer: 'AstraZeneca', requires_prescription: true, reorder_level: 30 },

  { category: 'Diabetes Management', subcategory: 'Oral Hypoglycemics', name: 'Metformin 500mg Tablets (Glucophage)', mrp: 175, generic_name: 'Metformin', manufacturer: 'Merck Pakistan', requires_prescription: true, reorder_level: 80 },
  { category: 'Diabetes Management', subcategory: 'Oral Hypoglycemics', name: 'Glibenclamide 5mg Tablets (Daonil)', mrp: 95, generic_name: 'Glibenclamide', manufacturer: 'Sanofi Pakistan', requires_prescription: true, reorder_level: 50 },
  { category: 'Diabetes Management', subcategory: 'Oral Hypoglycemics', name: 'Sitagliptin 100mg Tablets (Januvia)', mrp: 1850, generic_name: 'Sitagliptin', manufacturer: 'MSD Pakistan', requires_prescription: true, reorder_level: 20 },
  { category: 'Diabetes Management', subcategory: 'Insulins', name: 'Insulin Glargine 100IU/ml (Lantus)', mrp: 2450, generic_name: 'Insulin Glargine', manufacturer: 'Sanofi Pakistan', requires_prescription: true, is_controlled: true, reorder_level: 15 },

  { category: 'Respiratory', subcategory: 'Bronchodilators', name: 'Salbutamol 100mcg Inhaler (Ventolin)', mrp: 285, generic_name: 'Salbutamol', manufacturer: 'GSK Pakistan', requires_prescription: false, reorder_level: 30 },
  { category: 'Respiratory', subcategory: 'Bronchodilators', name: 'Ipratropium 20mcg Inhaler (Atrovent)', mrp: 485, generic_name: 'Ipratropium', manufacturer: 'Boehringer Pakistan', requires_prescription: true, reorder_level: 15 },
  { category: 'Respiratory', subcategory: 'Corticosteroids (Inhaled)', name: 'Fluticasone 125mcg Inhaler (Flixotide)', mrp: 685, generic_name: 'Fluticasone', manufacturer: 'GSK Pakistan', requires_prescription: true, reorder_level: 20 },
  { category: 'Respiratory', subcategory: 'Corticosteroids (Inhaled)', name: 'Budesonide 200mcg Inhaler (Pulmicort)', mrp: 745, generic_name: 'Budesonide', manufacturer: 'AstraZeneca', requires_prescription: true, reorder_level: 15 },

  { category: 'Gastrointestinal', subcategory: 'Proton Pump Inhibitors', name: 'Omeprazole 20mg Capsules (Losec)', mrp: 185, generic_name: 'Omeprazole', manufacturer: 'AstraZeneca', requires_prescription: false, reorder_level: 80 },
  { category: 'Gastrointestinal', subcategory: 'Proton Pump Inhibitors', name: 'Pantoprazole 40mg Tablets (Protonix)', mrp: 245, generic_name: 'Pantoprazole', manufacturer: 'Wyeth Pakistan', requires_prescription: false, reorder_level: 60 },
  { category: 'Gastrointestinal', subcategory: 'Antacids', name: 'Aluminium Hydroxide Suspension (Gaviscon)', mrp: 145, generic_name: 'Aluminium Hydroxide', manufacturer: 'Reckitt Pakistan', requires_prescription: false, reorder_level: 40 },
  { category: 'Gastrointestinal', subcategory: 'Antacids', name: 'Domperidone 10mg Tablets (Motilium)', mrp: 125, generic_name: 'Domperidone', manufacturer: 'Janssen Pakistan', requires_prescription: false, reorder_level: 50 },

  { category: 'Vitamins & Supplements', subcategory: 'Multivitamins', name: 'Centrum Adults Tablets', mrp: 1250, generic_name: 'Multivitamin Complex', manufacturer: 'Pfizer Pakistan', requires_prescription: false, reorder_level: 30 },
  { category: 'Vitamins & Supplements', subcategory: 'Multivitamins', name: 'Neurobion Forte Tablets', mrp: 185, generic_name: 'Vitamin B Complex', manufacturer: 'Merck Pakistan', requires_prescription: false, reorder_level: 60 },
  { category: 'Vitamins & Supplements', subcategory: 'Single Vitamins', name: 'Vitamin D3 1000IU Tablets (D-Sol)', mrp: 485, generic_name: 'Cholecalciferol', manufacturer: 'Searle Pakistan', requires_prescription: false, reorder_level: 40 },
  { category: 'Vitamins & Supplements', subcategory: 'Single Vitamins', name: 'Vitamin C 500mg Tablets (Redoxon)', mrp: 265, generic_name: 'Ascorbic Acid', manufacturer: 'Bayer Pakistan', requires_prescription: false, reorder_level: 50 },
  { category: 'Vitamins & Supplements', subcategory: 'Minerals', name: 'Ferrous Sulphate 200mg Tablets (Feospan)', mrp: 145, generic_name: 'Ferrous Sulphate', manufacturer: 'GSK Pakistan', requires_prescription: false, reorder_level: 40 },
  { category: 'Vitamins & Supplements', subcategory: 'Minerals', name: 'Calcium Carbonate 500mg Tablets (Caltrate)', mrp: 385, generic_name: 'Calcium Carbonate', manufacturer: 'Pfizer Pakistan', requires_prescription: false, reorder_level: 35 },

  { category: 'Controlled Drugs', subcategory: 'Benzodiazepines', name: 'Diazepam 5mg Tablets (Valium)', mrp: 185, generic_name: 'Diazepam', manufacturer: 'Roche Pakistan', requires_prescription: true, is_controlled: true, reorder_level: 15 },
  { category: 'Controlled Drugs', subcategory: 'Benzodiazepines', name: 'Alprazolam 0.5mg Tablets (Xanax)', mrp: 225, generic_name: 'Alprazolam', manufacturer: 'Pfizer Pakistan', requires_prescription: true, is_controlled: true, reorder_level: 10 },
  { category: 'Controlled Drugs', subcategory: 'Opioids', name: 'Codeine Phosphate 30mg Tablets', mrp: 345, generic_name: 'Codeine Phosphate', manufacturer: 'Ferozsons Pakistan', requires_prescription: true, is_controlled: true, reorder_level: 10 },

  { category: 'Dermatology', subcategory: 'Topical Antibiotics', name: 'Fusidic Acid 2% Cream (Fucidin)', mrp: 385, generic_name: 'Fusidic Acid', manufacturer: 'Leo Pharma Pakistan', requires_prescription: false, reorder_level: 25 },
  { category: 'Dermatology', subcategory: 'Topical Antibiotics', name: 'Mupirocin 2% Ointment (Bactroban)', mrp: 465, generic_name: 'Mupirocin', manufacturer: 'GSK Pakistan', requires_prescription: false, reorder_level: 20 },
  { category: 'Dermatology', subcategory: 'Antifungals', name: 'Clotrimazole 1% Cream (Canesten)', mrp: 185, generic_name: 'Clotrimazole', manufacturer: 'Bayer Pakistan', requires_prescription: false, reorder_level: 30 },
  { category: 'Dermatology', subcategory: 'Antifungals', name: 'Terbinafine 1% Cream (Lamisil)', mrp: 545, generic_name: 'Terbinafine', manufacturer: 'Novartis Pakistan', requires_prescription: false, reorder_level: 20 },

  { category: 'Ophthalmology', subcategory: 'Eye Drops', name: 'Ciprofloxacin 0.3% Eye Drops (Ciloxan)', mrp: 285, generic_name: 'Ciprofloxacin', manufacturer: 'Alcon Pakistan', requires_prescription: true, reorder_level: 20 },
  { category: 'Ophthalmology', subcategory: 'Eye Drops', name: 'Sodium Chloride 0.9% Eye Drops', mrp: 125, generic_name: 'Sodium Chloride', manufacturer: 'Ferozsons Pakistan', requires_prescription: false, reorder_level: 30 },
  { category: 'Ophthalmology', subcategory: 'Eye Drops', name: 'Latanoprost 0.005% Eye Drops (Xalatan)', mrp: 1250, generic_name: 'Latanoprost', manufacturer: 'Pfizer Pakistan', requires_prescription: true, reorder_level: 10 },
];

function scheduleFor(m: MedSpec): string {
  if (m.is_controlled) return 'controlled';
  if (m.requires_prescription) return 'prescription';
  return 'OTC';
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
    console.error('REFUSING: wrong project ref:', url);
    process.exit(1);
  }
  const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const step = process.argv[2];

  if (step === 'categories') {
    const { data: cats, error: catErr } = await supabase.from('medicine_categories').select('id, name');
    if (catErr) { console.error(catErr.message); process.exit(1); }
    const catByName = new Map(cats!.map(c => [c.name, c.id]));

    const rows = NEW_SUBCATEGORIES.map(s => ({
      category_id: catByName.get(s.category),
      name: s.name,
      slug: slugify(s.category + '-' + s.name),
    }));
    const { data, error } = await supabase.from('medicine_subcategories').insert(rows).select('id, name');
    if (error) { console.error('Subcategory insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} new subcategories (Penicillins, Cephalosporins, Benzodiazepines) under existing categories. No new categories created — reused all 12 pre-existing ones.`);
    return;
  }

  if (step === 'medicines') {
    const { data: cats, error: catErr } = await supabase.from('medicine_categories').select('id, name');
    if (catErr) { console.error(catErr.message); process.exit(1); }
    const { data: subs, error: subErr } = await supabase.from('medicine_subcategories').select('id, name, category_id');
    if (subErr) { console.error(subErr.message); process.exit(1); }

    const catByName = new Map(cats!.map(c => [c.name, c.id]));
    const subByKey = new Map(subs!.map(s => [`${s.category_id}::${s.name}`, s.id]));

    const rows = MEDICINES.map((m, i) => {
      const existingCategoryName = CATEGORY_MAP[m.category];
      const categoryId = catByName.get(existingCategoryName);
      if (!categoryId) throw new Error(`No category match for ${m.category} -> ${existingCategoryName}`);

      let subName = MINERAL_OVERRIDE[m.name] ?? SUBCATEGORY_MAP[`${m.category}::${m.subcategory}`];
      if (subName === undefined) throw new Error(`No subcategory mapping for ${m.category}::${m.subcategory}`);
      const subcategoryId = subName ? subByKey.get(`${categoryId}::${subName}`) : null;
      if (subName && !subcategoryId) throw new Error(`Subcategory not found: ${categoryId}::${subName}`);

      return {
        code: `MED-${String(i + 1).padStart(3, '0')}`,
        name: m.name,
        generic_name: m.generic_name,
        manufacturer: m.manufacturer,
        schedule: scheduleFor(m),
        mrp: m.mrp,
        pack_size: null,
        reorder_level: m.reorder_level,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        is_active: true,
      };
    });

    const { data, error } = await supabase.from('medicines').insert(rows).select('id, name, mrp');
    if (error) { console.error('Medicine insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} medicines.`);
    return;
  }

  if (step === 'batches') {
    const { data: meds, error: medErr } = await supabase
      .from('medicines')
      .select('id, name, mrp')
      .order('code');
    if (medErr) { console.error(medErr.message); process.exit(1); }

    // Indices (into the ordered medicines list) that get one near-expiry batch (Aug-Sep 2026)
    // and indices that get a single low-stock batch (qty 3-5), per spec.
    const NEAR_EXPIRY_INDICES = new Set([2, 10, 25, 33]);
    const LOW_STOCK_INDICES = new Set([5, 20]);

    const rows: any[] = [];
    let batchCounter = 1001;

    meds!.forEach((med, i) => {
      const mrp = Number(med.mrp);
      const purchasePrice = Math.round(mrp * (0.60 + (i % 6) * 0.01) * 100) / 100; // 60-65%

      if (LOW_STOCK_INDICES.has(i)) {
        const qty = i % 2 === 0 ? 3 : 5;
        rows.push({
          medicine_id: med.id,
          batch_no: `BN-2026-${batchCounter++}`,
          expiry_date: '2027-10-15',
          quantity: qty,
          purchase_price: purchasePrice,
          sale_price: mrp,
          mrp: mrp,
        });
        return;
      }

      const numBatches = i % 3 === 0 ? 3 : 2;
      const totalQty = 80 + ((i * 17) % 121); // spread 80-200
      const shares = numBatches === 3 ? [0.5, 0.3, 0.2] : [0.6, 0.4];

      for (let b = 0; b < numBatches; b++) {
        let expiry = '2027-' + String(6 + ((i + b) % 7)).padStart(2, '0') + '-15'; // Jun-Dec 2027
        if (NEAR_EXPIRY_INDICES.has(i) && b === numBatches - 1) {
          expiry = i % 2 === 0 ? '2026-08-20' : '2026-08-25';
        }
        const qty = Math.max(1, Math.round(totalQty * shares[b]));
        rows.push({
          medicine_id: med.id,
          batch_no: `BN-2026-${batchCounter++}`,
          expiry_date: expiry,
          quantity: qty,
          purchase_price: purchasePrice,
          sale_price: mrp,
          mrp: mrp,
        });
      }
    });

    const { data, error } = await supabase.from('stock_batches').insert(rows).select('id');
    if (error) { console.error('Batch insert failed:', error.message); process.exit(1); }
    console.log(`Inserted ${data!.length} stock batches (${[...NEAR_EXPIRY_INDICES].length} near-expiry, ${[...LOW_STOCK_INDICES].length} low-stock, 0 expired).`);
    return;
  }

  console.error('Usage: seed-medicines.ts <categories|medicines|batches>');
  process.exit(1);
}

main();
