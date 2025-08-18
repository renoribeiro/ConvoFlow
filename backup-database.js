import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backupDatabase() {
  console.log('🔄 Iniciando backup do banco de dados Supabase...');
  
  const backupDir = path.join(__dirname, 'database-backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup-${timestamp}.json`);

  try {
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database_url: supabaseUrl,
      tables: {}
    };

    // Lista de tabelas para fazer backup
    const tables = [
      'profiles',
      'whatsapp_instances', 
      'conversations',
      'messages',
      'contacts',
      'campaigns',
      'chatbots',
      'followups',
      'automation_flows',
      'message_templates',
      'notifications',
      'stripe_config',
      'stripe_transactions',
      'tracking_events',
      'tracking_sessions',
      'tracking_conversions',
      'reports_data',
      'system_metrics'
    ];

    console.log('📊 Fazendo backup das tabelas...');
    
    for (const table of tables) {
      try {
        console.log(`  📋 Backup da tabela: ${table}`);
        const { data, error } = await supabase
          .from(table)
          .select('*');
        
        if (error) {
          console.warn(`  ⚠️  Erro ao fazer backup da tabela ${table}:`, error.message);
          backup.tables[table] = { error: error.message, data: [] };
        } else {
          backup.tables[table] = { 
            count: data?.length || 0, 
            data: data || [] 
          };
          console.log(`  ✅ ${table}: ${data?.length || 0} registros`);
        }
      } catch (err) {
        console.warn(`  ⚠️  Erro inesperado na tabela ${table}:`, err.message);
        backup.tables[table] = { error: err.message, data: [] };
      }
    }

    // Salvar backup
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\n✅ Backup concluído com sucesso!`);
    console.log(`📁 Arquivo salvo em: ${backupFile}`);
    
    // Criar resumo do backup
    const summary = {
      timestamp: backup.timestamp,
      total_tables: Object.keys(backup.tables).length,
      total_records: Object.values(backup.tables).reduce((sum, table) => sum + (table.count || 0), 0),
      tables_summary: Object.entries(backup.tables).map(([name, info]) => ({
        table: name,
        records: info.count || 0,
        status: info.error ? 'error' : 'success'
      }))
    };
    
    const summaryFile = path.join(backupDir, `backup-summary-${timestamp}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log('\n📋 Resumo do backup:');
    console.log(`   Total de tabelas: ${summary.total_tables}`);
    console.log(`   Total de registros: ${summary.total_records}`);
    console.log(`   Resumo salvo em: ${summaryFile}`);
    
    return { backupFile, summaryFile, summary };
    
  } catch (error) {
    console.error('❌ Erro durante o backup:', error);
    throw error;
  }
}

// Executar sempre (para debug)
console.log('🚀 Iniciando script de backup...');
console.log('📍 URL do módulo:', import.meta.url);
console.log('📍 Argumentos:', process.argv);

backupDatabase()
  .then(() => {
    console.log('\n🎉 Processo de backup finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha no backup:', error);
    process.exit(1);
  });

export { backupDatabase };