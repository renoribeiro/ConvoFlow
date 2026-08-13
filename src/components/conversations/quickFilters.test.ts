import { describe, expect, it } from 'vitest';
import {
  applyQuickFilter,
  buildQuickFilterCounts,
  matchesQuickFilter,
  resolveQuickFilterScope,
  visibleQuickFilters,
} from './quickFilters';
import { DEFAULT_SLA_THRESHOLDS, type SlaInput } from './slaLevels';

const NOW = new Date('2026-08-13T15:00:00.000Z');

function conv(overrides: Partial<SlaInput> = {}): SlaInput {
  return {
    unread_count: 0,
    last_message_direction: 'outbound',
    last_message_at: NOW.toISOString(),
    ...overrides,
  };
}

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
      todas: 3,
      'nao-lidas': 1,
      aguardando: 1,
      'em-atendimento': 1,
    });
  });

  it('no universo arquivado só publica a contagem de arquivadas', () => {
    expect(buildQuickFilterCounts(lista, { hasUnread: false, isArchived: true }, NOW)).toEqual({
      arquivadas: 3,
    });
  });

  it('no universo já recortado por não lidas só publica essa contagem', () => {
    expect(buildQuickFilterCounts(lista, { hasUnread: true, isArchived: false }, NOW)).toEqual({
      'nao-lidas': 3,
    });
  });

  it('omite as chaves desconhecidas em vez de zerá-las', () => {
    const counts = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW);
    expect(counts.arquivadas).toBeUndefined();
    expect('arquivadas' in counts).toBe(false);
  });

  it('lida com lista vazia', () => {
    expect(buildQuickFilterCounts([], { hasUnread: false, isArchived: false }, NOW)).toEqual({
      todas: 0,
      'nao-lidas': 0,
      aguardando: 0,
      'em-atendimento': 0,
    });
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
    expect(comSla['nao-respondidas']).toBe(1);

    const semSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, SLA_DESLIGADO);
    expect('nao-respondidas' in semSla).toBe(false);
  });

  it('não altera a contagem das outras pílulas', () => {
    const comSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW, SLA_LIGADO);
    const semSla = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: false }, NOW);
    expect(comSla.todas).toBe(semSla.todas);
    expect(comSla.aguardando).toBe(semSla.aguardando);
    expect(comSla['nao-lidas']).toBe(semSla['nao-lidas']);
    expect(comSla['em-atendimento']).toBe(semSla['em-atendimento']);
  });
});
