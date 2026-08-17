/**
 * Garantias dos tutoriais.
 *
 * Tutorial aponta para FORA de si mesmo: rotas (`screen`) e entradas de
 * documentação (`helpKey`). Renomear uma rota ou apagar uma entrada quebraria o
 * tutorial em silêncio — os dois primeiros testes existem para isso não passar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  TUTORIALS,
  TUTORIAL_KEY_PREFIX,
  getTutorial,
  getTutorialByKey,
  tutorialKey,
  tutorialMatches,
} from './tutorials';
import { FEATURE_HELP, getFeatureHelp } from './featureHelp';
import { ROLE_ORDER } from '@/types/userHierarchy';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, '..', '..');

/**
 * Rotas reais do dashboard, lidas de App.tsx.
 *
 * As rotas filhas aparecem como `path="conversations"` dentro do `/dashboard`,
 * então o prefixo é reconstruído aqui. Rotas com parâmetro (`:id`) ficam de fora
 * de propósito: não há como linkar para elas sem um id concreto.
 */
function realDashboardRoutes(): string[] {
  const source = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
  const paths = [...source.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1] ?? '');

  const routes = new Set<string>(['/dashboard']);
  for (const raw of paths) {
    if (!raw || raw.startsWith('/') || raw === '*') continue; // públicas e catch-all
    if (raw.includes(':')) continue; // parametrizada
    routes.add(`/dashboard/${raw}`);
  }
  return [...routes];
}

describe('integridade dos tutoriais', () => {
  it('existe pelo menos um tutorial e todos têm id único', () => {
    expect(TUTORIALS.length).toBeGreaterThan(0);
    const ids = TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size, `ids repetidos em ${ids.join(', ')}`).toBe(ids.length);
  });

  it('todo `screen` de todo passo é uma rota real definida em App.tsx', () => {
    const routes = realDashboardRoutes();

    const broken = TUTORIALS.flatMap((tutorial) =>
      tutorial.steps
        .map((step, index) => ({ tutorial, step, index }))
        .filter(({ step }) => step.screen && !routes.includes(step.screen))
        .map(
          ({ tutorial, step, index }) =>
            `${tutorial.id} passo ${index + 1} → ${step.screen}`,
        ),
    );

    expect(
      broken,
      `Rotas válidas: ${routes.sort().join(', ')}`,
    ).toEqual([]);
  });

  it('todo `helpKey` de todo passo existe em FEATURE_HELP', () => {
    const broken = TUTORIALS.flatMap((tutorial) =>
      tutorial.steps
        .map((step, index) => ({ tutorial, step, index }))
        .filter(({ step }) => step.helpKey && !getFeatureHelp(step.helpKey))
        .map(
          ({ tutorial, step, index }) =>
            `${tutorial.id} passo ${index + 1} → ${step.helpKey}`,
        ),
    );

    expect(broken, 'Passos apontando para entrada de ajuda inexistente').toEqual([]);
  });

  it('todo tutorial tem título, objetivo, público e passos', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorial.title.trim(), `${tutorial.id}: title vazio`).not.toBe('');
      expect(tutorial.goal.trim(), `${tutorial.id}: goal vazio`).not.toBe('');
      expect(tutorial.forWhom.trim(), `${tutorial.id}: forWhom vazio`).not.toBe('');
      expect(tutorial.steps.length, `${tutorial.id}: sem passos`).toBeGreaterThan(0);
    }
  });

  it('cada tutorial tem entre 5 e 9 passos', () => {
    // Mais que isso já é outro tutorial; menos que isso não guia ninguém.
    const outOfRange = TUTORIALS.filter(
      (t) => t.steps.length < 5 || t.steps.length > 9,
    ).map((t) => `${t.id} (${t.steps.length})`);
    expect(outOfRange).toEqual([]);
  });

  it('todo passo tem título e corpo preenchidos', () => {
    for (const tutorial of TUTORIALS) {
      tutorial.steps.forEach((step, index) => {
        const where = `${tutorial.id} passo ${index + 1}`;
        expect(step.title.trim(), `${where}: title vazio`).not.toBe('');
        expect(step.body.trim(), `${where}: body vazio`).not.toBe('');
        if (step.note !== undefined) {
          expect(step.note.trim(), `${where}: note vazio`).not.toBe('');
        }
      });
    }
  });

  it('todo minRole declarado é um cargo válido', () => {
    const invalid = TUTORIALS.filter((t) => t.minRole && !(t.minRole in ROLE_ORDER)).map(
      (t) => `${t.id} → ${t.minRole}`,
    );
    expect(invalid).toEqual([]);
  });

  it('todo moduleName declarado existe como ModuleGuard em App.tsx', () => {
    const source = fs.readFileSync(path.join(SRC_DIR, 'App.tsx'), 'utf8');
    const guarded = new Set(
      [...source.matchAll(/moduleName=["']([^"']+)["']/g)].map((m) => m[1]),
    );
    const unknown = TUTORIALS.filter((t) => t.moduleName && !guarded.has(t.moduleName)).map(
      (t) => `${t.id} → ${t.moduleName}`,
    );
    expect(unknown, `Módulos em App.tsx: ${[...guarded].sort().join(', ')}`).toEqual([]);
  });

  it('nenhuma entrada de FEATURE_HELP usa a categoria "tutorial"', () => {
    // Tutorial tem forma própria e mora em tutorials.ts. Se uma entrada de
    // referência se declarasse 'tutorial', ela sumiria da página.
    const misplaced = Object.entries(FEATURE_HELP)
      .filter(([, entry]) => entry.category === ('tutorial' as never))
      .map(([key]) => key);
    expect(misplaced).toEqual([]);
  });
});

