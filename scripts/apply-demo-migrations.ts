import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
    console.error('REFUSING: NEXT_PUBLIC_SUPABASE_URL does not match demo project ref. Got:', url);
    process.exit(1);
  }

  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  const client = new Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`Applying ${f}...`);
    try {
      await client.query(sql);
      console.log(`OK: ${f}`);
    } catch (e: any) {
      console.error(`FAILED: ${f}`);
      console.error(e.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('All migrations applied.');
}

main();
