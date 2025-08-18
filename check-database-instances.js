import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Função para carregar variáveis de ambiente do arquivo .env
function loadEnvVars() {
  try {
    const envContent = readFileSync('.env', 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          envVars[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
        }
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('Erro ao carregar arquivo .env:', error.message);
    return {};
  }
}

async function checkDatabaseInstances() {
  console.log('🔍 Verificando instâncias no banco de dados...');
  
  // Carregar variáveis de ambiente
  const envVars = loadEnvVars();
  
  const supabaseUrl = envVars.VITE_SUPABASE_URL;
  const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente do Supabase não encontradas');
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'Definida' : 'Não definida');
    console.log('VITE_SUPABASE_ANON_KEY:', supabaseKey ? 'Definida' : 'Não definida');
    return;
  }
  
  // Criar cliente Supabase
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Buscar todas as instâncias
    const { data: instances, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Erro ao buscar instâncias:', error.message);
      return;
    }
    
    console.log(`\n📊 Total de instâncias encontradas: ${instances.length}`);
    
    if (instances.length === 0) {
      console.log('✅ Nenhuma instância encontrada no banco de dados');
    } else {
      console.log('\n📋 Instâncias encontradas:');
      instances.forEach((instance, index) => {
        console.log(`\n${index + 1}. ${instance.name}`);
        console.log(`   ID: ${instance.id}`);
        console.log(`   Instance Key: ${instance.instance_key}`);
        console.log(`   Status: ${instance.status}`);
        console.log(`   Tenant ID: ${instance.tenant_id}`);
        console.log(`   Criado em: ${new Date(instance.created_at).toLocaleString()}`);
        console.log(`   Ativo: ${instance.is_active}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
  }
}

// Executar verificação
checkDatabaseInstances()