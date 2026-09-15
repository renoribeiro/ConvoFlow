/**
 * Todo rótulo de tela citado entre aspas na ajuda existe de verdade no código.
 *
 * Por que: em 2026-09-15 a auditoria da ajuda achou passos mandando clicar em
 * "Salvar na variável" (o campo é "Salvar resposta como variável"), abrir a
 * "aba Histórico" (a aba é "Entregas"), marcar "correspondência exata" (a caixa
 * é "Correspondência exata") e esperar "link expirado" (a tela diz "Este link
 * expirou ou já foi usado"). Passo-a-passo com rótulo errado para o leitor no
 * meio do caminho, e nenhum teste via isso — este vê.
 *
 * ESCOPO — e por que não é tudo:
 *   - tutorials.ts inteiro (título, objetivo, público, passos, notas): tutorial
 *     é passo-a-passo, cada aspa ali é um botão, campo ou mensagem.
 *   - featureHelp.ts só em `howToConfigure`: é a parte instrucional. `example`
 *     e `tips` citam sobretudo CONTEÚDO de exemplo ("Olá {first_name}!",
 *     "lead-quente", "Visita agendada"…) — medido: 33 aspas em example e 7 em
 *     tips que não são rótulo nenhum. Cobrir esses campos exigiria uma lista de
 *     exceções maior que a lista de acertos.
 *
 * Aspas que citam conteúdo de exemplo dentro do escopo entram em EXEMPLOS,
 * com o motivo. Antes de acrescentar algo lá, pergunte: é rótulo de tela? Se
 * for, o certo é corrigir o texto, não a lista.
 *
 * O corpus é o src/ (menos testes e a própria pasta de ajuda) mais as Edge
 * Functions e as migrações — títulos de notificação nascem no SQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FEATURE_HELP } from './featureHelp';
import { TUTORIALS } from './tutorials';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

/** Conteúdo de exemplo citado entre aspas em passos — não é rótulo de tela. */
const EXEMPLOS: ReadonlyArray<string> = [
  'Aguarde, vou te transferir...', // transfer_agent: exemplo de mensagem de transição
  'Visita agendada', // page:funnel, montar-funil: exemplo de nome de etapa
  'Qual bairro você procura?', // primeiro-chatbot: exemplo de pergunta do bot
];

const toPosix = (p: string) => p.split(path.sep).join('/');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!/^(node_modules|dist)$/.test(item.name)) collectSourceFiles(full, out);
      continue;
    }
    if (!/\.(ts|tsx|sql)$/.test(item.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(item.name)) continue;
    // A própria ajuda não conta como prova: senão o rótulo errado se confirmaria sozinho.
    if (toPosix(full).includes('/src/lib/help/')) continue;
    out.push(full);
  }
  return out;
}

const corpus = [
  ...collectSourceFiles(path.join(ROOT, 'src')),
  ...collectSourceFiles(path.join(ROOT, 'supabase', 'functions')),
  ...collectSourceFiles(path.join(ROOT, 'supabase', 'migrations')),
]
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')
  // Títulos dos tutoriais também são "rótulos" que a referência cita.
  .concat('\n', TUTORIALS.map((t) => t.title).join('\n'));

/** Trechos entre aspas duplas (2 a 80 caracteres, sem quebra de linha). */
function quoted(text: string | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/"([^"\n]{2,80})"/g)].map((m) => m[1]);
}

const missing = (labels: string[]): string[] =>
  labels.filter((label) => !EXEMPLOS.includes(label) && !corpus.includes(label));

describe('rótulos citados na ajuda existem no código', () => {
  it('o corpus foi montado (a varredura em si funciona)', () => {
    expect(corpus.length).toBeGreaterThan(100_000);
    expect(corpus).toContain('Salvar resposta como variável');
    expect(corpus).not.toContain('Salvar na variável');
  });

  it('todo rótulo entre aspas nos tutoriais existe no src/', () => {
    const broken = TUTORIALS.flatMap((tutorial) => [
      ...missing([...quoted(tutorial.goal), ...quoted(tutorial.forWhom)]).map(
        (label) => `${tutorial.id}: "${label}"`,
      ),
      ...tutorial.steps.flatMap((step, index) =>
        missing([...quoted(step.title), ...quoted(step.body), ...quoted(step.note)]).map(
          (label) => `${tutorial.id} passo ${index + 1}: "${label}"`,
        ),
      ),
    ]);
    expect(
      broken,
      'Rótulo citado num tutorial que não existe em nenhum componente. Corrija o texto (ou, se for conteúdo de exemplo, acrescente a EXEMPLOS com o motivo).',
    ).toEqual([]);
  });

  it('todo rótulo entre aspas nos passos (howToConfigure) da ajuda existe no src/', () => {
    const broken = Object.entries(FEATURE_HELP).flatMap(([key, entry]) =>
      entry.howToConfigure.flatMap((step, index) =>
        missing(quoted(step)).map((label) => `${key} passo ${index + 1}: "${label}"`),
      ),
    );
    expect(
      broken,
      'Rótulo citado num passo da ajuda que não existe em nenhum componente. Corrija o texto (ou, se for conteúdo de exemplo, acrescente a EXEMPLOS com o motivo).',
    ).toEqual([]);
  });

  it('a lista de exemplos não esconde rótulo real', () => {
    // Se um item de EXEMPLOS passar a existir no código, ele deixou de ser
    // exceção — tire-o da lista para o teste voltar a vigiá-lo.
    const agoraExistem = EXEMPLOS.filter((label) => corpus.includes(label));
    expect(agoraExistem).toEqual([]);
  });
});
