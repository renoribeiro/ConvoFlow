const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Função para carregar variáveis de ambiente
function loadEnvVars() {
  const envPath = path.join(__dirname, '.env');
  const envVars = {};
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          envVars[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
        }
      }
    });
  }
  
  return envVars;
}

async function clearCacheAndVerifyData() {
  try {
    console.log('🔄 Iniciando limpeza de cache e verificação de dados...');
    
    // Carregar variáveis de ambiente
    const envVars = loadEnvVars();
    const supabaseUrl = envVars.VITE_SUPABASE_URL;
    const supabaseKey = envVars.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variáveis de ambiente do Supabase não encontradas');
    }
    
    // Conectar ao Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('✅ Conectado ao Supabase');
    
    // Verificar dados atuais na tabela whatsapp_instances
    console.log('\n📊 Verificando dados atuais na tabela whatsapp_instances...');
    const { data: instances, error } = await supabase
      .from('whatsapp_instances')
      .select('*');
    
    if (error) {
      console.error('❌ Erro ao buscar instâncias:', error);
      return;
    }
    
    console.log(`📈 Total de instâncias encontradas: ${instances.length}`);
    
    if (instances.length > 0) {
      console.log('\n📋 Instâncias encontradas:');
      instances.forEach((instance, index) => {
        console.log(`${index + 1}. Nome: ${instance.name}`);
        console.log(`   ID: ${instance.id}`);
        console.log(`   Tenant ID: ${instance.tenant_id}`);
        console.log(`   Status: ${instance.status}`);
        console.log(`   Criado em: ${instance.created_at}`);
        console.log('   ---');
      });
    } else {
      console.log('✅ Nenhuma instância encontrada no banco de dados');
    }
    
    // Instruções para limpar o cache do React Query
    console.log('\n🧹 INSTRUÇÕES PARA LIMPAR O CACHE:');
    console.log('1. Abra o DevTools do navegador (F12)');
    console.log('2. Vá para a aba "Application" ou "Aplicação"');
    console.log('3. No menu lateral, encontre "Storage" > "Local Storage"');
    console.log('4. Clique em "http://localhost:8080" (ou sua URL local)');
    console.log('5. Delete todas as chaves que começam com "react-query" ou "tanstack-query"');
    console.log('6. Também limpe "Session Storage" da mesma forma');
    console.log('7. Recarregue a página (Ctrl+F5 ou Cmd+Shift+R)');
    
    console.log('\n🔄 ALTERNATIVA - Forçar reload completo:');
    console.log('1. Pressione Ctrl+Shift+R (Windows/Linux) ou Cmd+Shift+R (Mac)');
    console.log('2. Ou abra o DevTools, clique com botão direito no botão de reload e selecione "Empty Cache and Hard Reload"');
    
    console.log('\n✅ Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro durante a verificação:', error.message);
  }
}

// Executar o script
clearCacheAndVerifyData();