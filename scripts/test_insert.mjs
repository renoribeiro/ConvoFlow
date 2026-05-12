import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const payload = {
    direction: 'outbound',
    message_type: 'text',
    content: 'Como está aí?',
    evolution_message_id: '3EB0141C9D0FBB908884C7',
    status: 'sent',
    is_from_bot: false,
    created_at: '2026-04-16T12:03:26.000Z',
    contact_id: '158df9b1-5a04-4537-889d-7f5fbbaeb179', // A random contact or I will fetch one
  };
  
  // Find a real contact_id
  const { data: contact } = await supabase.from('contacts').select('id, tenant_id, whatsapp_instance_id').limit(1).single();
  console.log("Using contact:", contact);
  
  if (!contact) return;
  
  payload.contact_id = contact.id;
  payload.tenant_id = contact.tenant_id;
  payload.whatsapp_instance_id = contact.whatsapp_instance_id;
  
  const { data, error } = await supabase.from('messages').insert([payload]).select();
  console.log("Insert Reuslt:");
  console.log("Data:", data);
  console.log("Error:", error);
}

main();
