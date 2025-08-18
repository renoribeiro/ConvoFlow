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

async function exportDatabaseSchema() {
  console.log('🔄 Exportando schema do banco de dados Supabase...');
  
  const schemaDir = path.join(__dirname, 'database-schema');
  if (!fs.existsSync(schemaDir)) {
    fs.mkdirSync(schemaDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  try {
    // Exportar informações das tabelas
    console.log('📊 Coletando informações das tabelas...');
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('*')
      .eq('table_schema', 'public');
    
    if (tablesError) {
      console.warn('⚠️  Erro ao obter tabelas via information_schema, tentando método alternativo...');
    }

    // Exportar informações das colunas
    console.log('📋 Coletando informações das colunas...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('*')
      .eq('table_schema', 'public');
    
    if (columnsError) {
      console.warn('⚠️  Erro ao obter colunas via information_schema...');
    }

    // Exportar constraints
    console.log('🔗 Coletando informações de constraints...');
    
    const { data: constraints, error: constraintsError } = await supabase
      .from('information_schema.table_constraints')
      .select('*')
      .eq('table_schema', 'public');
    
    if (constraintsError) {
      console.warn('⚠️  Erro ao obter constraints via information_schema...');
    }

    // Criar schema export
    const schemaExport = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database_url: supabaseUrl,
      schema: {
        tables: tables || [],
        columns: columns || [],
        constraints: constraints || []
      },
      migrations: []
    };

    // Ler arquivos de migração existentes
    console.log('📁 Coletando migrações existentes...');
    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        schemaExport.migrations.push({
          filename: file,
          content: content,
          size: content.length
        });
      }
      
      console.log(`  ✅ ${migrationFiles.length} arquivos de migração coletados`);
    }

    // Salvar schema export
    const schemaFile = path.join(schemaDir, `schema-export-${timestamp}.json`);
    fs.writeFileSync(schemaFile, JSON.stringify(schemaExport, null, 2));
    
    console.log(`\n✅ Schema exportado com sucesso!`);
    console.log(`📁 Arquivo salvo em: ${schemaFile}`);
    
    // Criar arquivo SQL com DDL das migrações
    const sqlFile = path.join(schemaDir, `schema-ddl-${timestamp}.sql`);
    let ddlContent = `-- ConvoFlow Database Schema Export\n-- Generated at: ${new Date().toISOString()}\n-- Database: ${supabaseUrl}\n\n`;
    
    for (const migration of schemaExport.migrations) {
      ddlContent += `-- Migration: ${migration.filename}\n`;
      ddlContent += `-- Size: ${migration.size} bytes\n`;
      ddlContent += migration.content;
      ddlContent += '\n\n';
    }
    
    fs.writeFileSync(sqlFile, ddlContent);
    console.log(`📄 DDL SQL salvo em: ${sqlFile}`);
    
    // Criar resumo do schema
    const summary = {
      timestamp: schemaExport.timestamp,
      total_tables: schemaExport.schema.tables.length,
      total_columns: schemaExport.schema.columns.length,
      total_constraints: schemaExport.schema.constraints.length,
      total_migrations: schemaExport.migrations.length,
      files_generated: [
        schemaFile,
        sqlFile
      ]
    };
    
    const summaryFile = path.join(schemaDir, `schema-summary-${timestamp}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    console.log('\n📋 Resumo do schema:');
    console.log(`   Total de tabelas: ${summary.total_tables}`);
    console.log(`   Total de colunas: ${summary.total_columns}`);
    console.log(`   Total de constraints: ${summary.total_constraints}`);
    console.log(`   Total de migrações: ${summary.total_migrations}`);
    console.log(`   Resumo salvo em: ${summaryFile}`);
    
    return { schemaFile, sqlFile, summaryFile, summary };
    
  } catch (error) {
    console.error('❌ Erro durante a exportação do schema:', error);
    throw error;
  }
}

// Executar sempre
console.log('🚀 Iniciando exportação do schema...');

exportDatabaseSchema()
  .then(() => {
    console.log('\n🎉 Processo de exportação do schema finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Falha na exportação do schema:', error);
    process.exit(1);
  });

export { exportDatabaseSchema };