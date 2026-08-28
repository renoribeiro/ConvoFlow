import { describe, expect, it } from 'vitest';
import {
  applyQuickFilter,
  buildQuickFilterCounts,
  isServerCountedFilter,
  matchesQuickFilter,
  mergeServerTotals,
  resolveQuickFilterScope,
  visibleQuickFilters,
} from './quickFilters';
import { DEFAULT_SLA_THRESHOLDS, type SlaInput } from './slaLevels';

const NOW = new Date('2026-08-13T15:00:00.000Z');

/** As pílulas que o servidor sabe contar — coluna real em `conversations`. */
const SERVER_COUNTED_FILTERS_ESPERADAS = ['todas', 'nao-lidas', 'arquivadas'] as const;

function conv(overrides: Partial<SlaInput> = {}): SlaInput {
  return {
    unread_count: 0,
    last_message_direction: 'outbound',
    last_message_at: NOW.toISOString(),
    ...overrides,
  };
}

/** Atalho: o selo como a pílula vai desenhar, "12" exato ou "12+" piso. */
const piso = (value: number) => ({ value, exact: false });
const exato = (value: number) => ({ value, exact: true });

const SLA_LIGADO = { enabled: true, thresholds: DEFAULT_SLA_THRESHOLDS };
const SLA_DESLIGADO = { enabled: false, thresholds: DEFAULT_SLA_THRESHOLDS };

/** Cliente esperando há 6h — atrasada nos limites padrão. */
const naoRespondida = conv({
  unread_count: 1,
  last_message_direction: 'inbound',
  last_message_at: '2026-08-13T09:00:00.000Z',
});

/** Uma de cada: não lida (waiting), respondida agora (in_progress) e antiga (idle). */
const naoLida = conv({ unread_count: 2, last_message_direction: 'inbound' });
const emAtendimento = conv();
const semPendencia = conv({ last_message_at: '2026-08-01T09:00:00.000Z' });

describe('resolveQuickFilterScope', () => {
  const modalLimpo = { hasUnread: false, isArchived: false };

  it('não mexe no recorte quando a pílula é "Todas"', () => {
    expect(resolveQuickFilterScope('todas', modalLimpo)).toEqual(modalLimpo);
  });

  it('liga hasUnread na pílula "Não lidas"', () => {
    expect(resolveQuickFilterScope('nao-lidas', modalLimpo)).toEqual({
      hasUnread: true,
      isArchived: false,
    });
  });

  it('a pílula "Arquivadas" vence o modal que pedia não arquivadas', () => {
    expect(resolveQuickFilterScope('arquivadas', modalLimpo)).toEqual({
      hasUnread: false,
      isArchived: true,
    });
  });

  it('preserva o que o modal pediu quando a pílula não cobre aquele campo', () => {
    expect(
      resolveQuickFilterScope('aguardando', { hasUnread: true, isArchived: true }),
    ).toEqual({ hasUnread: true, isArchived: true });
  });

  it('"Todas" não desfaz os filtros do modal', () => {
    expect(resolveQuickFilterScope('todas', { hasUnread: true, isArchived: true })).toEqual({
      hasUnread: true,
      isArchived: true,
    });
  });
});

describe('matchesQuickFilter', () => {
  it('deixa tudo passar nas pílulas resolvidas no servidor', () => {
    for (const pill of ['todas', 'nao-lidas', 'arquivadas'] as const) {
      expect(matchesQuickFilter(semPendencia, pill, NOW)).toBe(true);
    }
  });

  it('"Aguardando" só aceita conversas no nível waiting', () => {
    expect(matchesQuickFilter(naoLida, 'aguardando', NOW)).toBe(true);
    expect(matchesQuickFilter(emAtendimento, 'aguardando', NOW)).toBe(false);
  });

  it('"Em atendimento" só aceita conversas no nível in_progress', () => {
    expect(matchesQuickFilter(emAtendimento, 'em-atendimento', NOW)).toBe(true);
    expect(matchesQuickFilter(semPendencia, 'em-atendimento', NOW)).toBe(false);
  });
});

describe('applyQuickFilter', () => {
  const lista = [naoLida, emAtendimento, semPendencia];

  it('devolve a mesma referência quando não há recorte derivado', () => {
    expect(applyQuickFilter(lista, 'todas', NOW)).toBe(lista);
    expect(applyQuickFilter(lista, 'nao-lidas', NOW)).toBe(lista);
  });

  it('recorta preservando a ordem original', () => {
    expect(applyQuickFilter(lista, 'aguardando', NOW)).toEqual([naoLida]);
    expect(applyQuickFilter(lista, 'em-atendimento', NOW)).toEqual([emAtendimento]);
  });
});

