/**
 * Pílulas de responsável — "Minhas" e "Sem responsável".
 *
 * Arquivo separado de `quickFilters.test.ts` de propósito: aquele protege o
 * comportamento que já existia e não foi tocado. Este cobre só o que a
 * migração 20260913000001 acrescentou: o recorte por `assigned_profile_id`,
 * feito no cliente sobre o que já foi carregado (piso, não total), sem mexer
 * nas pílulas de servidor.
 */

import { describe, expect, it } from 'vitest';
import {
  QUICK_FILTERS,
  SERVER_COUNTED_FILTERS,
  applyQuickFilter,
  buildQuickFilterCounts,
  isServerCountedFilter,
  matchesQuickFilter,
  mergeServerTotals,
  resolveQuickFilterScope,
  visibleQuickFilters,
  type QuickFilterInput,
} from './quickFilters';
import { DEFAULT_SLA_THRESHOLDS } from './slaLevels';

const NOW = new Date('2026-09-13T15:00:00.000Z');
const EU = 'p0000000-0000-4000-8000-00000000000a';
const COLEGA = 'p0000000-0000-4000-8000-00000000000b';

function conv(overrides: Partial<QuickFilterInput> = {}): QuickFilterInput {
  return {
    unread_count: 0,
    last_message_direction: 'outbound',
    last_message_at: NOW.toISOString(),
    assigned_profile_id: null,
    ...overrides,
  };
}

const minha = conv({ assigned_profile_id: EU });
const doColega = conv({ assigned_profile_id: COLEGA });
const semDono = conv({ assigned_profile_id: null });
/** Linha vinda de um banco onde a migração ainda não rodou: sem a chave. */
const semColuna = conv();
delete (semColuna as { assigned_profile_id?: string | null }).assigned_profile_id;

const COMO_EU = { viewerProfileId: EU };
const SEM_PERFIL = { viewerProfileId: null };
const SLA_LIGADO = { enabled: true, thresholds: DEFAULT_SLA_THRESHOLDS };
const escopoLimpo = { hasUnread: false, isArchived: false };

describe('as pílulas novas existem e ficam entre "Todas" e "Não lidas"', () => {
  it('QUICK_FILTERS traz "Minhas" e "Sem responsável" logo depois de "Todas"', () => {
    const ids = QUICK_FILTERS.map((f) => f.id);
    expect(ids.slice(0, 4)).toEqual(['todas', 'minhas', 'sem-responsavel', 'nao-lidas']);
  });

  it('aparecem com o SLA ligado ou desligado — não dependem dele', () => {
    for (const slaEnabled of [true, false]) {
      const ids = visibleQuickFilters(slaEnabled).map((f) => f.id);
      expect(ids).toContain('minhas');
      expect(ids).toContain('sem-responsavel');
    }
  });

  it('NÃO viraram pílulas de servidor: as contagens exatas continuam sendo só as três antigas', () => {
    expect([...SERVER_COUNTED_FILTERS]).toEqual(['todas', 'nao-lidas', 'arquivadas']);
    expect(isServerCountedFilter('minhas')).toBe(false);
    expect(isServerCountedFilter('sem-responsavel')).toBe(false);
  });

  it('não mexem no recorte de servidor (hasUnread / isArchived)', () => {
    expect(resolveQuickFilterScope('minhas', escopoLimpo)).toEqual(escopoLimpo);
    expect(resolveQuickFilterScope('sem-responsavel', escopoLimpo)).toEqual(escopoLimpo);
  });
});

describe('matchesQuickFilter — Minhas', () => {
  it('casa só a conversa que está comigo', () => {
    expect(matchesQuickFilter(minha, 'minhas', NOW, undefined, COMO_EU)).toBe(true);
    expect(matchesQuickFilter(doColega, 'minhas', NOW, undefined, COMO_EU)).toBe(false);
    expect(matchesQuickFilter(semDono, 'minhas', NOW, undefined, COMO_EU)).toBe(false);
  });

  it('sem perfil carregado nada é meu — não inventa', () => {
    expect(matchesQuickFilter(minha, 'minhas', NOW, undefined, SEM_PERFIL)).toBe(false);
    expect(matchesQuickFilter(minha, 'minhas', NOW, undefined, undefined)).toBe(false);
  });
});

