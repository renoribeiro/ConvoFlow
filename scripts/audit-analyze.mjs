// Analisa audit-inventory.json e aponta os suspeitos.
import { readFileSync } from 'node:fs';

const allRows = JSON.parse(readFileSync('audit-inventory.json', 'utf8'));
const reachable = new Set(JSON.parse(readFileSync('audit-reachable.json', 'utf8')));
const ONLY = process.argv.includes('--orphans') ? 'orphan' : 'reachable';
const rows = allRows.filter((r) =>
  ONLY === 'reachable' ? reachable.has(r.file) : !reachable.has(r.file)
);
console.log(`### escopo: ${ONLY} — ${rows.length} de ${allRows.length} elementos`);

// Rotas reais declaradas em src/App.tsx
const ROUTES = [
  '/', '/auth', '/definir-senha', '/login', '/register',
  '/terms-of-service', '/privacy-policy',
  '/dashboard',
  '/dashboard/conversations', '/dashboard/contacts', '/dashboard/funnel',
  '/dashboard/tracking', '/dashboard/reports', '/dashboard/chatbots',
  '/dashboard/campaigns', '/dashboard/templates', '/dashboard/followups',
  '/dashboard/automation', '/dashboard/whatsapp-numbers', '/dashboard/settings',
  '/dashboard/admin', '/dashboard/admin/users', '/dashboard/admin/usage-limits',
  '/dashboard/team', '/dashboard/store-comparison', '/dashboard/profile',
  '/dashboard/notifications', '/dashboard/help',
];
const DYNAMIC = [/^\/dashboard\/chatbots\/[^/]+\/builder$/];

const routeExists = (p) => {
  const path = p.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
  if (ROUTES.includes(path)) return true;
  return DYNAMIC.some((re) => re.test(path));
};

const out = (title, list) => {
  console.log(`\n########## ${title} (${list.length}) ##########`);
  for (const r of list) console.log(`${r.file}:${r.line} | ${r.kind} | "${r.label}" | ${r.target}`);
};

const navish = rows.filter((r) => ['link', 'link-objeto', 'anchor', 'navigate', 'window-open'].includes(r.kind));

const internal = navish.filter((r) => typeof r.target === 'string' && r.target.startsWith('/'));
out('LINKS INTERNOS QUEBRADOS (rota inexistente)', internal.filter((r) => !routeExists(r.target)));
out('LINKS INTERNOS OK', internal.filter((r) => routeExists(r.target)));

out('LINKS EXTERNOS', navish.filter((r) => /^https?:/.test(String(r.target))));
out('ANCORAS / PROTOCOLOS / VAZIOS', navish.filter((r) => {
  const t = String(r.target);
  return !t.startsWith('/') && !/^https?:/.test(t);
}));

// handlers vazios ou de mentira
const stub = rows.filter((r) => {
  const t = String(r.target);
  return /^\(\s*\)\s*=>\s*\{\s*\}$/.test(t) ||
    /console\.(log|warn|debug)/.test(t) ||
    /^\(\s*\)\s*=>\s*(null|undefined|void 0)$/.test(t) ||
    /TODO|FIXME|nao implementado|não implementado|not implemented/i.test(t);
});
out('HANDLERS VAZIOS / STUB', stub);

out('BOTOES SEM HANDLER (candidatos)', rows.filter((r) => r.kind === 'button-no-handler'));
