import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { matchVerifyToken } from '../_shared/cryptoSignature.ts';
import {
  configuredCandidates,
  distinctConfiguredCount,
  isWellFormedSignatureHeader,
  matchAllCandidates,
  matchedNames,
  summarizeInstagramPayload,
} from './probe.ts';

/**
 * instagram-webhook — SONDA. Não é funcionalidade.
 *
 * ============================================================================
 * PARA QUE ISTO EXISTE
 * ============================================================================
 *
 * A documentação da Meta diz que o webhook é assinado com "o App Secret do seu
 * app", e não diz QUAL app quando existem dois: o app principal (WhatsApp,
 * 855618774210988) e o app de Instagram (1445899737404624), que tem id e
 * segredo próprios. Toda a fatia 2 depende dessa resposta: com o segredo
 * errado, nenhuma entrega passa da verificação.
 *
 * Esta função responde isso com UMA entrega real, antes de alguém escrever um
 * parser. Ela:
 *   - responde ao handshake da Meta com um verify token SÓ DELA;
 *   - calcula o HMAC do corpo cru com os TRÊS candidatos e registra quem bateu;
 *   - descreve o FORMATO da entrega (nomes de campo e booleanos);
 *   - devolve 200 sempre;
 *   - NÃO escreve nada no banco. Nenhum contato, nenhuma mensagem, nenhuma
 *     instância.
 *
 * ============================================================================
 * O QUE ELA DELIBERADAMENTE NÃO FAZ
 * ============================================================================
 *
 * Não registra conteúdo de mensagem, não registra segredo nenhum, não registra
 * o payload inteiro e não registra o IGSID (o identificador do cliente que
 * escreveu — é ele a pessoa, não o negócio). O que sai no log é nome de campo,
 * booleano, contagem e tamanho. O resumo é função pura em `probe.ts`, e há
 * teste afirmando que o texto da mensagem não aparece nele.
 *
 * ============================================================================
 * POR QUE NÃO MEXER NO meta-webhook
 * ============================================================================
 *
 * `meta-webhook` é o único caminho de entrada do número de WhatsApp em
 * produção. Ele fica em v54, byte a byte, durante toda esta fatia. Além do
 * risco óbvio, há dois motivos técnicos:
 *
 *   1. Os slots `_SECONDARY` de lá têm significado reservado e documentado —
 *      rotação de app do WhatsApp (ver o cabeçalho de meta-webhook/index.ts).
 *      Pendurar o Instagram num deles quebraria a próxima troca de app.
 *   2. O limitador de taxa de lá roda ANTES da verificação de assinatura e é
 *      chaveado por IP: entrega de Instagram consumiria a cota do WhatsApp.
 *
 * ============================================================================
 * UMA DECISÃO CONSCIENTE SOBRE O 200
 * ============================================================================
 *
 * "Sempre 200" vale para o POST — é o que impede a Meta de reenviar e de
 * desativar a inscrição enquanto estamos aprendendo.
 *
 * O GET (handshake) NÃO segue essa regra: token errado devolve 403. Se o
 * handshake respondesse 200 a qualquer token, ele passaria a "funcionar"
 * sempre, o painel da Meta mostraria a inscrição verde e as entregas nunca
 * chegariam — exatamente a armadilha silenciosa que esta função existe para
 * evitar. Handshake que aceita tudo não é handshake.
 */
Deno.serve(async (req: Request) => {
  const logger = createLogger(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Os três candidatos, na ordem de SIGNATURE_CANDIDATES. Só lidos, nunca
  // registrados. `INSTAGRAM_*` são novos e existem para que ninguém confunda
  // com os do WhatsApp.
  const igAppSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  const igVerifyToken = Deno.env.get('INSTAGRAM_VERIFY_TOKEN');
  const metaAppSecret = Deno.env.get('META_APP_SECRET');
  const metaAppSecretSecondary = Deno.env.get('META_APP_SECRET_SECONDARY');

  // ---------------------------------------------------------------------------
  // GET — handshake de verificação da Meta
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const provided = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (!igVerifyToken) {
      // Sem o secret configurado não existe handshake possível. 500 (e não 403)
      // porque o problema é nosso, não da Meta.
      logger.error('instagram-webhook: INSTAGRAM_VERIFY_TOKEN nao esta configurado');
      return new Response('Server misconfigured', { status: 500 });
    }

    const matched = matchVerifyToken(provided, [igVerifyToken]) === 0;

    if (mode === 'subscribe' && matched && challenge) {
      logger.info('instagram-webhook: handshake OK', { mode, hasChallenge: true });
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    logger.warn('instagram-webhook: handshake recusado', {
      mode,
      matched,
      hasChallenge: !!challenge,
      // "veio parâmetro?" separa "a Meta não mandou nada" de "mandou e não bate".
      // Não pode se chamar *Token: o logger censuraria a chave.
      parametroPresente: typeof provided === 'string' && provided.length > 0,
    });
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ---------------------------------------------------------------------------
  // POST — a pergunta. Tudo dentro do try: nada aqui pode virar não-200.
  // ---------------------------------------------------------------------------
  try {
    // Corpo CRU antes de qualquer parse: a Meta assina exatamente estes bytes.
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');

    const candidates = [igAppSecret, metaAppSecret, metaAppSecretSecondary];
    const flags = await matchAllCandidates(rawBody, signatureHeader, candidates);
    const matched = matchedNames(flags);

    // ESTA é a linha que responde a pergunta da fatia.
    logger.info('instagram-webhook: assinatura', {
      // 'none' = nenhum dos três. Mais de um = dois slots com o mesmo valor.
      signedBy: matched.length > 0 ? matched.join('+') : 'none',
      matches: flags,
      configured: configuredCandidates(candidates),
      // Se vier menor que a quantidade de configurados, há valor repetido —
      // e aí "quem bateu" não conclui nada. Ver distinctConfiguredCount.
      distinctConfigured: distinctConfiguredCount(candidates),
      hasHeader: !!signatureHeader,
      headerWellFormed: isWellFormedSignatureHeader(signatureHeader),
      bodyLength: rawBody.length,
      userAgent: req.headers.get('user-agent'),
    });

    // E esta responde "com que formato a entrega chega".
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn('instagram-webhook: corpo nao e JSON valido', { bodyLength: rawBody.length });
    }

    if (payload !== null) {
      logger.info('instagram-webhook: formato da entrega', summarizeInstagramPayload(payload));
    }
  } catch (err) {
    // Sonda que derruba a entrega não serve para nada: registra e segue para o 200.
    logger.error('instagram-webhook: falha ao inspecionar a entrega', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Sempre 200. Ver o cabeçalho.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
