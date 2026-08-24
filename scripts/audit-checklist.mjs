// Gera docs/audit-checklist.md a partir do inventario extraido.
// Reexecutavel: mantem o status ja marcado no arquivo anterior (coluna Status)
// casando por "arquivo:linha|kind|target".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const rows = JSON.parse(readFileSync('audit-inventory.json', 'utf8'));
const reachable = new Set(JSON.parse(readFileSync('audit-reachable.json', 'utf8')));
const cobertura = existsSync('audit-coverage.json')
  ? JSON.parse(readFileSync('audit-coverage.json', 'utf8'))
  : { smoke: [], e2e: [] };
const porSmoke = new Set(cobertura.smoke);
const porE2e = new Set(cobertura.e2e);
const OUT = 'docs/audit-checklist.md';

/** Status padrao quando nao ha veredicto escrito a mao. */
function statusPadrao(file) {
  if (!reachable.has(file)) return ['código órfão', 'arquivo não alcançável a partir de `src/main.tsx`'];
  if (porE2e.has(file)) return ['passa (e2e navegador)', 'clique real no Chromium — `e2e/landing.spec.ts`'];
  if (porSmoke.has(file)) return [
    'passa (clique automatizado)',
    'renderizado e clicado em `src/test/interactive-smoke.test.tsx`; handler resolvido por `scripts/audit-handlers.mjs`',
  ];
  return ['não testado', ''];
}

// ---- veredictos da auditoria ------------------------------------------------
// docs/audit-status.json e a fonte da verdade dos status. Chaves aceitas:
//   "src/x/Y.tsx:123"  -> um elemento
//   "src/x/Y.tsx"      -> todos os elementos do arquivo (default do arquivo)
//   "src/x/"           -> todos os elementos da pasta (prefixo)
const STATUS_FILE = 'docs/audit-status.json';
const verdicts = existsSync(STATUS_FILE)
  ? JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
  : {};
const prefixKeys = Object.keys(verdicts)
  .filter((k) => k.endsWith('/'))
  .sort((a, b) => b.length - a.length);

function verdictFor(file, line) {
  if (verdicts[`${file}:${line}`]) return verdicts[`${file}:${line}`];
  if (verdicts[file]) return verdicts[file];
  const p = prefixKeys.find((k) => file.startsWith(k));
  return p ? verdicts[p] : null;
}

