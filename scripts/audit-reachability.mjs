// Monta o grafo de imports a partir de src/main.tsx e marca quais componentes
// sao alcancaveis pela aplicacao. Componente nao alcancavel = codigo morto:
// botao quebrado la dentro nao chega no usuario.
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';

const ROOT = resolve('.');
const SRC = join(ROOT, 'src');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // pacote de node_modules
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTS) {
    const cand = base + e;
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

const reachable = new Set();
const queue = [];
for (const entry of ['src/main.tsx', 'src/App.tsx']) {
  const p = join(ROOT, entry);
  if (existsSync(p)) { reachable.add(p); queue.push(p); }
}

while (queue.length) {
  const file = queue.pop();
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  for (const m of text.matchAll(IMPORT_RE)) {
    const target = resolveImport(m[1], file);
    if (target && !reachable.has(target)) { reachable.add(target); queue.push(target); }
  }
}

// todos os .tsx de produto
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(p);
  }
  return out;
}
const all = walk(SRC);
const orphans = all.filter((f) => !reachable.has(f)).map(rel).sort();

writeFileSync('audit-reachable.json', JSON.stringify([...reachable].map(rel).sort(), null, 1));
console.log(`alcancaveis: ${all.filter((f) => reachable.has(f)).length} / ${all.length} .tsx`);
console.log(`\n########## COMPONENTES ORFAOS (${orphans.length}) ##########`);
for (const o of orphans) console.log(o);
