/**
 * Testes de `useEvolutionApi.createInstance`.
 *
 * O bug que originou este arquivo: sem credenciais da Evolution o hook fazia
 * `throw` ANTES do try/catch que emite o toast. Quem chamava (o
 * CreateInstanceModal) confiava no comentário "toast já é exibido pelo hook
 * subjacente" e só logava — resultado: clicar em "Criar e abrir QR Code" não
 * produzia nada na tela, nem QR, nem erro.
 *
 * Os testes cobrem as três garantias que faltavam:
 *   1. sem credencial, falha COM aviso ao usuário;
 *   2. credencial do formulário é usada e vai parar no connection_config;
 *   3. erro do INSERT não é engolido.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom, mockGetUser, mockToast, mockCreateService, mockCreateInstanceWithWebhook } =
  vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockGetUser: vi.fn(),
    mockToast: vi.fn(),
    mockCreateService: vi.fn(),
    mockCreateInstanceWithWebhook: vi.fn(),
  }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom, auth: { getUser: mockGetUser } },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

vi.mock('@/services/evolutionApi', () => ({
  createEvolutionApiService: mockCreateService,
  EvolutionApiService: class {},
}));

vi.mock('@/lib/env', () => ({
  env: { get: () => undefined, isDevelopment: () => false },
}));

import { useEvolutionApi } from './useEvolutionApi';

/** Guarda o payload do último .insert() para inspeção. */
let insertedRows: any[] = [];
let insertError: { message: string } | null = null;

function stubSupabase() {
  insertedRows = [];
  insertError = null;

  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      const chain: any = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(() => Promise.resolve({ data: { tenant_id: 'tenant-1' }, error: null }));
      return chain;
    }
    if (table === 'tenants') {
      const chain: any = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      // Nenhuma Conta em produção tem settings.evolutionApi — é justamente por
      // isso que o serviço global nascia nulo.
      chain.single = vi.fn(() => Promise.resolve({ data: { settings: {} }, error: null }));
      return chain;
    }
    if (table === 'whatsapp_instances') {
      const chain: any = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
      chain.insert = vi.fn((row: any) => {
        insertedRows.push(row);
        return Promise.resolve({ error: insertError });
      });
      return chain;
    }
    const noop: any = {};
    noop.select = vi.fn(() => noop);
    noop.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    return noop;
  });
}

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

async function mountHook() {
  const view = renderHook(() => useEvolutionApi(), { wrapper: makeWrapper() });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubSupabase();
  mockCreateInstanceWithWebhook.mockResolvedValue({
    status: 'connecting',
    webhookConfigured: true,
    webhookUrl: 'https://projeto.supabase.co/functions/v1/evolution-webhook',
  });
  mockCreateService.mockImplementation((baseUrl: string, apiKey: string) => ({
    baseUrl,
    apiKey,
    createInstanceWithWebhook: mockCreateInstanceWithWebhook,
    createInstance: vi.fn(),
  }));
});

describe('useEvolutionApi.createInstance', () => {
  it('sem credenciais, avisa o usuário em vez de falhar calado', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await expect(result.current.createInstance('vendas_001')).rejects.toThrow(
        /URL do servidor e a API Key/i,
      );
    });

    // A garantia que faltava: o usuário VÊ o erro.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
    expect(insertedRows).toHaveLength(0);
  });

  it('usa as credenciais do formulário e as grava no connection_config', async () => {
    const { result } = await mountHook();

    await act(async () => {
      await result.current.createInstance(
        'vendas_001',
        'https://projeto.supabase.co/functions/v1/evolution-webhook',
        {
          serverUrl: 'https://evo.exemplo.com.br',
          apiKey: 'CHAVE1234567890',
          displayName: 'WhatsApp Vendas',
        },
      );
    });

    expect(mockCreateService).toHaveBeenCalledWith(
      'https://evo.exemplo.com.br',
      'CHAVE1234567890',
    );
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      instance_key: 'vendas_001',
      // O nome legível não pode ser substituído pela chave técnica.
      name: 'WhatsApp Vendas',
      provider: 'evolution',
      connection_config: {
        baseUrl: 'https://evo.exemplo.com.br',
        apiKey: 'CHAVE1234567890',
      },
    });
  });

  it('não engole erro do INSERT: a instância existiria só no servidor', async () => {
    insertError = { message: 'new row violates row-level security policy' };
    const { result } = await mountHook();

    await act(async () => {
      await expect(
        result.current.createInstance('vendas_001', undefined, {
          serverUrl: 'https://evo.exemplo.com.br',
          apiKey: 'CHAVE1234567890',
        }),
      ).rejects.toThrow(/não pôde ser salva aqui/i);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });
});
