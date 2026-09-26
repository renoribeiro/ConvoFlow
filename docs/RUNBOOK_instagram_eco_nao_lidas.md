# RUNBOOK — Resposta pelo app do Instagram zera as não lidas

Quem responde um cliente do Instagram pelo app do celular não precisa mais
abrir a conversa no ConvoFlow: a resposta (o "eco" que a Meta devolve) zera as
não lidas e tira a conversa de "Aguardando resposta". O mesmo vale para o eco
da resposta enviada pelo próprio inbox.

Receita original: seção "O eco do celular" de
`docs/RUNBOOK_instagram_fatia4a_conversas.md`.

## Estado atual

Estado em 2026-09-25:

| Peça | Estado |
|---|---|
| Migração `20260925000004_instagram_echo_clears_unread` | **Aplicada** (ledger ok). Corpos no banco = arquivo (md5 do `prosrc`: guarda `c088449f…`, `process_instagram_message` `1bd985fb…`). A conferência dentro do bloco passou: EncaixaRH linha a linha igual, contagem de `messages` igual, triggers iguais, `update_conversation_on_message` igual, tabela nova vazia |
| Edge function `instagram-webhook` | **Deployada v6** (era v5). POST sem assinatura → 401, GET com token errado → 403 (conferidos) |
| Demais edge functions | Nenhuma redeployada: versões e hashes iguais aos de antes (`meta-webhook` v59, `whatsapp-send-message` v47, `instagram-send-message` v2...) |
| `meta-webhook`, `whatsapp-send-message`, `instagram-send-message`, `_shared` | Byte a byte iguais à `main` |
| Suíte nova `docs/teste_eco_instagram_nao_lidas.sql` | 54/54 antes de aplicar (migração + suíte numa transação desfeita) e 54/54 depois |
| Sabotagem da guarda do horário | **5 FAIL**, exatamente os casos em que a mensagem do cliente é posterior ao eco: E2a, E2b, E2c, E4k, E5j (viram `cleared` em vez de `later_inbound`) |
| Demais suítes SQL (20 + as 2 de bloco DO) | Iguais antes e depois. Falhas antigas, as mesmas nas duas rodadas: `teste_canal_contato` K0c/K0d/K0e e `teste_instagram_entrada` I0e (existe dado real de Instagram desde a fatia 2) e I7h (varredura da regra de tempo no WhatsApp) |
| Sabotagem de `teste_instagram_resposta` | Os mesmos 12 FAIL medidos na fatia 3: o casamento do eco do inbox não mudou |
| Tela | Não muda. Só o texto da ajuda de Conversas (na branch) |

Ainda sem tráfego real: nenhuma mensagem do Instagram passou pelo caminho
novo até agora (`instagram_message_meta_times` vazia). O teste real abaixo é o
primeiro.

## Como funciona

1. **O horário da Meta.** Cada item da entrega traz `messaging[].timestamp`
   (milissegundos desde 1970; é o que os exemplos da doc da Meta mostram, a
   doc não diz a unidade por extenso). O `instagram-webhook` lê o número
   (`parseMetaTimestamp` em `delivery.ts`), aceita só inteiro entre
   2020-01-01 e um dia à frente, e manda como `p_meta_ts`. Fora disso vai
   `null` (valor em segundos cai aqui: é recusado, não "consertado").
2. **Onde fica.** `instagram_message_meta_times(message_id, meta_ts)`, uma
   linha por mensagem do Instagram, entrada e eco. `meta_ts` é anulável.
   Tabela ao lado, como `instagram_echo_claims`: `messages` não ganhou coluna.
   No eco da resposta do inbox, a linha do navegador recebe o horário do eco.
3. **A guarda** (`instagram_echo_mark_read`), chamada em TODO eco: do
   celular, do inbox casado por mid, casado por texto, e nas reentregas. Zera
   `unread_count` só se:
   - o eco tem horário da Meta;
   - a conversa é do Instagram e tem não lidas;
   - a última mensagem chegada é nossa (`last_message_direction = 'outbound'`);
   - nenhuma mensagem do cliente tem horário da Meta **igual ou posterior** ao
     do eco;
   - nenhuma mensagem do cliente **sem** horário chegou depois de
     (horário do eco − 5 min).
   Zerar = o mesmo UPDATE que o navegador faz ao abrir a conversa
   (`unread_count = 0`, `updated_at = now()`).
