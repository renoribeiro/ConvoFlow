import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ComingSoonButton } from './ComingSoonButton';

const montar = (ui: React.ReactNode) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe('ComingSoonButton', () => {
  it('renderiza o conteúdo e fica desabilitado', () => {
    montar(<ComingSoonButton>Exportar</ComingSoonButton>);
    const botao = screen.getByRole('button', { name: 'Exportar' });
    expect(botao).toBeInTheDocument();
    expect(botao).toBeDisabled();
  });

  it('clicar não dispara nada — é esse o ponto', async () => {
    const usuario = userEvent.setup();
    const espiao = vi.fn();
    montar(
      <div onClick={espiao}>
        <ComingSoonButton>Exportar</ComingSoonButton>
      </div>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Exportar' }), {
      pointerEventsCheck: 0,
    });
    expect(espiao).not.toHaveBeenCalled();
  });

  it('mostra o motivo ao focar, para o clique não virar silêncio', async () => {
    const usuario = userEvent.setup();
    montar(<ComingSoonButton motivo="Exportação em breve">Exportar</ComingSoonButton>);
    await usuario.tab();
    expect(await screen.findAllByText('Exportação em breve')).not.toHaveLength(0);
  });

  it('usa "Em breve" quando nenhum motivo é passado', async () => {
    const usuario = userEvent.setup();
    montar(<ComingSoonButton>Exportar</ComingSoonButton>);
    await usuario.tab();
    expect(await screen.findAllByText('Em breve')).not.toHaveLength(0);
  });
});
