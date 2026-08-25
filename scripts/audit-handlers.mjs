// Confere se todo handler referenciado por um elemento interativo existe de
// verdade no arquivo. onClick={handleFoo} com handleFoo indefinido nao quebra
// o build (o TS do projeto ja tem centenas de erros) mas explode no clique.
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync('audit-inventory.json', 'utf8'));
const reachable = new Set(JSON.parse(readFileSync('audit-reachable.json', 'utf8')));

const HANDLER_KINDS = ['onClick', 'onSubmit', 'toggle', 'valueChange'];

// Coisas que nao sao "funcao do arquivo": globais, membros e palavras-chave.
const GLOBAIS = new Set([
  'console', 'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
  'Math', 'JSON', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Promise', 'Set', 'Map', 'URL', 'Blob', 'FormData', 'File', 'Error', 'e',
  'event', 'evt', 'ev', 'setTimeout', 'setInterval', 'alert', 'confirm', 'true',
  'false', 'null', 'undefined', 'void', 'async', 'await', 'return', 'if', 'else',
  'new', 'typeof', 'delete', 'this', 'super', 'React',
]);

function declarado(texto, nome) {
  const padroes = [
    new RegExp(`\\b(?:const|let|var)\\s+${nome}\\b`),
    new RegExp(`\\b(?:async\\s+)?function\\s+${nome}\\b`),
    new RegExp(`import[^;]*\\b${nome}\\b[^;]*from`),
    // destructuring: { a, nome, b } = ... / props do componente
    new RegExp(`\\{[^{}]*\\b${nome}\\b[^{}]*\\}\\s*(?:=|\\)|:)`),
    // destructuring de array: const [valor, nome] = useState(...)
    new RegExp(`\\[[^\\][]*\\b${nome}\\b[^\\][]*\\]\\s*=`),
    // parametro de arrow/funcao: (nome) => / (a, nome) =>
    new RegExp(`\\(([^()]*,\\s*)?${nome}\\s*[,)][^)]*\\)\\s*=>`),
    // propriedade de objeto / interface
    new RegExp(`\\b${nome}\\s*[?]?\\s*:`),
  ];
  return padroes.some((re) => re.test(texto));
}

const cache = new Map();
const lerArquivo = (f) => {
  if (!cache.has(f)) cache.set(f, readFileSync(f, 'utf8'));
  return cache.get(f);
};

const suspeitos = [];
for (const r of rows) {
  if (!HANDLER_KINDS.includes(r.kind)) continue;
  if (!reachable.has(r.file)) continue;

  const expr = String(r.target || '');
  // identificador raiz chamado: "handleX" ou "() => handleX(...)" ou "() => { handleX("
  const nomes = new Set();
  const bare = expr.match(/^([A-Za-z_$][\w$]*)$/);
  if (bare) nomes.add(bare[1]);
  // Chamada de funcao livre. O (?<![.?]) descarta metodo (obj.metodo(),
  // obj?.metodo()): quem responde por ele e o objeto, nao o arquivo.
  for (const m of expr.matchAll(/(?<![.?\w$])([A-Za-z_$][\w$]*)\s*\(/g)) nomes.add(m[1]);

  const texto = lerArquivo(r.file);
  for (const nome of nomes) {
    if (GLOBAIS.has(nome) || nome.length < 2) continue;
    if (declarado(texto, nome)) continue;
    suspeitos.push({ ...r, nome });
  }
}

console.log(`########## HANDLERS QUE NAO RESOLVEM (${suspeitos.length}) ##########`);
for (const s of suspeitos) {
  console.log(`${s.file}:${s.line} | ${s.kind} | "${s.label}" | ${s.nome} | ${s.target}`);
}