describe('helpers de tutorial', () => {
  it('getTutorial acha por id e devolve null para desconhecido', () => {
    expect(getTutorial('conectar-whatsapp')?.title).toBe('Conectar seu WhatsApp');
    expect(getTutorial('nao-existe')).toBeNull();
    expect(getTutorial(null)).toBeNull();
    expect(getTutorial(undefined)).toBeNull();
    expect(getTutorial('')).toBeNull();
  });

  it('tutorialKey monta a chave do link profundo', () => {
    expect(tutorialKey('conectar-whatsapp')).toBe('tutorial:conectar-whatsapp');
    expect(TUTORIAL_KEY_PREFIX).toBe('tutorial:');
  });

  it('getTutorialByKey só aceita chave com o prefixo', () => {
    expect(getTutorialByKey('tutorial:montar-funil')?.id).toBe('montar-funil');
    expect(getTutorialByKey('montar-funil')).toBeNull();
    expect(getTutorialByKey('page:funnel')).toBeNull();
    expect(getTutorialByKey(null)).toBeNull();
  });

  it('a chave de todo tutorial resolve de volta para ele', () => {
    for (const tutorial of TUTORIALS) {
      expect(getTutorialByKey(tutorialKey(tutorial.id))).toBe(tutorial);
    }
  });
});

describe('busca em tutoriais', () => {
  it('acha pelo título sem acento', () => {
    const funil = getTutorial('montar-funil')!;
    expect(tutorialMatches(funil, 'montar')).toBe(true);
    expect(tutorialMatches(funil, 'FUNIL')).toBe(true);
  });

  it('acha por palavra que só aparece no corpo de um passo', () => {
    // "semáforo" aparece apenas no body de um passo de montar-funil.
    const funil = getTutorial('montar-funil')!;
    expect(tutorialMatches(funil, 'semaforo')).toBe(true);
    expect(tutorialMatches(funil, 'semáforo')).toBe(true);
  });

  it('acha por palavra que só aparece numa ressalva (note)', () => {
    // "System User" está só na note do primeiro passo de conectar-whatsapp.
    const whatsapp = getTutorial('conectar-whatsapp')!;
    expect(tutorialMatches(whatsapp, 'system user')).toBe(true);
  });

  it('busca vazia casa com todos', () => {
    for (const tutorial of TUTORIALS) {
      expect(tutorialMatches(tutorial, '')).toBe(true);
      expect(tutorialMatches(tutorial, '  ')).toBe(true);
    }
  });

  it('exige todos os termos', () => {
    const campanha = getTutorial('primeira-campanha')!;
    expect(tutorialMatches(campanha, 'template janela')).toBe(true);
    expect(tutorialMatches(campanha, 'template jamaisexistente')).toBe(false);
  });

  it('todo tutorial é encontrável pelo próprio título', () => {
    const unreachable = TUTORIALS.filter((t) => !tutorialMatches(t, t.title)).map((t) => t.id);
    expect(unreachable).toEqual([]);
  });
});

describe('cobertura dos cinco tutoriais de onboarding', () => {
  it('estão na ordem de leitura recomendada', () => {
    expect(TUTORIALS.map((t) => t.id)).toEqual([
      'conectar-whatsapp',
      'configurar-equipe',
      'montar-funil',
      'primeiro-chatbot',
      'primeira-campanha',
    ]);
  });

  it('o tutorial de equipe é restrito a gerente', () => {
    expect(getTutorial('configurar-equipe')?.minRole).toBe('gerente');
  });

  it('a campanha fala de template e da janela de 24 horas', () => {
    const campanha = getTutorial('primeira-campanha')!;
    expect(tutorialMatches(campanha, 'template')).toBe(true);
    expect(tutorialMatches(campanha, '24 horas')).toBe(true);
  });
});
