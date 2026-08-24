// Gera docs/audit-checklist.md a partir do inventario extraido.
// Reexecutavel: mantem o status ja marcado no arquivo anterior (coluna Status)
// casando por "arquivo:linha|kind|target".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const rows = JSON.parse(readFileSync('audit-inventory.json', 'utf8'));
const reachable = new Set(JSON.parse(readFileSync('audit-reachable.json', 'utf8')));
const OUT = 'docs/audit-checklist.md';

// ---- status preservado entre execucoes -------------------------------------
const previous = new Map();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    const m = line.match(/^\| `([^`]+)` \| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \|$/);
    if (m) previous.set(m[1].trim(), m[5].trim());
  }
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
  onClick: 'Botão / handler de clique',
  onSubmit: 'Envio de formulário',
  toggle: 'Interruptor / checkbox',
  valueChange: 'Select / aba / radio',
  'button-no-handler': '⚠️ Botão sem handler',
  'button-radix-trigger': 'Botão gatilho (Radix `asChild`)',
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

| Status | Significado |
| --- | --- |
| \`não testado\` | ainda não verificado |
| \`passa\` | testado, funciona |
| \`quebrado\` | testado, defeito confirmado |
| \`corrigido\` | estava quebrado, corrigido e reteste passou |
| \`inerte de propósito\` | não faz nada por decisão de produto (em breve, desabilitado por permissão, desabilitado durante requisição) |
| \`código órfão\` | está num arquivo que nenhuma rota alcança — não chega ao usuário |
| \`decisão sua\` | não dá para saber se é bug ou escolha; listado no relatório final |

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

const areaNames = [...grouped.keys()].sort();
md += `| Área | Elementos |\n| --- | --- |\n`;
for (const a of areaNames) md += `| ${a} | ${grouped.get(a).length} |\n`;
md += `\n---\n\n`;

for (const a of areaNames) {
  const list = grouped.get(a).sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  md += `## ${a}\n\n`;
  md += `| Local | Tipo | Rótulo / ícone | O que deve fazer | Status |\n| --- | --- | --- | --- | --- |\n`;
  for (const r of list) {
    const key = `${r.file}:${r.line}`;
    const isOrphan = !reachable.has(r.file);
    const should = r.kind === 'link' || r.kind === 'anchor' || r.kind === 'navigate' || r.kind === 'window-open'
      ? `navegar para \`${esc(r.target)}\``
      : `executar \`${esc(r.target)}\``;
    const status = previous.get(key) || (isOrphan ? 'código órfão' : 'não testado');
    md += `| \`${key}\` | ${KIND_LABEL[r.kind] || r.kind} | ${esc(r.label) || '—'} | ${should} | ${status} |\n`;
  }
  md += `\n`;
}

if (!existsSync('docs')) mkdirSync('docs');
writeFileSync(OUT, md);
console.log(`${OUT} escrito: ${total} entradas, ${areaNames.length} areas`);
