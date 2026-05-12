import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: messages } = await supabase.from('messages').select('contact_id');
  if (!messages) return;
  
  const counts = {};
  messages.forEach(m => {
    counts[m.contact_id] = (counts[m.contact_id] || 0) + 1;
  });
  
  const contactIds = Object.keys(counts);
  console.log(`Messages are spread across ${contactIds.length} contacts.`);
  
  // Find which ones
  const { data: contacts } = await supabase.from('contacts').select('id, phone').in('id', Object.keys(counts));
  
  contacts.forEach(c => {
    console.log(`Contact ${c.phone} (ID: ${c.id}): ${counts[c.id]} messages`);
  });
}

main();
