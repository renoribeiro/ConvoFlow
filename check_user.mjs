import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Please provide SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error("Error listing users:", error);
    return;
  }
  const mario = users.users.find(u => u.email === 'mario@sourelevante.com.br');
  if (mario) {
    console.log("User still exists in auth.users:", mario.id);
  } else {
    console.log("User not found in auth.users.");
  }
}

checkUser();
