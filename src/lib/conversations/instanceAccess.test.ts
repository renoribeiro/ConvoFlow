/**
 * Quem pode USAR uma instância de WhatsApp pelo inbox (edge functions
 * `whatsapp-send-message` e `list-whatsapp-templates`).
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `store-slots.ts`.
 *
 * O caso que estes testes existem para impedir (2026-09-14): o banco deixa o
 * gerente GRAVAR na Loja filha (migração 20260909000004), mas a edge function
 * devolvia 403 — a mensagem ficava `failed` e o cliente não recebia nada.
 * A regra aqui tem que ser igual à de `public.gerente_child_store_ids()`.
 */
import { describe, it, expect } from 'vitest';

import {
  decideInstanceAccess,
  type InstanceAccessTenant,
} from '../../../supabase/functions/_shared/instance-access.ts';

const ACCOUNT = 'c1a9d2f0-0000-0000-0000-000000000001';
const STORE = '2165be9f-0000-0000-0000-000000000002';
const OTHER_ACCOUNT = 'af2c0ef5-0000-0000-0000-000000000003';

const storeTenant: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: ACCOUNT };
const storeInstance = { tenant_id: STORE };

describe('decideInstanceAccess', () => {
  it('nega quem não tem Conta no perfil', () => {
    expect(decideInstanceAccess({ tenant_id: null, role: 'gerente' }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'no_tenant' });
  });

  it('superadmin passa em qualquer instância, mesmo sem a linha de tenants', () => {
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'superadmin' }, storeInstance, null))
      .toEqual({ allowed: true, reason: 'superadmin' });
    // grafia legada
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'super_admin' }, storeInstance, null).allowed)
      .toBe(true);
  });

  it('qualquer cargo passa na própria Conta/Loja', () => {
    for (const role of ['gerente', 'gestor', 'atendente']) {
      expect(decideInstanceAccess({ tenant_id: STORE, role }, storeInstance, storeTenant))
        .toEqual({ allowed: true, reason: 'own_tenant' });
    }
  });

  it('gerente ativo da Conta-mãe usa a instância da Loja filha (caso da Camila)', () => {
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', status: 'active' }, storeInstance, storeTenant))
      .toEqual({ allowed: true, reason: 'gerente_child_store' });
  });

  it('gerente de OUTRA Conta não passa', () => {
    expect(decideInstanceAccess({ tenant_id: OTHER_ACCOUNT, role: 'gerente', status: 'active' }, storeInstance, storeTenant))
      .toEqual({ allowed: false, reason: 'foreign_tenant' });
  });

  it('gestor e atendente da Conta-mãe não passam — só o gerente escreve na filha', () => {
    for (const role of ['gestor', 'atendente']) {
      expect(decideInstanceAccess({ tenant_id: ACCOUNT, role, status: 'active' }, storeInstance, storeTenant).allowed)
        .toBe(false);
    }
  });

  it('gerente suspenso/inativo não passa (is_gerente_safe exige status=active)', () => {
    for (const status of ['suspended', 'inactive', 'pending']) {
      expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente', status }, storeInstance, storeTenant).allowed)
        .toBe(false);
    }
  });

  it('só Loja filha DIRETA: neta, Conta irmã ou tenant sem kind=store ficam de fora', () => {
    const grandchild: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: OTHER_ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente' }, storeInstance, grandchild).allowed).toBe(false);

    const accountKind: InstanceAccessTenant = { id: STORE, kind: 'account', parent_tenant_id: ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente' }, storeInstance, accountKind).allowed).toBe(false);

    const orphan: InstanceAccessTenant = { id: STORE, kind: 'store', parent_tenant_id: null };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente' }, storeInstance, orphan).allowed).toBe(false);
  });

  it('a linha de tenants precisa ser a da instância (não confia num id trocado)', () => {
    const wrongRow: InstanceAccessTenant = { id: 'outra', kind: 'store', parent_tenant_id: ACCOUNT };
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente' }, storeInstance, wrongRow).allowed).toBe(false);
  });

  it('sem a linha de tenants, gerente de Conta cai em foreign_tenant', () => {
    expect(decideInstanceAccess({ tenant_id: ACCOUNT, role: 'gerente' }, storeInstance, null))
      .toEqual({ allowed: false, reason: 'foreign_tenant' });
  });
});
