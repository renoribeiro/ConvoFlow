# RUNBOOK — Responder pelo Instagram no inbox (fatia 3/5)

O atendente responde, em texto, um cliente do Instagram pela tela de
Conversas. Este documento diz o que está no ar, o que falta subir e como fazer
o primeiro teste real, com o que olhar depois.

## Estado atual (2026-09-23)

| Peça | Estado |
|---|---|
| Migração `20260923000002_instagram_reply` | **Aplicada** em produção (ledger ok). Contagens da EncaixaRH iguais antes e depois (2743 mensagens, 171 contatos, 170 conversas) |
| Suíte `docs/teste_instagram_resposta.sql` | 55/55 verde antes de aplicar (dentro de transação desfeita) e depois de aplicar; sabotagem do casamento derruba exatamente 12 afirmações |
| Edge function `instagram-send-message` | **Falta deploy — passo 1** |
| Tela (inbox) | Na branch `feat/instagram-fatia3-responder` — **prévia da Vercel, passo 2**. Não mergeada |
| `instagram-webhook` | Não muda. A reconciliação do eco mora no banco (`process_instagram_message`), que já está no ar |
| `whatsapp-send-message`, `meta-webhook` | Intocados (byte a byte iguais à `main`) e não redeployados |

Conta Teste Gerente = `baf2559e-1d38-4c5c-af7d-f6c268a9154e`.
Instância de Instagram de teste = `0c4029bb-e0b6-4307-849b-d947ec4e4164`
(conta `17841419262135883`, token válido até 2026-11-23).

## O que a migração pôs no ar

- `instagram_reply_window(contact_id)` — a janela de 24 h por CONTATO. A
  `is_within_service_window` do WhatsApp casa por telefone e não serve.
- `process_instagram_message` — o eco da resposta que o próprio inbox mandou
  é reconhecido e não vira segunda linha. A linha que fica é a do navegador
  (tem autor e registra participante).
- `instagram_echo_claims` — registro de "este eco casou com esta linha", com
  o tipo do casamento. É por ela que o passo 3 descobre a ordem dos eventos.
- `reconcile_instagram_send` — quando o UPDATE do navegador bate no índice
  único (o eco chegou antes e não casou), funde as duas linhas.

Desfazer: bloco ROLLBACK no fim da migração. Derrube o envio (passo 1 ao
contrário: apagar a função) ANTES, senão a próxima resposta pode duplicar.

## Passo 1 — deploy da função de envio (PowerShell, uma linha por vez)

```powershell
git checkout feat/instagram-fatia3-responder
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
npx supabase functions deploy instagram-send-message --project-ref pqjkuwyshybxldzpfbbs --use-api
```

**Deu certo quando** termina com
`Deployed Functions on project pqjkuwyshybxldzpfbbs: instagram-send-message`.
Sobe SÓ essa função. Ela não usa secret novo: o token vem do Vault
(`get_instance_meta_token`), o mesmo cofre do WhatsApp.

Sozinha ela não faz nada: só a tela nova chama.

## Passo 2 — abrir a tela nova

A branch empurrada gera uma prévia na Vercel (mesmo banco de produção). Use o
link da prévia que aparece no PR, entre como o **Gerente da Conta Teste
Gerente** e abra **Conversas**.

## Passo 3 — o teste real

1. Do celular, com uma conta pessoal do Instagram, mande uma mensagem para a
   conta de teste (`@convoflow`). Isso abre a janela de 24 h.
2. Na prévia, em Conversas, abra essa conversa (aparece como "Contato sem
   nome" — o nome é da próxima fatia).
3. Confira antes de enviar:
   - o campo diz **"Responder no Instagram..."**;
   - **não** há clipe de anexo, microfone nem "Enviar template";
   - não há aviso amarelo acima do campo.
4. Escreva uma frase curta e única (ex.: `teste fatia 3 - 1`) e envie.
5. Olhe a conversa por 30 segundos:
   - a mensagem aparece **uma vez**, com relógio e depois **um risco só**
     ("Enviada");
   - no celular, a mensagem chega.
6. Me avise. Eu rodo a consulta abaixo e respondo: se o eco chegou, se o mid
   dele é o mesmo message_id do envio, em que ordem vieram, e que existe
   exatamente uma linha.

**Se não deu certo**
- Aviso "a conexão do Instagram desta conversa não está disponível": a tela
  não achou a instância de Instagram da conversa. Nada saiu, por nenhum
  canal (é a regra).
- Toast com "(código N)": a Meta recusou; o código diz por quê. O log da
  função (painel do Supabase → Edge Functions → instagram-send-message → Logs)
  mostra `reason`, `code` e `subcode`, nunca o texto.
- A mensagem aparece duas vezes: é exatamente o que este teste procura. Não
  apague nada; me avise.

## Consulta de conferência (somente leitura)

```sql
SELECT m.created_at,
       m.status,
       left(m.evolution_message_id, 20) || '…'         AS mid_da_linha,
       p.first_name                                   AS autor,
       c.kind                                         AS casamento,
       left(c.mid, 20) || '…'                         AS mid_do_eco,
       (c.mid = m.evolution_message_id)               AS mesmo_id,
       c.created_at - m.created_at                    AS eco_depois_de
  FROM public.messages m
  LEFT JOIN public.profiles p ON p.id = m.sender_profile_id
  LEFT JOIN public.instagram_echo_claims c ON c.message_id = m.id
 WHERE m.tenant_id = 'baf2559e-1d38-4c5c-af7d-f6c268a9154e'
   AND m.channel = 'instagram'
   AND m.direction = 'outbound'
   AND m.created_at > now() - interval '1 hour'
 ORDER BY m.created_at;
```

Como ler `casamento`:

| casamento | mesmo_id | o que aconteceu |
|---|---|---|
| `mid_match` | true | o navegador gravou o id primeiro; o eco veio depois com o MESMO id |
| `claimed_pending` | true | o eco chegou ANTES do navegador gravar o id; mesmo id |
| `claimed_pending` | false | o eco chegou antes; ids DIFERENTES (a linha guarda o do envio, o casamento o do eco) |
| `claimed_sent` | false | o navegador gravou primeiro; ids DIFERENTES |
| `merged_by_browser` | true | o eco chegou antes e não casou pelo texto; o navegador fundiu as duas |
| vazio | — | nenhum eco chegou (a API pode não ecoar o que ela mesma mandou) |

Em todos os casos o esperado é **uma linha por mensagem enviada**, com autor.

## O que esta fatia não faz

Mídia, reação, citação, bot, campanha, follow-up, nome do contato, renovação
do token (vence em 60 dias; `tokenExpiresAt` na instância), leitura
("visto"). A resposta fica com um risco só: o Instagram não informa entrega.
