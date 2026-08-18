/**
 * useTenantAccess — a ligação entre a tela e a RPC de herança de acesso.
 *
 * A regra em si (quem herda de quem) é testada em
 * `src/lib/access/tenantAccess.test.ts`. Aqui o que importa é o contrato que o
 * DashboardLayout consome:
 *   - `locked` NUNCA verdadeiro enquanto a consulta está no ar (senão pisca o
 *     paywall na cara de quem tem acesso);
 *   - superadmin e gerente passam sem consultar nada;
 *   - RPC fora do ar degrada para o comportamento antigo, não tranca todo mundo.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

let role: string | null = 'gestor';
let tenant: Record<string, unknown> | null = null;
let tenantLoading = false;

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => role,
  useTenant: () => ({ tenant, loading: tenantLoading }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useTenantAccess } from './useTenantAccess';

const LOJA_COM_PAI = {
  id: 'loja-teste',
  kind: 'store',
  parent_tenant_id: 'conta-teste',
  subscription_status: null,
  manual_access_granted: false,
};

const LOJA_ORFA_LIBERADA = {
  id: 'loja-yuri',
  kind: 'store',
  parent_tenant_id: null,
  subscription_status: null,
  manual_access_granted: true,
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryProvider';
  return Wrapper;
}

/** Uma RPC que nunca resolve — serve para inspecionar o estado "em voo". */
const rpcPendente = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  role = 'gestor';
  tenant = LOJA_COM_PAI;
  tenantLoading = false;
});

describe('nada de piscar o paywall', () => {
  it('enquanto a RPC não responde, fica em loading e NUNCA locked', async () => {
    mockRpc.mockImplementation(rpcPendente);

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(result.current.unlocked).toBe(false);
  });

  it('enquanto o tenant ainda carrega, fica em loading e não consulta', () => {
    tenantLoading = true;
    tenant = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('enquanto o cargo não carregou, fica em loading', () => {
    role = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);
    expect(result.current.locked).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('bypass por cargo', () => {
  it.each(['superadmin', 'gerente'])('%s entra sem consultar a RPC', (cargo) => {
    role = cargo;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'bypass',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('o que a RPC responde é o que vale', () => {
  it('Loja com Conta paga entra, com source paid', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'paid' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'paid',
    });
  });

  it('Loja com Conta liberada manualmente entra — o defeito do Blocker 1', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.unlocked).toBe(true));
    expect(result.current.source).toBe('manual');
    expect(result.current.locked).toBe(false);
  });

  it('Loja com Conta trancada vê o paywall', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: false, source: 'locked' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({
      loading: false,
      unlocked: false,
      locked: true,
      source: 'locked',
    });
  });

  it('pergunta pela Loja em foco', async () => {
    mockRpc.mockResolvedValue({ data: [{ unlocked: true, source: 'manual' }], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRpc).toHaveBeenCalledWith('tenant_access_state', {
      p_tenant_id: 'loja-teste',
    });
  });

  it('aceita a função devolvendo objeto solto em vez de lista', async () => {
    mockRpc.mockResolvedValue({ data: { unlocked: true, source: 'manual' }, error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.unlocked).toBe(true));
  });
});

describe('degradação quando a RPC não responde', () => {
  it('função ainda não aplicada não tranca a Loja órfã que hoje trabalha', async () => {
    tenant = LOJA_ORFA_LIBERADA;
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.tenant_access_state' },
    });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current).toEqual({
      loading: false,
      unlocked: true,
      locked: false,
      source: 'manual',
    });
  });

  it('degradar devolve o comportamento antigo, nunca pior que ele', async () => {
    // A Loja com pai não tem nada na própria linha: antes desta mudança ela já
    // via o paywall. A degradação não conserta, mas também não piora.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.locked).toBe(true);
  });

  it('resposta vazia da função também degrada em vez de estourar', async () => {
    tenant = LOJA_ORFA_LIBERADA;
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 3000 });
    expect(result.current.unlocked).toBe(true);
  });
});

describe('sem tenant', () => {
  it('perfil sem Conta fica trancado e não consulta', () => {
    tenant = null;

    const { result } = renderHook(() => useTenantAccess(), { wrapper: makeWrapper() });

    expect(result.current).toEqual({
      loading: false,
      unlocked: false,
      locked: true,
      source: 'locked',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
