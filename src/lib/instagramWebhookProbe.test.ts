import { describe, it, expect } from 'vitest';
// Sonda da fatia 2 do Instagram (compartilhada com o Deno).
import {
  SIGNATURE_CANDIDATES,
  configuredCandidates,
  distinctConfiguredCount,
  isWellFormedSignatureHeader,
  matchAllCandidates,
  matchedNames,
  summarizeInstagramPayload,
} from '../../supabase/functions/instagram-webhook/probe';
import { computeHmacSha256Hex } from '../../supabase/functions/_shared/cryptoSignature';

const IG_SECRET = 'instagram-app-secret-0123456789ab';
const META_SECRET = 'meta-app-secret-fedcba9876543210';
const META_SECONDARY = 'meta-app-secret-secundario-abcdef';

const TEXTO = 'oi, tenho interesse no apartamento';
const IGSID = '978239761327698';
const IGID = '17841476961942794';
const MID = 'aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQx';

/** Entrega real de mensagem do Instagram (formato Messenger). */
const IG_PAYLOAD = {
  object: 'instagram',
  entry: [
    {
      id: IGID,
      time: 1778223729706,
      messaging: [
        {
          sender: { id: IGSID },
          recipient: { id: IGID },
          timestamp: 1778223722476,
          message: { mid: MID, text: TEXTO },
        },
      ],
    },
  ],
};

/** O mesmo, mas é o próprio negócio falando — o caso que não pode virar inbound. */
const IG_ECHO_PAYLOAD = {
  object: 'instagram',
  entry: [
    {
      id: IGID,
      messaging: [
        {
          sender: { id: IGID },
          recipient: { id: IGSID },
          message: { mid: MID, text: 'resposta do atendente', is_echo: true },
        },
      ],
    },
  ],
};

/** O formato do WhatsApp, para provar que a sonda distingue os dois. */
const WA_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [{ id: '2542773286191227', changes: [{ field: 'messages', value: { messages: [] } }] }],
};

async function sign(body: string, secret: string): Promise<string> {
  return `sha256=${await computeHmacSha256Hex(body, secret)}`;
}

describe('summarizeInstagramPayload — formato, nunca conteúdo', () => {
  it('descreve uma entrega de mensagem do Instagram', () => {
    const s = summarizeInstagramPayload(IG_PAYLOAD);
    expect(s.object).toBe('instagram');
    expect(s.entryCount).toBe(1);

    const e = s.entries[0];
    expect(e.entryId).toBe(IGID);
    expect(e.hasMessaging).toBe(true);
    expect(e.hasChanges).toBe(false);
    expect(e.messagingCount).toBe(1);

    const m = e.messaging[0];
    expect(m.kind).toBe('message');
    expect(m.hasSender).toBe(true);
    expect(m.hasRecipient).toBe(true);
    expect(m.hasMid).toBe(true);
    expect(m.midLength).toBe(MID.length);
    expect(m.hasText).toBe(true);
    expect(m.textLength).toBe(TEXTO.length);
    expect(m.hasAttachments).toBe(false);
    // Campo ausente é `null`, não `false`: "não veio" ≠ "veio false".
    expect(m.isEcho).toBeNull();
    expect(m.fields).toEqual(['message', 'recipient', 'sender', 'timestamp']);
  });

  it('enxerga is_echo quando o negócio é quem falou', () => {
    const m = summarizeInstagramPayload(IG_ECHO_PAYLOAD).entries[0].messaging[0];
    expect(m.isEcho).toBe(true);
  });

  it('distingue o formato do WhatsApp (changes) do formato do Instagram (messaging)', () => {
    const s = summarizeInstagramPayload(WA_PAYLOAD);
    expect(s.object).toBe('whatsapp_business_account');
    expect(s.entries[0].hasMessaging).toBe(false);
    expect(s.entries[0].hasChanges).toBe(true);
    expect(s.entries[0].changeFields).toEqual(['messages']);
    expect(s.entries[0].messaging).toEqual([]);
  });

  it('classifica eventos que não são mensagem', () => {
    const s = summarizeInstagramPayload({
      object: 'instagram',
      entry: [{ id: IGID, messaging: [{ sender: {}, read: { mid: MID } }, { reaction: {} }] }],
    });
    expect(s.entries[0].messaging.map((m) => m.kind)).toEqual(['read', 'reaction']);
  });

  it('não levanta com lixo, payload vazio ou tipos errados', () => {
    for (const bad of [null, undefined, 42, 'texto', [], {}, { entry: 'nao-e-array' }, { entry: [null] }]) {
      expect(() => summarizeInstagramPayload(bad)).not.toThrow();
    }
    expect(summarizeInstagramPayload(null).entryCount).toBe(0);
    expect(summarizeInstagramPayload({ entry: [null] }).entries[0].entryId).toBeNull();
  });

  // O teste que justifica a sonda existir como função pura: o resumo INTEIRO,
  // serializado, não pode conter o texto da mensagem nem o identificador do
  // cliente. Se alguém acrescentar um campo que vaze, isto fica vermelho.
  it('o resumo serializado não contém o texto da mensagem nem o IGSID', () => {
    const serial = JSON.stringify(summarizeInstagramPayload(IG_PAYLOAD));
    expect(serial).not.toContain(TEXTO);
    expect(serial).not.toContain('interesse');
    expect(serial).not.toContain(IGSID);
    expect(serial).not.toContain(MID);
    // O id da conta que recebeu (o negócio) SAI de propósito: é o que resolve a
    // instância na fatia 3, e não identifica o cliente.
    expect(serial).toContain(IGID);
  });

  // O EdgeLogger censura qualquer CHAVE cujo nome contenha um destes termos.
  // Um campo mal batizado sairia como '***' e a sonda não responderia nada.
  it('nenhum nome de campo do resumo cai na lista de censura do logger', () => {
    const proibidos = ['apikey', 'password', 'token', 'secret', 'key', 'authorization'];
    const nomes: string[] = [];
    const varrer = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(varrer);
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          nomes.push(k);
          varrer(val);
        }
      }
    };
    varrer(summarizeInstagramPayload(IG_PAYLOAD));
    varrer(configuredCandidates([IG_SECRET, META_SECRET, META_SECONDARY]));
    expect(nomes.length).toBeGreaterThan(0);
    for (const nome of [...nomes, ...SIGNATURE_CANDIDATES]) {
      for (const proibido of proibidos) {
        expect(nome.toLowerCase()).not.toContain(proibido);
      }
    }
  });
});

