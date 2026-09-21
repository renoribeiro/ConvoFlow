/**
 * Modal "Filtrar Conversas".
 *
 * O que precisa continuar verdadeiro:
 *  - as etiquetas oferecidas são as do `useTags` (a Loja do seletor), e marcar
 *    uma manda `tagIds` para fora na hora — não existe passo de aplicar;
 *  - "Fechar" só fecha: não mexe no estado;
 *  - "Limpar" volta tudo ao padrão, etiquetas incluídas;
 *  - o número do selo conta período como UM filtro, e etiquetas como UM;
 *  - nenhum texto do modal fala em coluna, tabela ou em filtro que não existe.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const tagsMock = vi.hoisted(() => ({
  tags: [
    { id: 'tag-quente', name: 'Quente', color: '#ef4444' },
    { id: 'tag-frio', name: 'Frio', color: '#3b82f6' },
  ] as Array<{ id: string; name: string; color: string }>,
  isLoading: false,
}));

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ tags: tagsMock.tags, isLoading: tagsMock.isLoading }),
}));

import {
  ConversationFiltersModal,
  DEFAULT_FILTER_STATE,
  countActiveFilters,
  type ConversationsFilterState,
} from './ConversationFiltersModal';

const onClose = vi.fn();
const onChange = vi.fn();

const renderModal = (value: Partial<ConversationsFilterState> = {}) =>
  render(
    <ConversationFiltersModal
      isOpen
      onClose={onClose}
      onChange={onChange}
      value={{ ...DEFAULT_FILTER_STATE, ...value }}
    />,
  );

beforeEach(() => {
  onClose.mockReset();
  onChange.mockReset();
  tagsMock.tags = [
    { id: 'tag-quente', name: 'Quente', color: '#ef4444' },
    { id: 'tag-frio', name: 'Frio', color: '#3b82f6' },
  ];
  tagsMock.isLoading = false;
});

describe('seletor de etiquetas', () => {
  it('oferece as etiquetas da Loja aberta (as do useTags)', () => {
    renderModal();
    const grupo = screen.getByRole('group', { name: 'Etiquetas do contato' });
    expect(within(grupo).getByText('Quente')).toBeInTheDocument();
    expect(within(grupo).getByText('Frio')).toBeInTheDocument();
  });

  it('marcar uma etiqueta sai na hora em tagIds, sem passo de aplicar', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('checkbox', { name: 'Quente' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_STATE, tagIds: ['tag-quente'] });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marcar uma segunda etiqueta acrescenta à lista (qualquer uma delas)', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente'] });
    await user.click(screen.getByRole('checkbox', { name: 'Frio' }));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTER_STATE,
      tagIds: ['tag-quente', 'tag-frio'],
    });
  });

  it('clicar numa etiqueta marcada desmarca só ela', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente', 'tag-frio'] });
    expect(screen.getByRole('checkbox', { name: 'Quente' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('checkbox', { name: 'Quente' }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTER_STATE, tagIds: ['tag-frio'] });
  });

  it('sem etiqueta na Loja, diz onde criar em vez de mostrar lista vazia', () => {
    tagsMock.tags = [];
    renderModal();
    expect(screen.getByText(/Nenhuma etiqueta nesta Loja ainda/)).toBeInTheDocument();
  });
});

describe('botões', () => {
  it('"Fechar" só fecha — não altera nenhum filtro', async () => {
    const user = userEvent.setup();
    renderModal({ tagIds: ['tag-quente'], hasUnread: true });
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('não existe mais "Aplicar": nada a aplicar, tudo já valeu', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument();
  });

  it('"Limpar" volta ao padrão, etiquetas incluídas, e não fecha', async () => {
    const user = userEvent.setup();
    renderModal({
      tagIds: ['tag-quente', 'tag-frio'],
      hasUnread: true,
      isArchived: true,
      dateFrom: new Date(2026, 8, 1),
      dateTo: new Date(2026, 8, 20),
    });
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
    expect(onChange.mock.calls[0][0].tagIds).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('texto do modal', () => {
  it('fala com quem atende: nada de coluna, tabela ou aviso de filtro que não existe', () => {
    renderModal();
    // Dialog do Radix renderiza em portal; o texto está no document, não no container.
    const tudo = document.body.textContent ?? '';
    expect(tudo).toContain('Filtrar Conversas');
    expect(tudo).not.toMatch(/last_message_at/);
    expect(tudo).not.toMatch(/conversations/);
    expect(tudo).not.toMatch(/coluna/i);
    expect(tudo).not.toMatch(/status\/agentes/i);
    expect(document.body.querySelector('code')).toBeNull();
  });

  it('a descrição diz só o que é verdade: vale na hora e soma às pílulas', () => {
    renderModal();
    expect(screen.getByText(/vale na hora, assim que você marca/)).toBeInTheDocument();
  });

  it('"arquivadas" diz que as ativas somem, não que as arquivadas se somam', () => {
    renderModal();
    expect(screen.getByLabelText(/Só conversas arquivadas \(as ativas somem da lista\)/)).toBeInTheDocument();
  });

  it('o período não tem nome de coluna e avisa que o dia "Até" entra inteiro', () => {
    renderModal();
    expect(screen.getByText('Período da última mensagem')).toBeInTheDocument();
    expect(screen.getByText('Até (o dia inteiro)')).toBeInTheDocument();
  });
});

describe('countActiveFilters (o número do selo em "Filtros")', () => {
  it('zero no padrão', () => {
    expect(countActiveFilters(DEFAULT_FILTER_STATE)).toBe(0);
  });

  it('período conta UMA vez, com "De", com "Até" ou com os dois', () => {
    const de = new Date(2026, 8, 1);
    const ate = new Date(2026, 8, 20);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateFrom: de })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateTo: ate })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, dateFrom: de, dateTo: ate })).toBe(1);
  });

  it('etiquetas contam UMA vez, marcadas uma ou várias', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, tagIds: ['a'] })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTER_STATE, tagIds: ['a', 'b', 'c'] })).toBe(1);
  });

  it('tudo ligado = 4 (não lidas, arquivadas, período, etiquetas)', () => {
    expect(
      countActiveFilters({
        hasUnread: true,
        isArchived: true,
        dateFrom: new Date(2026, 8, 1),
        dateTo: new Date(2026, 8, 20),
        tagIds: ['a', 'b'],
      }),
    ).toBe(4);
  });
});
