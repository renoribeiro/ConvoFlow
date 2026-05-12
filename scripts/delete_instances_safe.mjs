import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const instances = ['yuriteste6', 'demo_instance'];
  
  for (const instanceKey of instances) {
    console.log(`\nProcessing ${instanceKey}...`);
    // Find instance ID
    const { data: inst } = await supabase.from('whatsapp_instances').select('id').eq('instance_key', instanceKey).single();
    if (!inst) {
      console.log(`Instance ${instanceKey} not found.`);
      continue;
    }
    const instId = inst.id;
    
    // Delete all related records
    console.log("Deleting messages...");
    await supabase.from('messages').delete().eq('whatsapp_instance_id', instId);
    
    console.log("Deleting conversations...");
    await supabase.from('conversations').delete().eq('whatsapp_instance_id', instId);
    
    console.log("Deleting campaigns...");
    await supabase.from('mass_message_campaigns').delete().eq('whatsapp_instance_id', instId);
    
    console.log("Deleting chatbots...");
    await supabase.from('chatbots').delete().eq('whatsapp_instance_id', instId);
    
    // Update contacts to break foreign keys without deleting them
    console.log("Nullifying contacts...");
    await supabase.from('contacts').update({ whatsapp_instance_id: null }).eq('whatsapp_instance_id', instId);
    
    // Now delete instance
    console.log("Deleting instance...");
    const { error: delError } = await supabase.from('whatsapp_instances').delete().eq('id', instId);
    
    if (delError) {
      console.error(`Error deleting ${instanceKey}:`, delError);
    } else {
      console.log(`Successfully deleted ${instanceKey} from DB.`);
    }
  }
}

main().catch(console.error);