describe('matchAllCandidates — a pergunta da fatia', () => {
  const body = JSON.stringify(IG_PAYLOAD);

  it('acusa SÓ o segredo do Instagram quando foi ele que assinou', async () => {
    const header = await sign(body, IG_SECRET);
    const flags = await matchAllCandidates(body, header, [IG_SECRET, META_SECRET, META_SECONDARY]);
    expect(flags).toEqual({ instagram: true, meta: false, meta_secondary: false });
    expect(matchedNames(flags)).toEqual(['instagram']);
  });

  it('acusa SÓ o segredo do app principal quando foi ele que assinou', async () => {
    const header = await sign(body, META_SECRET);
    const flags = await matchAllCandidates(body, header, [IG_SECRET, META_SECRET, META_SECONDARY]);
    expect(matchedNames(flags)).toEqual(['meta']);
  });

  it('acusa o slot secundário', async () => {
    const header = await sign(body, META_SECONDARY);
    const flags = await matchAllCandidates(body, header, [IG_SECRET, META_SECRET, META_SECONDARY]);
    expect(matchedNames(flags)).toEqual(['meta_secondary']);
  });

  it('nenhum candidato bate quando quem assinou foi outro segredo', async () => {
    const header = await sign(body, 'segredo-de-mais-ninguem');
    const flags = await matchAllCandidates(body, header, [IG_SECRET, META_SECRET, META_SECONDARY]);
    expect(matchedNames(flags)).toEqual([]);
  });

  it('nenhum candidato bate sem header, com header torto ou com corpo adulterado', async () => {
    const header = await sign(body, IG_SECRET);
    for (const h of [null, 'sha256=curto', 'nao-tem-prefixo', '']) {
      expect(matchedNames(await matchAllCandidates(body, h, [IG_SECRET, META_SECRET, META_SECONDARY]))).toEqual([]);
    }
    expect(matchedNames(await matchAllCandidates(body + ' ', header, [IG_SECRET, META_SECRET, META_SECONDARY]))).toEqual([]);
  });

  it('candidato ausente ou vazio nunca bate e nunca explode', async () => {
    const header = await sign(body, META_SECRET);
    const flags = await matchAllCandidates(body, header, [undefined, META_SECRET, '']);
    expect(flags).toEqual({ instagram: false, meta: true, meta_secondary: false });
  });

  // A armadilha que invalidaria a resposta: o mesmo valor em dois slots.
  it('dois slots com o MESMO valor batem os dois — e distinctConfiguredCount denuncia', async () => {
    const header = await sign(body, META_SECRET);
    const flags = await matchAllCandidates(body, header, [META_SECRET, META_SECRET, META_SECONDARY]);
    expect(matchedNames(flags)).toEqual(['instagram', 'meta']);
    expect(distinctConfiguredCount([META_SECRET, META_SECRET, META_SECONDARY])).toBe(2);
  });
});

describe('auxiliares de diagnóstico', () => {
  it('configuredCandidates separa "não bateu" de "nem estava configurado"', () => {
    expect(configuredCandidates([IG_SECRET, undefined, ''])).toEqual({
      instagram: true, meta: false, meta_secondary: false,
    });
    expect(configuredCandidates([])).toEqual({
      instagram: false, meta: false, meta_secondary: false,
    });
  });

  it('distinctConfiguredCount ignora vazios e nulos', () => {
    expect(distinctConfiguredCount([IG_SECRET, META_SECRET, META_SECONDARY])).toBe(3);
    expect(distinctConfiguredCount([IG_SECRET, '', undefined])).toBe(1);
    expect(distinctConfiguredCount([null, undefined, ''])).toBe(0);
  });

  it('isWellFormedSignatureHeader exige sha256= e 64 hex', async () => {
    expect(isWellFormedSignatureHeader(await sign('x', IG_SECRET))).toBe(true);
    expect(isWellFormedSignatureHeader('sha256=NAOEHEX'.padEnd(71, 'z'))).toBe(false);
    expect(isWellFormedSignatureHeader('sha1=' + 'a'.repeat(64))).toBe(false);
    expect(isWellFormedSignatureHeader(null)).toBe(false);
  });
});
