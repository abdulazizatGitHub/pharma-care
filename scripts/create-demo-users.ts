import dotenv from 'dotenv';
dotenv.config({ path: '.env.demo' });

import { createClient } from '@supabase/supabase-js';

const USERS = [
  { email: 'superadmin@pharmacare.demo', password: 'PharmaCare@2024', full_name: 'Dr. Tariq Mahmood', role: 'superadmin' },
  { email: 'admin@pharmacare.demo', password: 'PharmaCare@2024', full_name: 'Fatima Malik', role: 'admin' },
  { email: 'pharmacist@pharmacare.demo', password: 'PharmaCare@2024', full_name: 'Usman Raza', role: 'pharmacist' },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!url.includes('gnxtmvkfawfkmyyqebwi')) {
    console.error('REFUSING: NEXT_PUBLIC_SUPABASE_URL does not match demo project ref. Got:', url);
    process.exit(1);
  }

  const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const u of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (error) {
      console.error(`FAILED to create ${u.email}: ${error.message}`);
      process.exit(1);
    }
    const userId = data.user.id;
    console.log(`Created ${u.email} (${userId})`);

    const { error: profErr } = await supabase
      .from('profiles')
      .update({
        full_name: u.full_name,
        role: u.role,
        force_password_change: false,
        is_active: true,
      })
      .eq('id', userId);

    if (profErr) {
      console.error(`FAILED to update profile for ${u.email}: ${profErr.message}`);
      process.exit(1);
    }
    console.log(`Profile updated: role=${u.role}`);
  }

  console.log('\nVerifying sign-in for all 3 users...');
  for (const u of USERS) {
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    const { error } = await anon.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) {
      console.error(`SIGN-IN FAILED for ${u.email}: ${error.message}`);
      process.exit(1);
    }
    console.log(`Sign-in OK: ${u.email}`);
  }

  console.log('\nAll 3 users created, profiled, and verified.');
}

main();
