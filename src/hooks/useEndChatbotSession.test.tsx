/**
 * Tests for useEndChatbotSession.
 *
 * Chain shapes:
 *   find:   from('chatbot_sessions').select('id')
 *             .eq('tenant_id', id).eq('contact_id', cid).eq('status','active')
 *             [.eq('whatsapp_instance_id', wid)].maybeSingle() → { data, error }
 *   update: from('chatbot_sessions').update(patch)
 *             .eq('id', sid).eq('tenant_id', id) → { error }
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 'tenant-abc' } }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Builds a `from()` object exposing both .select() (find) and .update() paths.
 * `sessionRow` is what maybeSingle() resolves with (null = no active session).
 */
function makeChain(sessionRow: { id: string } | null, updateErr: Error | null = null) {
  const selectChain: any = {};
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.maybeSingle = vi.fn(() => Promise.resolve({ data: sessionRow, error: null }));

  const updateChain: any = {};
  updateChain.eq = vi.fn(() => updateChain);
  updateChain.then = (resolve: (v: { error: Error | null }) => unknown) =>
    resolve({ error: updateErr });

  const selectSpy = vi.fn(() => selectChain);
  const updateSpy = vi.fn(() => updateChain);
  const fromObj = { select: selectSpy, update: updateSpy };

  return { fromObj, selectChain, updateChain, selectSpy, updateSpy };
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

import { useEndChatbotSession } from './useEndChatbotSession';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useEndChatbotSession', () => {
  it('marks the active session completed and returns ended: true', async () => {
    const { fromObj, updateSpy, updateChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({
      contactId: 'contact-1',
      whatsappInstanceId: 'inst-1',
    });

    expect(res).toEqual({ ended: true });
    // Update patch closes the session so the bot stops re-sending the menu.
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', awaiting_input: false }),
    );
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('returns ended: false and does not update when there is no active session', async () => {
    const { fromObj, updateSpy } = makeChain(null);
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    const res = await result.current.mutateAsync({ contactId: 'contact-1' });

    expect(res).toEqual({ ended: false });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('filters by whatsapp_instance_id only when provided', async () => {
    const { fromObj, selectChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ contactId: 'contact-1', whatsappInstanceId: 'inst-9' });

    expect(selectChain.eq).toHaveBeenCalledWith('whatsapp_instance_id', 'inst-9');
    expect(selectChain.eq).toHaveBeenCalledWith('contact_id', 'contact-1');
    expect(selectChain.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('does not filter by instance when instance id is absent', async () => {
    const { fromObj, selectChain } = makeChain({ id: 'sess-1' });
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ contactId: 'contact-1' });

    const instanceCall = selectChain.eq.mock.calls.find(
      (c: unknown[]) => c[0] === 'whatsapp_instance_id',
    );
    expect(instanceCall).toBeUndefined();
  });

  it('surfaces an update error', async () => {
    const { fromObj } = makeChain({ id: 'sess-1' }, new Error('rls denied'));
    mockFrom.mockReturnValue(fromObj);

    const { result } = renderHook(() => useEndChatbotSession(), { wrapper: makeWrapper() });

    await expect(
      result.current.mutateAsync({ contactId: 'contact-1' }),
    ).rejects.toThrow('rls denied');
  });
});
