// Extrator de elementos interativos do ConvoFlow.
// Varre src/**/*.tsx e cataloga links, botoes, forms, toggles, selects e tabs.
// Saida: JSON (audit-inventory.json) para analise posterior.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.argv[2];
const SRC = join(ROOT, 'src');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// Extrai um rotulo legivel a partir do trecho de JSX depois do match.
function labelFrom(text, idx) {
  const chunk = text.slice(idx, idx + 700);
  // texto entre > e < que nao seja so espaco/chave
  const texts = [...chunk.matchAll(/>\s*([^<>{}\n][^<>{}]{1,60}?)\s*</g)]
    .map((m) => m[1].trim())
    .filter((t) => t && !/^[\s|·•\-–—]+$/.test(t));
  if (texts.length) return texts[0];
  // t('...') ou label={'...'}
  const lit = chunk.match(/(?:title|label|aria-label)=["'{]\s*["']?([^"'}\n]{2,60})/);
  if (lit) return lit[1].trim();
  // nome de icone lucide
  const icon = chunk.match(/<([A-Z][A-Za-z0-9]*)\s+className="[^"]*h-\d/);
  if (icon) return `[icone ${icon[1]}]`;
  const anyIcon = chunk.match(/<([A-Z][A-Za-z0-9]*)\s*\/>/);
  if (anyIcon) return `[icone ${anyIcon[1]}]`;
  return '';
}

const files = walk(SRC);
const rows = [];
let id = 0;

const push = (file, text, idx, kind, target, extra = {}) => {
  rows.push({
    id: ++id,
    file: relative(ROOT, file).split(sep).join('/'),
    line: lineOf(text, idx),
    kind,
    target,
    label: labelFrom(text, idx),
    ...extra,
  });
};

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const isUi = /src[\\/]components[\\/]ui[\\/]/.test(file);

  // 1. <Link to="..."> / <NavLink to="...">
  for (const m of text.matchAll(/<(?:Link|NavLink)\b[^>]*?\sto=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    push(file, text, m.index, 'link', t, { dynamic: m[1] === undefined });
  }

  // 2. <a href="...">
  for (const m of text.matchAll(/<a\b[^>]*?\shref=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    push(file, text, m.index, 'anchor', t, { dynamic: m[1] === undefined });
  }

  // 3. navigate('/...') programatico
  for (const m of text.matchAll(/navigate\(\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    push(file, text, m.index, 'navigate', t);
  }

  // 4. window.open / window.location
  for (const m of text.matchAll(/window\.(?:open|location(?:\.href)?\s*=)\s*\(?\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
    const t = m[1] ?? m[2] ?? m[3];
    push(file, text, m.index, 'window-open', t);
  }

  if (isUi) continue; // primitivos shadcn: sem handlers proprios de produto

  // 5. onClick
  for (const m of text.matchAll(/onClick=\{([\s\S]{0,160}?)\}\s*(?=\n|\/|>|[a-zA-Z-]+=)/g)) {
    push(file, text, m.index, 'onClick', m[1].replace(/\s+/g, ' ').trim().slice(0, 120));
  }

  // 6. onSubmit
  for (const m of text.matchAll(/onSubmit=\{([\s\S]{0,120}?)\}/g)) {
    push(file, text, m.index, 'onSubmit', m[1].replace(/\s+/g, ' ').trim().slice(0, 120));
  }

  // 7. toggles / switches / checkboxes
  for (const m of text.matchAll(/onCheckedChange=\{([\s\S]{0,140}?)\}\s*(?=\n|\/|>|[a-zA-Z-]+=)/g)) {
    push(file, text, m.index, 'toggle', m[1].replace(/\s+/g, ' ').trim().slice(0, 120));
  }

  // 8. selects / tabs / radios
  for (const m of text.matchAll(/onValueChange=\{([\s\S]{0,140}?)\}\s*(?=\n|\/|>|[a-zA-Z-]+=)/g)) {
    push(file, text, m.index, 'valueChange', m[1].replace(/\s+/g, ' ').trim().slice(0, 120));
  }

  // 9. <Button ...> sem onClick, sem type=submit, sem asChild => candidato a botao morto.
  //    Botao dentro de <XTrigger asChild> herda o handler do Radix: nao e morto.
  for (const m of text.matchAll(/<Button\b([\s\S]*?)>/g)) {
    const attrs = m[1];
    if (attrs.includes('onClick') || attrs.includes('asChild') || /type=["']submit["']/.test(attrs)) continue;
    const before = text.slice(Math.max(0, m.index - 300), m.index);
    const wrappedByTrigger = /<[A-Za-z]*Trigger\b[^>]*\basChild\b[^>]*>\s*$/.test(before);
    const kind = wrappedByTrigger ? 'button-radix-trigger' : 'button-no-handler';
    push(file, text, m.index, kind, attrs.replace(/\s+/g, ' ').trim().slice(0, 120));
  }
}

writeFileSync(join(ROOT, 'audit-inventory.json'), JSON.stringify(rows, null, 1));
const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
console.log('total:', rows.length);
console.log(byKind);
