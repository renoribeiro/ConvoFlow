import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const phone = '558587486425';
  
  const { data: contacts } = await supabase.from('contacts').select('*').like('phone', `%${phone}%`);
  console.log("Contacts matching phone:", contacts);
  
  if (contacts && contacts.length > 0) {
    for (const contact of contacts) {
      const { data: messages } = await supabase.from('messages').select('*').eq('contact_id', contact.id);
      console.log(`Messages for contact ${contact.id} (${contact.phone}): ${messages?.length || 0}`);
      
      const { data: conversations } = await supabase.from('conversations').select('*').eq('contact_id', contact.id);
      console.log(`Conversations for contact ${contact.id}: ${conversations?.length || 0}`);
    }
  }
}

main();
