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

// Devolve o conteudo de um {...} de JSX contando chaves. Um teto de tamanho
// no regex deixava de fora handler multilinha (perdia 19 dos 558 onClick).
function expressaoBalanceada(texto, idxDaChave) {
  let profundidade = 0;
  for (let i = idxDaChave; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(idxDaChave + 1, i);
    }
  }
  return texto.slice(idxDaChave + 1, idxDaChave + 200);
}

/** Cataloga todo `atributo={...}` de um arquivo, com a expressao inteira. */
function coletarHandlers(file, text, atributo, kind, push) {
  const re = new RegExp(`\\b${atributo}=\\{`, 'g');
  for (const m of text.matchAll(re)) {
    const idxChave = m.index + m[0].length - 1;
    const expr = expressaoBalanceada(text, idxChave).replace(/\s+/g, ' ').trim();
    push(file, text, m.index, kind, expr.slice(0, 160));
  }
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

  // 2b. href: '...' declarado em objeto (migalhas do PageHeader, itens de menu
  //     da Sidebar). Vira <Link to> na renderizacao, entao conta como link.
  for (const m of text.matchAll(/(?:label|name|title):\s*['"]([^'"]*)['"]\s*,\s*href:\s*['"]([^'"]*)['"]/g)) {
    push(file, text, m.index, 'link-objeto', m[2], { label: m[1] });
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

  // 5-8. handlers de produto. A expressao vem inteira (chaves balanceadas).
  coletarHandlers(file, text, 'onClick', 'onClick', push);
  coletarHandlers(file, text, 'onSubmit', 'onSubmit', push);
  coletarHandlers(file, text, 'onCheckedChange', 'toggle', push);
  coletarHandlers(file, text, 'onValueChange', 'valueChange', push);

  // 8b. <ComingSoonButton> — inerte de proposito, mas continua no inventario:
  //     sumir do checklist ao ser corrigido esconderia o que foi decidido.
  for (const m of text.matchAll(/<ComingSoonButton\b([\s\S]*?)>/g)) {
    push(file, text, m.index, 'coming-soon', m[1].replace(/\s+/g, ' ').trim().slice(0, 120));
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
