import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Fetching instances...");
  const { data, error } = await supabase.from('whatsapp_instances').select('*');
  
  if (error) {
    console.error("Error fetching instances:", error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log("No instances found.");
    return;
  }
  
  console.log(`Found ${data.length} instances.`);
  data.forEach(i => console.log(`- ${i.instance_key} / ${i.name} (ID: ${i.id})`));
  
  console.log("\nDeleting 'yuriteste6' and 'demo_instance'...");
  
  for (const instanceKey of ['yuriteste6', 'demo_instance']) {
    const { error: delError } = await supabase.from('whatsapp_instances').delete().eq('instance_key', instanceKey);
    if (delError) {
      console.error(`Error deleting ${instanceKey}:`, delError.message, delError.details, delError.hint);
    } else {
      console.log(`Successfully deleted ${instanceKey}`);
    }
  }
}

main().catch(console.error);
