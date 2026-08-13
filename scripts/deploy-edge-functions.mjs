#!/usr/bin/env node
// =============================================================================
// deploy-edge-functions.mjs — sobe as edge functions sem decorar comando
// =============================================================================
// Uso:
//   node scripts/deploy-edge-functions.mjs                  # sobe o grupo padrão
//   node scripts/deploy-edge-functions.mjs manage-user      # sobe só essas
//   node scripts/deploy-edge-functions.mjs --all            # sobe todas do repo
//   node scripts/deploy-edge-functions.mjs --list           # só mostra, não sobe
//
// Autenticação: variável de ambiente SUPABASE_ACCESS_TOKEN.
//   Gere em https://supabase.com/dashboard/account/tokens
//   Permanente:  setx SUPABASE_ACCESS_TOKEN "..."   (reabra o terminal)
//   Só nesta janela (PowerShell):  $env:SUPABASE_ACCESS_TOKEN = "..."
//
// ATENÇÃO — armadilha conhecida desta máquina: existe uma SUPABASE_ACCESS_TOKEN
// antiga no nível do usuário que sobrescreve o `supabase login`. Se der 401
// mesmo depois de logar, é ela. A saída é trocar o VALOR dela por um token
// novo, não apagar e logar de novo.
//
// O token nunca é impresso nem gravado por este script.
// =============================================================================

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_REF = 'pqjkuwyshybxldzpfbbs';
const FUNCTIONS_DIR = 'supabase/functions';

/**
 * Grupo padrão: as funções tocadas pelo conserto de controle de acesso
 * (2026-08-13). Todas dependem de _shared/capabilities.ts, que o CLI empacota
 * junto por causa dos imports relativos.
 */
const DEFAULT_GROUP = [
  'admin-create-user',
  'manage-user',
  'create-checkout-session',
  'whatsapp-meta-setup',
  'register-meta-number',
  'meta-oauth-exchange',
];

const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const all = args.includes('--all');
const named = args.filter((a) => !a.startsWith('--'));

if (!existsSync(FUNCTIONS_DIR)) {
  console.error(`✖ Não achei ${FUNCTIONS_DIR}. Rode a partir da raiz do projeto.`);
  process.exit(1);
}

const available = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .filter((d) => existsSync(join(FUNCTIONS_DIR, d.name, 'index.ts')))
  .map((d) => d.name);

let targets;
if (named.length > 0) targets = named;
else if (all) targets = available;
else targets = DEFAULT_GROUP;

const desconhecidas = targets.filter((t) => !available.includes(t));
if (desconhecidas.length > 0) {
  console.error(`✖ Função(ões) que não existem no repo: ${desconhecidas.join(', ')}`);
  console.error(`  Disponíveis: ${available.join(', ')}`);
  process.exit(1);
}

console.log(`\nProjeto : ${PROJECT_REF}`);
console.log(`Funções : ${targets.length}\n${targets.map((t) => `  · ${t}`).join('\n')}\n`);

if (listOnly) process.exit(0);

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('✖ SUPABASE_ACCESS_TOKEN não está definida.');
  console.error('  Gere em https://supabase.com/dashboard/account/tokens e rode:');
  console.error('    PowerShell : $env:SUPABASE_ACCESS_TOKEN = "..."');
  console.error('    Git Bash   : export SUPABASE_ACCESS_TOKEN="..."');
  console.error('    Permanente : setx SUPABASE_ACCESS_TOKEN "..."  (reabra o terminal)');
  process.exit(1);
}

const ok = [];

for (const fn of targets) {
  // Só nomes de pasta de função chegam aqui (validados contra `available` acima),
  // mas o comando vai montado como string para o shell — então nada de metacaractere.
  if (!/^[a-zA-Z0-9._-]+$/.test(fn)) {
    console.error(`✖ Nome de função inválido: ${fn}`);
    process.exit(1);
  }

  console.log(`\n>>> ${fn}`);

  // Windows: o npx é um .cmd, e desde a correção do CVE-2024-27980 o Node se
  // recusa a spawnar .cmd/.bat sem shell (EINVAL). Com shell, a forma de UM
  // argumento string é a única que não cai no DeprecationWarning DEP0190.
  const comando = [
    'npx', '--yes', 'supabase@latest',
    'functions', 'deploy', fn,
    '--project-ref', PROJECT_REF,
  ].join(' ');

  const result = spawnSync(comando, { stdio: 'inherit', shell: true });

  if (result.error) {
    console.error(`\n✖ Não consegui executar o npx: ${result.error.message}`);
    console.error(`  Node instalado? Confira com: node -v && npx --version`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n✖ Falhou em "${fn}" (código ${result.status}). Parei aqui.`);
    console.error(`  Se reclamou de Docker, acrescente --use-api ao comando do CLI.`);
    console.error(`  Se deu 401, é a SUPABASE_ACCESS_TOKEN velha — veja o cabeçalho deste arquivo.`);
    if (ok.length > 0) console.error(`  Já tinham subido: ${ok.join(', ')}`);
    process.exit(result.status ?? 1);
  }
  ok.push(fn);
}

console.log(`\n✔ ${ok.length} função(ões) no ar: ${ok.join(', ')}`);
console.log(`  Confira em https://supabase.com/dashboard/project/${PROJECT_REF}/functions\n`);
