import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', '55741cc1-8b57-4755-81d6-ebb90b81a2ca').single();
  console.log(tenantData.settings.evolutionApi);
}

main();