describe('buildQuickFilterCounts', () => {
  const lista = [naoLida, emAtendimento, semPendencia];

  it('conta as quatro pílulas do universo ativo', () => {
    expect(buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW)).toEqual({
      todas: piso(3),
      'nao-lidas': piso(1),
      aguardando: piso(1),
      'em-atendimento': piso(1),
    });
  });

  it('no universo arquivado só publica a contagem de arquivadas', () => {
    expect(buildQuickFilterCounts(lista, { hasUnread: false, isArchived: true }, NOW)).toEqual({
      arquivadas: piso(3),
    });
  });

  it('no universo já recortado por não lidas só publica essa contagem', () => {
    expect(buildQuickFilterCounts(lista, { hasUnread: true, isArchived: false }, NOW)).toEqual({
      'nao-lidas': piso(3),
    });
  });

  it('omite as chaves desconhecidas em vez de zerá-las', () => {
    const counts = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW);
    expect(counts.arquivadas).toBeUndefined();
    expect('arquivadas' in counts).toBe(false);
  });

  it('lida com lista vazia', () => {
    expect(buildQuickFilterCounts([], { hasUnread: false, isArchived: false }, NOW)).toEqual({
      todas: piso(0),
      'nao-lidas': piso(0),
      aguardando: piso(0),
      'em-atendimento': piso(0),
    });
  });

  it('marca as contagens como piso enquanto houver página por carregar', () => {
    const counts = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, undefined, false);
    expect(counts.aguardando).toEqual(piso(1));
    expect(counts.todas).toEqual(piso(3));
  });

  it('com a última página carregada o conjunto É a fila, então vira exato', () => {
    const counts = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, undefined, true);
    expect(counts.aguardando).toEqual(exato(1));
    expect(counts.todas).toEqual(exato(3));
  });
});

describe('mergeServerTotals', () => {
  const carregado = buildQuickFilterCounts(
    [naoLida, emAtendimento, semPendencia],
    { hasUnread: false, isArchived: false },
    NOW,
  );

  it('só as pílulas de coluna real recebem total do servidor', () => {
    expect(SERVER_COUNTED_FILTERS_ESPERADAS.every(isServerCountedFilter)).toBe(true);
    expect(isServerCountedFilter('aguardando')).toBe(false);
    expect(isServerCountedFilter('em-atendimento')).toBe(false);
    expect(isServerCountedFilter('nao-respondidas')).toBe(false);
  });

  it('o total do servidor vence o piso e sai marcado como exato', () => {
    const merged = mergeServerTotals(carregado, { 'nao-lidas': 42 });
    expect(merged['nao-lidas']).toEqual(exato(42));
  });

  it('não mexe nas pílulas derivadas', () => {
    const merged = mergeServerTotals(carregado, { todas: 99 });
    expect(merged.aguardando).toEqual(piso(1));
    expect(merged['em-atendimento']).toEqual(piso(1));
  });

  it('contagem ainda carregando mantém o piso em vez de zerar', () => {
    const merged = mergeServerTotals(carregado, { 'nao-lidas': undefined });
    expect(merged['nao-lidas']).toEqual(piso(1));
  });

  it('total zero é um total, não uma contagem ausente', () => {
    const merged = mergeServerTotals(carregado, { 'nao-lidas': 0 });
    expect(merged['nao-lidas']).toEqual(exato(0));
  });
});

describe('pílula "Não respondidas" (SLA)', () => {
  const lista = [naoLida, emAtendimento, semPendencia, naoRespondida];

  it('some da lista de pílulas quando a Loja não ligou a sinalização', () => {
    expect(visibleQuickFilters(false).map((f) => f.id)).not.toContain('nao-respondidas');
    expect(visibleQuickFilters(true).map((f) => f.id)).toContain('nao-respondidas');
  });

  it('não vira filtro de servidor', () => {
    expect(resolveQuickFilterScope('nao-respondidas', { hasUnread: false, isArchived: false })).toEqual({
      hasUnread: false,
      isArchived: false,
    });
  });

  it('aceita só as conversas fora do nível ok', () => {
    expect(matchesQuickFilter(naoRespondida, 'nao-respondidas', NOW, SLA_LIGADO)).toBe(true);
    expect(matchesQuickFilter(emAtendimento, 'nao-respondidas', NOW, SLA_LIGADO)).toBe(false);
  });

  it('ignora conversas silenciadas', () => {
    const silenciada = { ...naoRespondida, sla_muted_at: '2026-08-13T10:00:00.000Z' };
    expect(matchesQuickFilter(silenciada, 'nao-respondidas', NOW, SLA_LIGADO)).toBe(false);
  });

  it('não recorta nada quando o SLA está desligado', () => {
    expect(applyQuickFilter(lista, 'nao-respondidas', NOW, SLA_DESLIGADO)).toBe(lista);
    expect(applyQuickFilter(lista, 'nao-respondidas', NOW)).toBe(lista);
  });

  it('recorta preservando a ordem quando o SLA está ligado', () => {
    expect(applyQuickFilter(lista, 'nao-respondidas', NOW, SLA_LIGADO)).toEqual([naoRespondida]);
  });

  it('publica a contagem apenas com o SLA ligado', () => {
    const comSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, SLA_LIGADO);
    expect(comSla['nao-respondidas']).toEqual(piso(1));

    const semSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, SLA_DESLIGADO);
    expect('nao-respondidas' in semSla).toBe(false);
  });

  it('não altera a contagem das outras pílulas', () => {
    const comSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, SLA_LIGADO);
    const semSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW);
    expect(comSla.todas).toEqual(semSla.todas);
    expect(comSla.aguardando).toEqual(semSla.aguardando);
    expect(comSla['nao-lidas']).toEqual(semSla['nao-lidas']);
    expect(comSla['em-atendimento']).toEqual(semSla['em-atendimento']);
  });
});
