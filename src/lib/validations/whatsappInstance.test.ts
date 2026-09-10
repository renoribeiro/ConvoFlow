import { describe, it, expect } from 'vitest';
import { newInstanceSchema } from './whatsappInstance';

/**
 * O formulário da Evolution não pedia URL do servidor nem API Key. Sem elas o
 * EvolutionApiService nunca era construído, `createInstance` abortava antes de
 * qualquer chamada de rede e a tela ficava girando sem mensagem nenhuma. Estes
 * testes existem para que os dois campos não voltem a sumir do contrato.
 */

const evolutionBase = {
  provider: 'evolution' as const,
  name: 'WhatsApp Vendas',
  instance_key: 'vendas_001',
  serverUrl: 'https://evo.exemplo.com.br',
  apiKey: 'ABCDEF1234567890abcdef',
  enableWebhookAutomation: true,
  retryAttempts: 3,
  retryDelay: 2000,
};

describe('newInstanceSchema — Evolution', () => {
  it('aceita um payload completo', () => {
    const parsed = newInstanceSchema.safeParse(evolutionBase);
    expect(parsed.success).toBe(true);
  });

  it('recusa quando falta a URL do servidor', () => {
    const { serverUrl: _omitido, ...semUrl } = evolutionBase;
    const parsed = newInstanceSchema.safeParse(semUrl);
    expect(parsed.success).toBe(false);
  });

  it('recusa quando falta a API Key', () => {
    const { apiKey: _omitido, ...semChave } = evolutionBase;
    const parsed = newInstanceSchema.safeParse(semChave);
    expect(parsed.success).toBe(false);
  });

  it('recusa URL de servidor que não é URL', () => {
    const parsed = newInstanceSchema.safeParse({
      ...evolutionBase,
      serverUrl: 'evo.exemplo.com.br',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('URL do servidor Evolution');
    }
  });

  it('recusa API Key curta demais', () => {
    const parsed = newInstanceSchema.safeParse({ ...evolutionBase, apiKey: 'curta' });
    expect(parsed.success).toBe(false);
  });

  it('recusa API Key com caracteres que o header apikey não carrega', () => {
    const parsed = newInstanceSchema.safeParse({
      ...evolutionBase,
      apiKey: 'chave com espaço e acento çã',
    });
    expect(parsed.success).toBe(false);
  });

  it('mantém a chave da instância restrita a letras, números, _ e -', () => {
    const parsed = newInstanceSchema.safeParse({
      ...evolutionBase,
      instance_key: 'vendas 001',
    });
    expect(parsed.success).toBe(false);
  });

  it('não exige credenciais da Evolution nos outros provedores', () => {
    const waha = newInstanceSchema.safeParse({
      provider: 'waha',
      name: 'WhatsApp Suporte',
      serverUrl: 'https://waha.exemplo.com.br',
      apiKey: '',
      sessionName: 'default',
    });
    expect(waha.success).toBe(true);
  });
});
