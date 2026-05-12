import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: convs } = await supabase.from('conversations').select('id');
  console.log(`Total conversations in DB: ${convs?.length || 0}`);
  
  const { data: contacts } = await supabase.from('contacts').select('id');
  console.log(`Total contacts in DB: ${contacts?.length || 0}`);
}

main();