4. **O que o log mostra.** Cada eco sai no log do `instagram-webhook` com
   `unread`: `cleared`, `later_inbound`, `nothing_unread`,
   `customer_spoke_last`, `no_meta_time`, e `horarioMeta: true/false`.

### Linhas sem horário da Meta

São todas as mensagens anteriores à migração, e as que o webhook antigo
gravou entre a migração e o redeploy. Regra: uma mensagem só chega ao banco
DEPOIS de acontecer na Meta, então se ela chegou mais de 5 min antes do
horário do eco, ela é anterior à resposta. Só nesse caso ela é zerada. Sem
essa prova, ela segura a conversa. Na prática:

- resposta nova pelo celular a uma pendência antiga: zera;
- mensagem sem horário que chegou perto da resposta ou depois: não zera;
- eco sem horário (webhook antigo, ou horário implausível): nunca zera.

## Desfazer

1. Volte o `instagram-webhook` para a versão da `main` anterior a esta
   (6 argumentos) e redeploye. **Primeiro**: a versão nova manda `p_meta_ts`,
   que a função de 6 argumentos não aceita.
2. Bloco ROLLBACK no fim da migração `20260925000004`.

Sem isso tudo, o eco volta a não mexer nas não lidas. Nada mais muda.

## O teste real

Não precisa de localhost: a tela não mudou, e o que muda roda no servidor.

1. No ConvoFlow (convoflow.com.br), entre como o **Gerente da Conta Teste
   Gerente**, escolha a **Loja Teste** no seletor do topo e **não abra
   Conversas** (a tela aberta na conversa zera sozinha e estraga o teste).
2. De uma conta pessoal do Instagram, mande uma DM de **texto** para
   **@convoflow**.
3. Espere uns 30 s. Se quiser conferir que chegou sem abrir a conversa, rode
   o SQL abaixo: a conversa tem 1 não lida.
4. No **app do Instagram no celular**, logado como @convoflow, responda essa
   DM com **texto** (foto, áudio ou figurinha não servem: não entram no
   ConvoFlow).
5. Agora abra **Conversas › Instagram**.

**O que você deve ver:** a conversa com a sua resposta como última mensagem,
sem autor, **sem o número de não lidas** e **fora da pílula "Aguardando"**. Na
chave, com o lado WhatsApp aberto, o número ao lado de "Instagram" não conta
essa conversa.

**Conferência no SQL Editor** (antes de abrir a conversa, se quiser provar que
não foi a abertura que zerou):

```sql
SELECT m.direction, left(m.content, 30) AS texto, t.meta_ts, m.created_at,
       c.unread_count, c.last_message_direction
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.instagram_message_meta_times t ON t.message_id = m.id
 WHERE m.channel = 'instagram'
 ORDER BY m.created_at DESC
 LIMIT 4;
```

Esperado nas duas linhas de cima (a sua resposta e a DM): `meta_ts`
preenchido, um pouco antes do `created_at`; `unread_count` 0 e
`last_message_direction` `outbound`.

**Se não zerou:**
- `meta_ts` vazio nas duas → o horário não chegou utilizável. Veja no log do
  `instagram-webhook` o campo `horarioMeta` e `withoutMetaTime`; se a Meta
  estiver mandando segundos em vez de milissegundos, é aqui que aparece.
- `meta_ts` preenchido e `unread_count` 1 → veja no log do eco o campo
  `unread`: `later_inbound` (há mensagem do cliente com horário igual ou
  posterior), `customer_spoke_last` (chegou mensagem do cliente depois da sua
  resposta) ou `no_meta_time`.
- Nenhuma linha nova → a entrega não chegou; é o mesmo diagnóstico de
  `docs/RUNBOOK_instagram_resposta.md`, nada desta mudança.

O caso que a guarda existe para proteger (o cliente escreve depois da
resposta, mas essa mensagem chega aqui antes do eco) não dá para provocar na
mão: a ordem de entrega é da Meta. Ele está coberto pela suíte (E2, E4k, E5j)
e é exatamente o que a sabotagem derruba.