// ---- areas -----------------------------------------------------------------
const AREAS = [
  [/^src\/components\/landing\//, 'Landing (página de vendas)'],
  [/^src\/pages\/LandingPage/, 'Landing (página de vendas)'],
  [/^src\/pages\/(Auth|Login|Register|DefinirSenha)/, 'Autenticação'],
  [/^src\/components\/auth\//, 'Autenticação'],
  [/^src\/pages\/(TermsOfService|PrivacyPolicy)/, 'Páginas legais'],
  [/^src\/components\/layout\//, 'Layout / navegação'],
  [/^src\/components\/conversations\//, 'Conversas'],
  [/^src\/pages\/Conversations/, 'Conversas'],
  [/^src\/components\/contacts\//, 'Contatos'],
  [/^src\/pages\/Contacts/, 'Contatos'],
  [/^src\/components\/funnel\//, 'Funil'],
  [/^src\/pages\/Funnel/, 'Funil'],
  [/^src\/components\/campaigns\//, 'Campanhas'],
  [/^src\/pages\/Campaigns/, 'Campanhas'],
  [/^src\/components\/chatbots\//, 'Chatbots'],
  [/^src\/components\/chatbot\//, 'Chatbots'],
  [/^src\/pages\/Chatbot/, 'Chatbots'],
  [/^src\/components\/(reports|analytics)\//, 'Relatórios'],
  [/^src\/pages\/Reports/, 'Relatórios'],
  [/^src\/components\/automation\//, 'Automação'],
  [/^src\/pages\/Automation/, 'Automação'],
  [/^src\/components\/followups\//, 'Follow-ups'],
  [/^src\/pages\/Followups/, 'Follow-ups'],
  [/^src\/components\/tracking\//, 'Rastreamento'],
  [/^src\/pages\/Tracking/, 'Rastreamento'],
  [/^src\/components\/(whatsapp|webhook)\//, 'WhatsApp / webhooks'],
  [/^src\/pages\/WhatsAppNumbers/, 'WhatsApp / webhooks'],
  [/^src\/components\/(settings|integrations)\//, 'Configurações'],
  [/^src\/pages\/Settings/, 'Configurações'],
  [/^src\/components\/(admin|users|billing)\//, 'Administração'],
  [/^src\/pages\/dashboard\//, 'Administração'],
  [/^src\/components\/dashboard\//, 'Dashboard (início)'],
  [/^src\/pages\/(Index|Dashboard)/, 'Dashboard (início)'],
  [/^src\/pages\/(Templates|Help|Notifications|Profile|NotFound)/, 'Outras telas'],
  [/^src\/components\/(shared|ui|ErrorBound|debug|monitoring|backup|audit|api|notifications|pwa|performance)\//, 'Compartilhado / infra'],
];
const areaOf = (f) => (AREAS.find(([re]) => re.test(f)) || [null, 'Outros'])[1];

const KIND_LABEL = {
  link: 'Link interno (`<Link to>`)',
  anchor: 'Âncora (`<a href>`)',
  navigate: 'Navegação programática',
  'window-open': 'Abre URL externa',
  'link-objeto': 'Link declarado em objeto (migalha / menu)',
  onClick: 'Botão / handler de clique',
  onSubmit: 'Envio de formulário',
  toggle: 'Interruptor / checkbox',
  valueChange: 'Select / aba / radio',
  'button-no-handler': '⚠️ Botão sem handler',
  'button-radix-trigger': 'Botão gatilho (Radix `asChild`)',
  'coming-soon': 'Botão inerte de propósito (`ComingSoonButton`)',
};

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

const grouped = new Map();
for (const r of rows) {
  const a = areaOf(r.file);
  if (!grouped.has(a)) grouped.set(a, []);
  grouped.get(a).push(r);
}

let md = `# Checklist de auditoria — botões, links e elementos interativos

> Gerado por \`scripts/audit-extract-interactive.mjs\` + \`scripts/audit-checklist.mjs\`.
> Reexecute com \`node scripts/audit-extract-interactive.mjs . && node scripts/audit-reachability.mjs && node scripts/audit-checklist.mjs\`.
> O status já marcado é preservado entre execuções.

## Legenda de status

| Status | O que foi feito — e o que isso prova |
| --- | --- |
| \`passa (e2e navegador)\` | clicado de verdade no Chromium (\`e2e/landing.spec.ts\`) e o destino conferido. É a verificação mais forte daqui. |
| \`passa (clique automatizado)\` | a tela foi renderizada e **todo botão habilitado foi clicado** em \`src/test/interactive-smoke.test.tsx\` sem lançar; o handler foi resolvido para um símbolo real por \`scripts/audit-handlers.mjs\`; link interno conferido contra as rotas de \`App.tsx\` por \`src/test/routes-integrity.test.ts\`. **Não prova** que a ação chegou ao banco — o Supabase está mockado. |
| \`passa\` | verificado à mão, com a razão na coluna de observação |
| \`corrigido\` | estava quebrado, foi corrigido e o reteste passou |
| \`inerte de propósito\` | não faz nada por decisão de produto (em breve, desabilitado por permissão, desabilitado durante requisição) |
| \`código órfão\` | está num arquivo que nenhuma rota alcança — botão quebrado ali não chega ao usuário |
| \`decisão sua\` | não dá para saber qual é o comportamento certo; listado no relatório final |
| \`não testado\` | ainda não verificado |

### O que nenhum status aqui cobre

Entrar no dashboard exige sessão real do Supabase, e este projeto não tem
usuário de teste. Então **nenhum elemento das telas logadas foi clicado num
navegador de verdade contra o banco de verdade** — o mais perto disso é o
\`passa (clique automatizado)\`, que roda em jsdom com o Supabase mockado.

Os quatro cargos (superadmin, gerente, gestor, atendente) **foram** exercitados:
a mesma bateria de cliques roda uma vez por cargo, e quem decide o que cada um
alcança são as funções reais do projeto (\`roleAtLeast\`, \`resolveCapabilities\`,
\`can\`), não uma tabela reescrita no teste. O que continua sem cobertura é o
efeito no banco: se o clique gravou, respeitou RLS e voltou o dado certo.

## Rotas reais (fonte da verdade: \`src/App.tsx\`)

Públicas: \`/\`, \`/auth\`, \`/definir-senha\`, \`/login\`, \`/register\` (redireciona para \`/auth\`), \`/terms-of-service\`, \`/privacy-policy\`

Dashboard: \`/dashboard\`, \`conversations\`, \`contacts\`, \`funnel\`, \`tracking\`, \`reports\`, \`chatbots\`, \`chatbots/:id/builder\`, \`campaigns\`, \`templates\`, \`followups\`, \`automation\`, \`whatsapp-numbers\`, \`settings\`, \`admin\`, \`admin/users\`, \`admin/usage-limits\`, \`team\`, \`store-comparison\`, \`profile\`, \`notifications\`, \`help\`

Qualquer outro caminho cai em \`NotFound\`.

`;

// resumo
const total = rows.length;
const orphanCount = rows.filter((r) => !reachable.has(r.file)).length;
md += `## Resumo\n\n`;
md += `- Elementos interativos catalogados: **${total}**\n`;
md += `- Em arquivos alcançáveis pela aplicação: **${total - orphanCount}**\n`;
md += `- Em arquivos órfãos (código morto): **${orphanCount}**\n\n`;

const tally = {};
for (const r of rows) {
  const v = verdictFor(r.file, r.line);
  const s = v?.status || statusPadrao(r.file)[0];
  tally[s] = (tally[s] || 0) + 1;
}
md += `| Status | Elementos |\n| --- | --- |\n`;
for (const [s, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  md += `| ${s} | ${n} |\n`;
}
md += `\n`;

// ---- destaques: o que foi corrigido e o que depende de decisao -------------
// Um item por veredicto (a mesma nota pode valer para varios elementos).
function destaque(titulo, alvo, intro) {
  const vistos = new Set();
  const itens = [];
  for (const r of rows) {
    const v = verdictFor(r.file, r.line);
    if (v?.status !== alvo) continue;
    const chave = v.nota || r.file;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push({ local: `${r.file}:${r.line}`, rotulo: r.label, nota: v.nota || '' });
  }
  if (!itens.length) return '';
  let bloco = `## ${titulo}\n\n${intro}\n\n`;
  for (const i of itens) {
    const rotulo = i.rotulo ? ` — ${esc(i.rotulo)}` : '';
    bloco += `- **\`${i.local}\`**${rotulo}\n  ${esc(i.nota)}\n`;
  }
  return `${bloco}\n`;
}

md += destaque(
  'Precisa da sua decisão',
  'decisão sua',
  'Dá para ver que algo está errado, mas não dá para saber qual é o comportamento certo sem você dizer. Não mexi em nenhum destes.',
);
md += destaque(
  'Corrigido nesta auditoria',
  'corrigido',
  'Cada um estava quebrado de verdade, foi corrigido, e o reteste passou.',
);
md += `---\n\n`;

const areaNames = [...grouped.keys()].sort();
md += `| Área | Elementos |\n| --- | --- |\n`;
for (const a of areaNames) md += `| ${a} | ${grouped.get(a).length} |\n`;
md += `\n---\n\n`;

for (const a of areaNames) {
  const list = grouped.get(a).sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  md += `## ${a}\n\n`;
  md += `| Local | Tipo | Rótulo / ícone | O que deve fazer | Status | Observação |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const r of list) {
    const key = `${r.file}:${r.line}`;
    const isOrphan = !reachable.has(r.file);
    const should = ['link', 'link-objeto', 'anchor', 'navigate', 'window-open'].includes(r.kind)
      ? `navegar para \`${esc(r.target)}\``
      : `executar \`${esc(r.target)}\``;
    const v = verdictFor(r.file, r.line);
    const [padrao, notaPadrao] = statusPadrao(r.file);
    const status = v?.status || padrao;
    const nota = v?.nota || notaPadrao;
    md += `| \`${key}\` | ${KIND_LABEL[r.kind] || r.kind} | ${esc(r.label) || '—'} | ${should} | ${status} | ${esc(nota)} |\n`;
  }
  md += `\n`;
}

if (!existsSync('docs')) mkdirSync('docs');
writeFileSync(OUT, md);
console.log(`${OUT} escrito: ${total} entradas, ${areaNames.length} areas`);
