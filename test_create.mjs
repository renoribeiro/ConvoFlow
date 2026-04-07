import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Please provide SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function testCreate() {
  const { data, error } = await supabaseAdmin.functions.invoke('admin-create-user', {
    method: 'POST',
    body: {
      email: 'mario@sourelevante.com.br',
      firstName: 'Mario',
      lastName: 'Acioli',
      role: 'tenant_user',
      isActive: true,
      tenantId: null,
      redirectTo: 'http://localhost:3000'
    }
  });

  if (error) {
    if (error.context) {
       console.log("Error JSON Context:", await error.context.json().catch(()=>null));
    }
    console.error("Function Error:", error);
  } else {
    console.log("Success:", data);
  }
}

testCreate();