describe('matchesQuickFilter — Sem responsável', () => {
  it('casa null e ausência da coluna; não casa quem tem dono', () => {
    expect(matchesQuickFilter(semDono, 'sem-responsavel', NOW, undefined, COMO_EU)).toBe(true);
    expect(matchesQuickFilter(semColuna, 'sem-responsavel', NOW, undefined, COMO_EU)).toBe(true);
    expect(matchesQuickFilter(minha, 'sem-responsavel', NOW, undefined, COMO_EU)).toBe(false);
    expect(matchesQuickFilter(doColega, 'sem-responsavel', NOW, undefined, COMO_EU)).toBe(false);
  });

  it('não depende de quem está olhando', () => {
    expect(matchesQuickFilter(semDono, 'sem-responsavel', NOW, undefined, SEM_PERFIL)).toBe(true);
  });
});

describe('applyQuickFilter', () => {
  const lista = [minha, doColega, semDono, semColuna];

  it('"Minhas" recorta e preserva a ordem', () => {
    expect(applyQuickFilter(lista, 'minhas', NOW, undefined, COMO_EU)).toEqual([minha]);
  });

  it('"Sem responsável" recorta e preserva a ordem', () => {
    expect(applyQuickFilter(lista, 'sem-responsavel', NOW, undefined, COMO_EU)).toEqual([
      semDono,
      semColuna,
    ]);
  });

  it('as pílulas antigas ignoram o responsável — nada mudou para elas', () => {
    expect(applyQuickFilter(lista, 'todas', NOW, undefined, COMO_EU)).toBe(lista);
    expect(applyQuickFilter(lista, 'nao-lidas', NOW, undefined, COMO_EU)).toBe(lista);
    expect(applyQuickFilter(lista, 'arquivadas', NOW, undefined, COMO_EU)).toBe(lista);
  });
});

describe('buildQuickFilterCounts', () => {
  const lista = [minha, minha, doColega, semDono, semColuna];

  it('conta Minhas e Sem responsável como piso enquanto há página por carregar', () => {
    const counts = buildQuickFilterCounts(lista, escopoLimpo, NOW, SLA_LIGADO, false, COMO_EU);
    expect(counts.minhas).toEqual({ value: 2, exact: false });
    expect(counts['sem-responsavel']).toEqual({ value: 2, exact: false });
    // A do colega não é minha nem está sem dono: fica fora das duas.
    expect(counts.todas).toEqual({ value: 5, exact: false });
  });

  it('vira exato quando a última página chegou', () => {
    const counts = buildQuickFilterCounts(lista, escopoLimpo, NOW, SLA_LIGADO, true, COMO_EU);
    expect(counts.minhas).toEqual({ value: 2, exact: true });
    expect(counts['sem-responsavel']).toEqual({ value: 2, exact: true });
  });

  it('sem perfil, "Minhas" é zero — e "Sem responsável" continua contando', () => {
    const counts = buildQuickFilterCounts(lista, escopoLimpo, NOW, SLA_LIGADO, false, SEM_PERFIL);
    expect(counts.minhas).toEqual({ value: 0, exact: false });
    expect(counts['sem-responsavel']).toEqual({ value: 2, exact: false });
  });

  it('num recorte de servidor (não lidas / arquivadas) não publica as chaves novas', () => {
    const naoLidas = buildQuickFilterCounts(lista, { hasUnread: true, isArchived: false }, NOW, SLA_LIGADO, false, COMO_EU);
    expect(naoLidas).toEqual({ 'nao-lidas': { value: 5, exact: false } });
    const arquivadas = buildQuickFilterCounts(lista, { hasUnread: false, isArchived: true }, NOW, SLA_LIGADO, false, COMO_EU);
    expect(arquivadas).toEqual({ arquivadas: { value: 5, exact: false } });
  });

  it('mergeServerTotals não sobrescreve as pílulas novas — elas não têm total de servidor', () => {
    const loaded = buildQuickFilterCounts(lista, escopoLimpo, NOW, SLA_LIGADO, false, COMO_EU);
    const merged = mergeServerTotals(loaded, { todas: 40, 'nao-lidas': 3, arquivadas: 7 });
    expect(merged.todas).toEqual({ value: 40, exact: true });
    expect(merged.minhas).toEqual({ value: 2, exact: false });
    expect(merged['sem-responsavel']).toEqual({ value: 2, exact: false });
  });
});
