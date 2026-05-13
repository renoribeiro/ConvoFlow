/**
 * Tests for Dashboard page
 *
 * Covers the four bugs fixed in this session:
 * 1. Aggregated loading/error state from real hooks
 * 2. Activity mapping uses `direction` column (not `sender_type`) and covers
 *    both 'incoming'/'inbound' variants
 * 3. "Total de Conversas" card is driven by conversations count, not messages
 * 4. Contact label falls back to 'contato desconhecido' when contact is null
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'a@test.com' } }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-1', name: 'Acme' },
    loading: false,
  }),
}));

// We control what these hooks return per-test via the factory below.
const mockUseSupabaseCount = vi.fn();
const mockUseSupabaseQuery = vi.fn();

vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseCount: (...args: unknown[]) => mockUseSupabaseCount(...args),
  useSupabaseQuery: (...args: unknown[]) => mockUseSupabaseQuery(...args),
}));

// Silence router / radix warnings that pollute test output
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

/** Default "all-ok" return value for useSupabaseCount */
const countOk = (data = 0) => ({ data, isLoading: false, isError: false });

/** Default "all-ok" return value for useSupabaseQuery */
const queryOk = (data: unknown[] = []) => ({ data, isLoading: false, isError: false });

/** Render Dashboard inside the required router context */
async function renderDashboard() {
  // Dynamic import so mocks are applied first
  const { default: Dashboard } = await import('./Dashboard');
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// ── test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: everything succeeds with zero data
  mockUseSupabaseCount.mockReturnValue(countOk(0));
  mockUseSupabaseQuery.mockReturnValue(queryOk([]));
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard', () => {
  // ── 1. Loading state ────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton cards while contacts count is loading', async () => {
      // One of the count hooks is still loading
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'contacts') return { data: 0, isLoading: true, isError: false };
        return countOk(0);
      });

      await renderDashboard();

      // Stat cards replaced by skeletons — "Total de Conversas" title must NOT be visible
      expect(screen.queryByText('Total de Conversas')).toBeNull();
    });

    it('renders skeleton cards while conversations count is loading', async () => {
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'conversations') return { data: 0, isLoading: true, isError: false };
        return countOk(0);
      });

      await renderDashboard();

      expect(screen.queryByText('Total de Conversas')).toBeNull();
    });

    it('renders stat cards when all hooks are resolved', async () => {
      await renderDashboard();

      expect(screen.getByText('Total de Conversas')).toBeInTheDocument();
      expect(screen.getByText('Contatos')).toBeInTheDocument();
    });
  });

  // ── 2. Error state ──────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error alert when contacts count fails', async () => {
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'contacts') return { data: 0, isLoading: false, isError: true };
        return countOk(0);
      });

      await renderDashboard();

      expect(
        screen.getByText('Erro ao carregar estatísticas. Tente novamente.')
      ).toBeInTheDocument();
    });

    it('shows error alert when campaigns count fails', async () => {
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'mass_message_campaigns') return { data: 0, isLoading: false, isError: true };
        return countOk(0);
      });

      await renderDashboard();

      expect(
        screen.getByText('Erro ao carregar estatísticas. Tente novamente.')
      ).toBeInTheDocument();
    });

    it('shows activity error alert when the messages query fails', async () => {
      mockUseSupabaseQuery.mockReturnValue({ data: [], isLoading: false, isError: true });

      await renderDashboard();

      expect(
        screen.getByText('Erro ao carregar atividades recentes.')
      ).toBeInTheDocument();
    });

    it('does NOT show stat error alert when only activity query fails', async () => {
      mockUseSupabaseQuery.mockReturnValue({ data: [], isLoading: false, isError: true });

      await renderDashboard();

      // Stat cards must still render (count hooks are fine)
      expect(screen.getByText('Total de Conversas')).toBeInTheDocument();
    });
  });

  // ── 3. Card "Total de Conversas" comes from conversations count ─────────────

  describe('"Total de Conversas" card', () => {
    it('displays the value returned by conversations count hook', async () => {
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'conversations') return countOk(42);
        return countOk(0);
      });

      await renderDashboard();

      expect(screen.getByText('Total de Conversas')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('does NOT display the conversations count value as messages count', async () => {
      // conversations = 7, contacts = 999 — make sure 7 is on the card, not
      // accidentally coming from another source
      mockUseSupabaseCount.mockImplementation((table: string) => {
        if (table === 'conversations') return countOk(7);
        if (table === 'contacts') return countOk(999);
        return countOk(0);
      });

      await renderDashboard();

      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('999')).toBeInTheDocument();
    });

    it('calls useSupabaseCount for conversations with is_archived=false filter', async () => {
      await renderDashboard();

      // Find the call that targeted 'conversations'
      const conversationsCall = mockUseSupabaseCount.mock.calls.find(
        ([table]: [string]) => table === 'conversations'
      );
      expect(conversationsCall).toBeDefined();
      const filters = conversationsCall![1];
      expect(filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'is_archived', operator: 'eq', value: false }),
        ])
      );
    });
  });

  // ── 4. Activity mapping ─────────────────────────────────────────────────────

  describe('recent activity mapping', () => {
    it('labels direction="incoming" as "Mensagem recebida de <name>"', async () => {
      mockUseSupabaseQuery.mockReturnValue(
        queryOk([
          {
            id: 'msg-1',
            content: 'oi',
            direction: 'incoming',
            created_at: new Date().toISOString(),
            contacts: { name: 'João Silva', phone: '+5511999990001' },
          },
        ])
      );

      await renderDashboard();

      expect(screen.getByText('Mensagem recebida de João Silva')).toBeInTheDocument();
    });

    it('labels direction="inbound" as "Mensagem recebida de <name>" (provider variant)', async () => {
      mockUseSupabaseQuery.mockReturnValue(
        queryOk([
          {
            id: 'msg-2',
            content: 'olá',
            direction: 'inbound',
            created_at: new Date().toISOString(),
            contacts: { name: 'Maria', phone: '+5511999990002' },
          },
        ])
      );

      await renderDashboard();

      expect(screen.getByText('Mensagem recebida de Maria')).toBeInTheDocument();
    });

    it('labels direction="outgoing" as "Mensagem enviada para <name>"', async () => {
      mockUseSupabaseQuery.mockReturnValue(
        queryOk([
          {
            id: 'msg-3',
            content: 'resposta',
            direction: 'outgoing',
            created_at: new Date().toISOString(),
            contacts: { name: 'Pedro', phone: '+5511999990003' },
          },
        ])
      );

      await renderDashboard();

      expect(screen.getByText('Mensagem enviada para Pedro')).toBeInTheDocument();
    });

    it('falls back to phone when contact name is null', async () => {
      mockUseSupabaseQuery.mockReturnValue(
        queryOk([
          {
            id: 'msg-4',
            content: 'oi',
            direction: 'incoming',
            created_at: new Date().toISOString(),
            contacts: { name: null, phone: '+5599888880000' },
          },
        ])
      );

      await renderDashboard();

      expect(screen.getByText('Mensagem recebida de +5599888880000')).toBeInTheDocument();
    });

    it('shows "contato desconhecido" when contacts relation is null (LEFT JOIN result)', async () => {
      mockUseSupabaseQuery.mockReturnValue(
        queryOk([
          {
            id: 'msg-5',
            content: 'orphan',
            direction: 'incoming',
            created_at: new Date().toISOString(),
            contacts: null,
          },
        ])
      );

      await renderDashboard();

      expect(screen.getByText('Mensagem recebida de contato desconhecido')).toBeInTheDocument();
    });

    it('shows empty state when there is no recent activity', async () => {
      mockUseSupabaseQuery.mockReturnValue(queryOk([]));

      await renderDashboard();

      expect(screen.getByText('Nenhuma atividade recente')).toBeInTheDocument();
    });

    it('passes direction column (not sender_type) in the select query', async () => {
      await renderDashboard();

      const callArgs = mockUseSupabaseQuery.mock.calls[0]?.[0];
      expect(callArgs?.select).toContain('direction');
      expect(callArgs?.select).not.toContain('sender_type');
    });
  });

  // ── 5. Cross-tenant isolation (edge case) ───────────────────────────────────

  describe('cross-tenant isolation', () => {
    it('scopes useSupabaseCount calls to the current tenant (via hook contract)', async () => {
      // The hooks themselves enforce tenant scoping; here we verify the Dashboard
      // does NOT pass a tenant_id filter directly (that would bypass RLS / hook logic).
      await renderDashboard();

      // Every useSupabaseCount call must NOT carry an explicit tenant_id filter
      mockUseSupabaseCount.mock.calls.forEach(([_table, filters]: [string, unknown[] | undefined]) => {
        if (Array.isArray(filters)) {
          const hasTenantFilter = filters.some(
            (f: any) => f.column === 'tenant_id'
          );
          expect(hasTenantFilter).toBe(false);
        }
      });
    });
  });
});
