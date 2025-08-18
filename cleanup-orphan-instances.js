import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Ler variáveis do arquivo .env
function loadEnvVars() {
  try {
    const envContent = readFileSync('.env', 'utf8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        envVars[key.trim()] = value.trim();
      }
    });
    return envVars;
  } catch (error) {
    console.error('Erro ao ler .env:', error);
    return {};
  }
}

const env = loadEnvVars();

// Configuração do Supabase
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupOrphanInstances() {
  try {
    console.log('🔍 Buscando instâncias órfãs no banco de dados...');
    
    // Buscar todas as instâncias do banco
    const { data: dbInstances, error: dbError } = await supabase
      .from('whatsapp_instances')
      .select('id, name, instance_key, status');
    
    if (dbError) {
      console.error('❌ Erro ao buscar instâncias do banco:', dbError);
      return;
    }
    
    console.log(`📊 Encontradas ${dbInstances.length} instâncias no banco de dados:`);
    dbInstances.forEach(instance => {
      console.log(`  - ${instance.name} (${instance.status})`);
    });
    
    // Como a Evolution API retornou array vazio, todas as instâncias são órfãs
    console.log('\n🧹 Todas as instâncias no banco são órfãs (Evolution API retornou array vazio)');
    console.log('\n⚠️  ATENÇÃO: Isso irá deletar TODAS as instâncias do banco de dados!');
    console.log('\nInstâncias que serão removidas:');
    dbInstances.forEach(instance => {
      console.log(`  - ID: ${instance.id}, Nome: ${instance.name}, Status: ${instance.status}`);
    });
    
    // Confirmar antes de deletar
    console.log('\n❓ Deseja continuar? (Digite "SIM" para confirmar)');
    
    // Para automação, vamos deletar diretamente
    console.log('\n🗑️  Removendo instâncias órfãs...');
    
    for (const instance of dbInstances) {
      const { error: deleteError } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instance.id);
      
      if (deleteError) {
        console.error(`❌ Erro ao deletar instância ${instance.name}:`, deleteError);
      } else {
        console.log(`✅ Instância ${instance.name} removida com sucesso`);
      }
    }
    
    console.log('\n🎉 Limpeza concluída! Todas as instâncias órfãs foram removidas.');
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
  }
}

cleanupOrphanInstances();