import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Seletor de contato do "Novo Follow-up" (decisão do dono, 2026-09-25):
 * contato do Instagram NUNCA aparece em "Agendado" nem em "Sequência" — os
 * modos que mandam WhatsApp sozinhos. Os contatos de WhatsApp aparecem
 * exatamente como antes ("Nome (telefone)"), em todos os modos.
 */

const { state } = vi.hoisted(() => ({ state: { contacts: [] as Record<string, unknown>[] } }));

vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({ contacts: state.contacts, loading: false }),
}));
vi.mock('@/hooks/useFollowups', () => ({
  useFollowups: () => ({ createFollowup: vi.fn() }),
}));
vi.mock('@/hooks/useFollowupSequences', () => ({
  useFollowupSequences: () => ({ sequences: [], loading: false, enrollContact: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: [], error: null })), from: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { FollowupScheduler } from './FollowupScheduler';

// O Radix Select usa pointer capture, que o jsdom não tem.
beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
});

const WA_ANA = { id: 'wa-1', channel: 'whatsapp', name: 'Ana Beatriz Nogueira', phone: '5585991112201', username: null };
const WA_BRUNO = { id: 'wa-2', channel: 'whatsapp', name: 'Bruno Carvalho Lima', phone: '5585991112202', username: null };
const IG_YURI = { id: 'ig-1', channel: 'instagram', name: 'Yuri Saldanha | Tráfego Pago', phone: null, username: 'oyurisaldanha' };
const IG_BARE = { id: 'ig-2', channel: 'instagram', name: null, phone: null, username: 'debs_silvas2' };

beforeEach(() => {
  state.contacts = [WA_ANA, IG_YURI, WA_BRUNO, IG_BARE];
});

const contactTrigger = () => {
  const trigger = screen.getByText('Selecione um contato').closest('button');
  if (!trigger) throw new Error('gatilho do seletor de contato não encontrado');
  return trigger;
};

async function openPickerOptions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(contactTrigger());
  const listbox = await screen.findByRole('listbox');
  return within(listbox).getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim());
}

async function chooseMode(user: ReturnType<typeof userEvent.setup>, name: 'Manual' | 'Agendado' | 'Sequência') {
  await user.click(screen.getByText(name, { selector: 'h4' }));
}

describe('Novo Follow-up — seletor de contato por canal', () => {
  it('Agendado: nenhum contato do Instagram; WhatsApp como sempre, na mesma ordem', async () => {
    const user = userEvent.setup();
    render(<FollowupScheduler onClose={vi.fn()} />);
    await chooseMode(user, 'Agendado');
    const options = await openPickerOptions(user);
    expect(options).toEqual([
      'Ana Beatriz Nogueira(5585991112201)',
      'Bruno Carvalho Lima(5585991112202)',
    ]);
    expect(options.join(' ')).not.toMatch(/Yuri|oyurisaldanha|debs_silvas2|Instagram/);
  });

  it('Sequência: nenhum contato do Instagram', async () => {
    const user = userEvent.setup();
    render(<FollowupScheduler onClose={vi.fn()} />);
    await chooseMode(user, 'Sequência');
    const options = await openPickerOptions(user);
    expect(options).toEqual([
      'Ana Beatriz Nogueira(5585991112201)',
      'Bruno Carvalho Lima(5585991112202)',
    ]);
  });

  it('Manual: tarefa para a pessoa fazer — o Instagram continua na lista, WhatsApp igual', async () => {
    const user = userEvent.setup();
    render(<FollowupScheduler onClose={vi.fn()} />);
    const options = await openPickerOptions(user);
    expect(options).toEqual([
      'Ana Beatriz Nogueira(5585991112201)',
      'Yuri Saldanha | Tráfego Pago(@oyurisaldanha)',
      'Bruno Carvalho Lima(5585991112202)',
      '@debs_silvas2',
    ]);
  });

  it('só contatos do Instagram: Agendado mostra "Nenhum contato encontrado"', async () => {
    state.contacts = [IG_YURI, IG_BARE];
    const user = userEvent.setup();
    render(<FollowupScheduler onClose={vi.fn()} />);
    await chooseMode(user, 'Agendado');
    const options = await openPickerOptions(user);
    expect(options).toEqual(['Nenhum contato encontrado']);
  });

  it('Instagram escolhido no Manual é desfeito ao trocar para Agendado; WhatsApp escolhido fica', async () => {
    const user = userEvent.setup();
    render(<FollowupScheduler onClose={vi.fn()} />);

    await user.click(contactTrigger());
    await user.click(await screen.findByRole('option', { name: /oyurisaldanha/ }));
    expect(screen.queryByText('Selecione um contato')).toBeNull();

    await chooseMode(user, 'Agendado');
    expect(screen.getByText('Selecione um contato')).toBeInTheDocument();

    await user.click(contactTrigger());
    await user.click(await screen.findByRole('option', { name: /Ana Beatriz Nogueira/ }));
    await chooseMode(user, 'Sequência');
    expect(screen.queryByText('Selecione um contato')).toBeNull();
  });
});
