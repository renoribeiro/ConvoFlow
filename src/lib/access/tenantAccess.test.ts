/**
 * A regra de herança de acesso, nas formas de linha que existem em produção.
 *
 * Este arquivo é o espelho em teste da função SQL
 * `public.tenant_access_state(uuid)` (migração 20260818000001). Se um destes
 * casos mudar, a função SQL tem que mudar junto.
 */

import { describe, it, expect } from 'vitest';
import {
  billingRowFor,
  resolveTenantAccess,
  normalizeAccessDecision,
  type AccessRow,
} from './tenantAccess';

// ---------------------------------------------------------------------------
// As seis linhas de produção em 2026-08-18. Nenhuma tem assinatura ativa: todo
// o acesso de hoje é liberação manual.
// ---------------------------------------------------------------------------
const CONTA_MARIO: AccessRow = {
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

const CONTA_TESTE: AccessRow = {
  kind: 'account',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

const ENCAIXARH: AccessRow = {
  kind: 'store',
  parent_tenant_id: 'af2c0ef5-conta-mario',
  subscription_status: null,
  manual_access_granted: true, // flag na própria Loja — vira dado morto
};

const LOJA_TESTE: AccessRow = {
  kind: 'store',
  parent_tenant_id: 'baf2559e-conta-teste',
  subscription_status: null,
  manual_access_granted: false, // o defeito: nasce assim pelo create-store
};

/** Órfã COM liberação na própria linha. É esta que um JOIN comum trancaria. */
const LOJA_YURI_ORFA: AccessRow = {
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

/** Órfã SEM liberação. Continua trancada — pré-existente, não é regressão. */
const LOJA_BRUNO_ORFA: AccessRow = {
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: false,
};

describe('Loja órfã responde por si mesma', () => {
  it('órfã com liberação manual continua liberada', () => {
    expect(resolveTenantAccess(LOJA_YURI_ORFA, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('a órfã não some quando não existe Conta pai para consultar', () => {
    // O erro que este teste trava: tratar a subida como join obrigatório.
    expect(billingRowFor(LOJA_YURI_ORFA, null)).toBe(LOJA_YURI_ORFA);
  });

  it('órfã sem liberação segue trancada', () => {
    expect(resolveTenantAccess(LOJA_BRUNO_ORFA, null)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('passar um pai por engano não muda a órfã: ela não tem pai', () => {
    const contaPaga: AccessRow = { kind: 'account', subscription_status: 'active' };
    expect(resolveTenantAccess(LOJA_BRUNO_ORFA, contaPaga)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });
});

describe('Loja com pai herda da Conta', () => {
  it('Conta paga libera a Loja, mesmo com a Loja sem nada na própria linha', () => {
    const contaPaga: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: 'active',
      manual_access_granted: false,
    };
    expect(resolveTenantAccess(LOJA_TESTE, contaPaga)).toEqual({
      unlocked: true,
      source: 'paid',
    });
  });

  it('Conta liberada manualmente libera a Loja — é o defeito do Blocker 1', () => {
    expect(resolveTenantAccess(LOJA_TESTE, CONTA_TESTE)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('Conta trancada tranca a Loja', () => {
    const contaTrancada: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: null,
      manual_access_granted: false,
    };
    expect(resolveTenantAccess(LOJA_TESTE, contaTrancada)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('a flag na Loja NÃO destrava quando a Conta está trancada: não há acesso por Loja', () => {
    const contaTrancada: AccessRow = {
      kind: 'account',
      parent_tenant_id: null,
      subscription_status: null,
      manual_access_granted: false,
    };
    // EncaixaRH tem manual=true na própria linha; com pai, quem manda é o pai.
    expect(resolveTenantAccess(ENCAIXARH, contaTrancada)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('EncaixaRH continua liberada pela Conta Mario Acioli', () => {
    expect(resolveTenantAccess(ENCAIXARH, CONTA_MARIO)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('pai não carregado cai na própria linha em vez de trancar', () => {
    expect(resolveTenantAccess(ENCAIXARH, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });
});

describe('Conta avalia a si mesma', () => {
  it('Conta liberada manualmente', () => {
    expect(resolveTenantAccess(CONTA_MARIO, null)).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('Conta paga', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: 'active' };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: true, source: 'paid' });
  });

  it('Conta sem nada fica trancada', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: null };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });

  it('Conta nunca sobe: mesmo com um pai à mão, ela responde por si', () => {
    const contaPaga: AccessRow = { kind: 'account', subscription_status: 'active' };
    const contaTrancada: AccessRow = { kind: 'account', subscription_status: null };
    expect(resolveTenantAccess(contaTrancada, contaPaga)).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });
});

describe('pago ganha de liberação manual', () => {
  it('assinatura ativa devolve paid mesmo com manual também ligado', () => {
    const conta: AccessRow = {
      kind: 'account',
      subscription_status: 'active',
      manual_access_granted: true,
    };
    expect(resolveTenantAccess(conta, null).source).toBe('paid');
  });

  it('assinatura cancelada não libera nada', () => {
    const conta: AccessRow = { kind: 'account', subscription_status: 'canceled' };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });
});

describe('bordas', () => {
  it('sem linha nenhuma, trancado', () => {
    expect(resolveTenantAccess(null, null)).toEqual({ unlocked: false, source: 'locked' });
    expect(billingRowFor(null, CONTA_MARIO)).toBeNull();
  });

  it('manual_access_granted nulo não é verdadeiro', () => {
    const conta: AccessRow = { kind: 'account', manual_access_granted: null };
    expect(resolveTenantAccess(conta, null)).toEqual({ unlocked: false, source: 'locked' });
  });
});

describe('normalizeAccessDecision', () => {
  it('aceita o que a RPC devolve', () => {
    expect(normalizeAccessDecision({ unlocked: true, source: 'paid' })).toEqual({
      unlocked: true,
      source: 'paid',
    });
    expect(normalizeAccessDecision({ unlocked: true, source: 'manual' })).toEqual({
      unlocked: true,
      source: 'manual',
    });
    expect(normalizeAccessDecision({ unlocked: false, source: 'locked' })).toEqual({
      unlocked: false,
      source: 'locked',
    });
  });

  it('texto inesperado no source não vira acesso indevido', () => {
    expect(normalizeAccessDecision({ unlocked: false, source: 'paid' })).toEqual({
      unlocked: false,
      source: 'locked',
    });
    expect(normalizeAccessDecision({ unlocked: true, source: 'qualquer-coisa' })).toEqual({
      unlocked: true,
      source: 'manual',
    });
  });

  it('unlocked que não é booleano true não libera', () => {
    expect(normalizeAccessDecision({ unlocked: 'true', source: 'paid' }).unlocked).toBe(false);
    expect(normalizeAccessDecision({}).unlocked).toBe(false);
  });
});
