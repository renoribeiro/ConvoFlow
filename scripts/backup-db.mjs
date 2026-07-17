// =============================================================================
// backup-db.mjs — backup completo de DADOS (sem Docker, sem pg_dump).
// Usa a lib `pg` (já dependência do projeto) para conectar direto no Postgres
// e salvar TODAS as tabelas do schema public num arquivo JSON.
//
// A estrutura (schema/DDL) já está versionada em supabase/migrations/, então
// este backup de dados + as migrações = recuperação completa.
//
// USO (PowerShell, na pasta do projeto):
//   $env:PG_URL="postgresql://postgres.<ref>:SUA_SENHA@aws-0-<regiao>.pooler.supabase.com:5432/postgres"
//   node scripts/backup-db.mjs
//
// A connection string (use a do "Session pooler") vem do botão "Connect" no topo
// do Dashboard do Supabase. Troque SUA_SENHA pela senha do banco.
// =============================================================================

import pkg from 'pg';
import { writeFileSync } from 'node:fs';

const { Client } = pkg;

const url = process.env.PG_URL;
// Alternativa sem codificar senha: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (o
// `pg` lê essas variáveis automaticamente; PGPASSWORD aceita a senha crua).
const hasPgVars = process.env.PGHOST && process.env.PGPASSWORD;
if (!url && !hasPgVars) {
  console.error('\n❌ Configure a conexão antes de rodar. Duas formas:');
  console.error('   (A) $env:PG_URL="postgresql://postgres.<ref>:SENHA@aws-0-<regiao>.pooler.supabase.com:5432/postgres"');
  console.error('   (B) $env:PGHOST="aws-0-<regiao>.pooler.supabase.com"; $env:PGPORT="5432"; $env:PGUSER="postgres.<ref>"; $env:PGPASSWORD="sua_senha"; $env:PGDATABASE="postgres"');
  process.exit(1);
}

const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
const outFile = `backup_dados_${stamp}.json`;

const client = url
  ? new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  : new Client({ ssl: { rejectUnauthorized: false } }); // usa PGHOST/PGUSER/PGPASSWORD/etc.

try {
  await client.connect();
  console.log('✅ Conectado. Lendo tabelas...');

  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );

  const backup = { _meta: { generated_at: now.toISOString(), tables: tables.length } };
  const counts = {};

  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from public."${table_name}"`);
    backup[table_name] = rows;
    counts[table_name] = rows.length;
  }

  writeFileSync(outFile, JSON.stringify(backup, null, 2));
  console.log(`\n✅ Backup salvo em: ${outFile}`);
  console.log('   Linhas por tabela:');
  for (const [t, n] of Object.entries(counts).sort()) {
    if (n > 0) console.log(`   - ${t}: ${n}`);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`   TOTAL de linhas: ${total}`);
} catch (err) {
  console.error('\n❌ Erro no backup:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
