// Quais arquivos sao exercitados pelos testes de clique.
//
// src/test/interactive-smoke.test.tsx renderiza 21 telas e clica em todo botao
// habilitado. "Exercitado" = alcancavel pelo grafo de imports de uma dessas
// telas. E limite superior, nao prova de clique elemento a elemento — por isso
// o status que sai daqui vem sempre com a ressalva do metodo.
import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';

const ROOT = resolve('.');
const SRC = join(ROOT, 'src');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

const TELAS = [
  'src/pages/Index.tsx', 'src/pages/Contacts.tsx', 'src/pages/Funnel.tsx',
  'src/pages/Campaigns.tsx', 'src/pages/Chatbots.tsx', 'src/pages/Reports.tsx',
  'src/pages/Followups.tsx', 'src/pages/Automation.tsx', 'src/pages/Tracking.tsx',
  'src/pages/Templates.tsx', 'src/pages/Notifications.tsx', 'src/pages/Help.tsx',
  'src/pages/Settings.tsx', 'src/pages/WhatsAppNumbers.tsx',
  'src/pages/Conversations.tsx', 'src/pages/dashboard/AdminDashboard.tsx',
  'src/pages/dashboard/admin/UsersPage.tsx',
  'src/pages/dashboard/admin/UsageLimitsPage.tsx',
  'src/pages/dashboard/TeamPage.tsx', 'src/pages/dashboard/StoreComparison.tsx',
  'src/components/settings/ProfileSettings.tsx',
  // pecas montadas direto no mesmo teste (moldura do dashboard e telas de estado)
  'src/components/layout/DashboardLayout.tsx',
  'src/components/layout/CommandPalette.tsx',
  'src/components/bug-report/BugReportButton.tsx',
  'src/components/auth/PaywallScreen.tsx',
  'src/components/auth/LojaOnlyNotice.tsx',
  'src/components/auth/AccountStatusScreen.tsx',
  'src/components/shared/ThemeToggle.tsx',
  'src/components/notifications/NotificationCenter.tsx',
  'src/pages/ChatbotFlowBuilder.tsx',
];

// Coberto por e2e de navegador (Playwright), clique real no Chromium.
const E2E = [
  'src/pages/LandingPage.tsx', 'src/pages/NotFound.tsx', 'src/pages/Auth.tsx',
  'src/pages/Login.tsx', 'src/pages/TermsOfService.tsx', 'src/pages/PrivacyPolicy.tsx',
];

const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolver(spec, de) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(de), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) {
    const c = base + e;
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function fecho(entradas) {
  const vistos = new Set();
  const fila = [];
  for (const e of entradas) {
    const p = join(ROOT, e);
    if (existsSync(p)) { vistos.add(p); fila.push(p); }
  }
  while (fila.length) {
    const f = fila.pop();
    let t;
    try { t = readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of t.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const alvo = resolver(m[1], f);
      if (alvo && !vistos.has(alvo)) { vistos.add(alvo); fila.push(alvo); }
    }
  }
  return new Set([...vistos].map(rel));
}

const porSmoke = fecho(TELAS);
const porE2e = fecho(E2E);

writeFileSync(
  'audit-coverage.json',
  JSON.stringify({ smoke: [...porSmoke].sort(), e2e: [...porE2e].sort() }, null, 1),
);
console.log(`exercitados pelo smoke de clique: ${porSmoke.size} arquivos`);
console.log(`exercitados pelo e2e de navegador: ${porE2e.size} arquivos`);
