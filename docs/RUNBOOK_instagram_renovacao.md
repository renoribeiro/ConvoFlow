# RUNBOOK — Renovação automática da conexão do Instagram (fatia 4/5, 1ª entrega)

O acesso de uma conta de Instagram vale 60 dias. Sem renovação, a conta de
teste para de responder em **22/11/2026 às 21:16 (Brasília)** (= 23/11 00:16
UTC). Esta entrega renova sozinha, todo dia, e avisa o Gerente e o Gestor
quando algo dá errado. Este documento é o que falta fazer, na ordem, e o que
olhar em cada passo.

## Estado atual (2026-09-24)

| Peça | Estado |
|---|---|
| Migração `20260924000001_instagram_token_renewal` | **Aplicada** em produção (ledger ok). Guarda interna conferiu: EncaixaRH, todas as linhas de `whatsapp_instances`, triggers e funções de mensagem iguais antes e depois. Corpos das 6 funções no banco = arquivo (md5) |
| Suíte `docs/teste_renovacao_instagram.sql` | 60/60 verde em produção (BEGIN/ROLLBACK). Sabotagem da regra "uma vez por marco" derruba exatamente 6 afirmações (abaixo) |
| Segredo do cron no Vault | **Falta — passo 1** |
| Edge function `instagram-token-renewal` | **Falta deploy — passo 2** |
| Cron diário | **Falta — passo 3** (`docs/agendar_renovacao_instagram_cron.sql`, testado em transação desfeita) |
| Teste real | **Passo 4**, a partir de 25/09 00:16 UTC (24/09 21:16 Brasília) |
| Tela (cartão do Instagram em Instâncias e APIs) e ajuda | Na branch `feat/instagram-fatia4-renovacao-token`, prévia da Vercel. Não mergeada |
| `meta-webhook`, `instagram-webhook`, `instagram-send-message`, WhatsApp | Intocados (byte a byte iguais à `main`) e não redeployados |

Instância de teste = `0c4029bb-e0b6-4307-849b-d947ec4e4164` (Loja Teste desde 2026-09-25; antes, Conta Teste Gerente).

## Como funciona, em uma tela

- **Todo dia às 06:20 (Brasília)** o pg_cron chama `public.instagram_token_renewal_kick()`,
  que chama a edge function com o segredo no cabeçalho `x-cron-secret`.
- A função olha cada instância de Instagram. **Renova** se: está ativa, o
  acesso tem pelo menos 24 h, ainda não venceu, faltam **30 dias ou menos**, e
  o Instagram não recusou este acesso antes.
- **Deu certo**: o acesso novo vai para o cofre (Vault) **no mesmo lugar**;
  `tokenIssuedAt` = agora; `tokenExpiresAt` = agora + o prazo que o
  Instagram informou (`expires_in`). Nunca supõe 60 dias.
- **Falhou por rede, limite de chamadas, instabilidade ou erro desconhecido**:
  grava `renewal.status = retrying`, o motivo e a data; tenta de novo amanhã.
- **Falhou porque o Instagram não aceita mais o acesso** (código 190/102,
  401 de autenticação, permissão retirada, ou acesso sumido do cofre): grava
  `renewal.status = needs_reconnect` e **para de tentar** até o acesso ser
  trocado (reconexão ou a troca manual abaixo — qualquer uma muda o
  `tokenIssuedAt`, e o estado antigo deixa de valer sozinho).
- **Avisos no sino** (Gerente e Gestor da Conta/Loja; numa Loja, também o
  Gerente da Conta), **uma vez cada**: 7 dias antes de vencer, no vencimento, e
  quando precisa reconectar. A tabela `instagram_connection_alerts` é quem
  garante o "uma vez": a chave dela é (instância, marco, validade).

Tudo fica em `whatsapp_instances.connection_config` da instância:
`tokenIssuedAt`, `tokenExpiresAt` e `renewal` (`status`, `reason`, `message`,
`metaCode`, `lastAttemptAt`, `lastSuccessAt`, `lastErrorAt`,
`forTokenIssuedAt`). O acesso em si fica só no cofre.

## Passo 1 — criar o segredo do cron (SQL Editor)

Abra https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/sql/new, cole
e clique em **Run**:

```sql
SELECT vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'instagram_token_renewal_cron_secret', 'Segredo do cron da renovação do Instagram');
```

O próprio banco sorteia o valor (64 caracteres). **Ninguém vê e ninguém copia**:
a função e o cron leem do cofre.

**Deu certo quando** a saída é UMA linha com um id (um uuid). Para conferir
sem mostrar o valor:

```sql
SELECT name, created_at FROM vault.secrets WHERE name = 'instagram_token_renewal_cron_secret';
```

Uma linha. Se der erro de "duplicate key", o segredo já existe: siga em frente.

## Passo 2 — deploy da função (PowerShell, na pasta do projeto, uma linha por vez)

```powershell
git fetch origin
git checkout feat/instagram-fatia4-renovacao-token
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
npx supabase functions deploy instagram-token-renewal --project-ref pqjkuwyshybxldzpfbbs --use-api --no-verify-jwt
```

**Deu certo quando** termina com
`Deployed Functions on project pqjkuwyshybxldzpfbbs: instagram-token-renewal`.
Sobe SÓ essa função.

Prova de que ela está no ar e recusa quem não tem o segredo:

```powershell
Invoke-WebRequest -Method POST -Uri https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-token-renewal -UseBasicParsing
```

**O esperado é um ERRO vermelho** com `(401) Não Autorizado`. É o certo: sem o
segredo, nada roda. `(404)` = o deploy não subiu.

## Passo 3 — ligar o cron (SQL Editor)

Abra o SQL Editor, cole o conteúdo inteiro de
`docs/agendar_renovacao_instagram_cron.sql` e clique em **Run**.

**Deu certo quando** a última consulta devolve UMA linha:
`instagram-token-renewal-daily | 20 9 * * * | SELECT public.instagram_token_renewal_kick() | true`.

Se aparecer `ABORTADO: o segredo instagram_token_renewal_cron_secret não está no Vault`,
o passo 1 não foi feito; nada foi agendado.

Até faltarem 30 dias o cron roda todo dia e **pula** a conta de teste
(`not_due`). É o normal. A primeira renovação automática dela acontece por
volta de 24/10 — ou de 25/10, se você fizer o passo 4 em 25/09, porque a
renovação manual já empurra a validade para ~24/11.

## Passo 4 — rodar à mão uma vez (a partir de 24/09 21:16 Brasília)

Antes disso o acesso de teste tem menos de 24 h e a Meta recusaria; a função
nem chama a Meta e responde `too_young`.

**4a. Ensaio (não muda nada).** No SQL Editor:

```sql
SELECT public.instagram_token_renewal_kick('0c4029bb-e0b6-4307-849b-d947ec4e4164', true, true);
```

Devolve um número (o pedido). Espere uns 10 segundos e rode, trocando o número:

```sql
SELECT status_code, content::jsonb FROM net._http_response WHERE id = 123;
```

**Esperado:** `200` e, em `results`, `"outcome": "would_renew"`.

**4b. De verdade.** O segundo `false` desliga o ensaio; o último `true` manda
renovar mesmo faltando mais de 30 dias:

```sql
SELECT public.instagram_token_renewal_kick('0c4029bb-e0b6-4307-849b-d947ec4e4164', false, true);
```

Espere 10 segundos e leia a resposta como no 4a. **Esperado:** `200`,
`"outcome": "renewed"`, `"expiryFromMeta": true` e `validUntil` cerca de 60
dias depois de agora. Confira a instância:

```sql
SELECT connection_config->>'tokenIssuedAt'  AS emitido,
       connection_config->>'tokenExpiresAt' AS vale_ate,
       connection_config->'renewal'         AS renovacao
  FROM public.whatsapp_instances
 WHERE id = '0c4029bb-e0b6-4307-849b-d947ec4e4164';
```

**Esperado:** `emitido` = agora, `vale_ate` ≈ agora + 60 dias,
`renovacao.status = "ok"`.

**4c. Na tela.** Em Instâncias e APIs (prévia da branch), o cartão do Instagram
mostra "Válida até" com a data nova e "Renova sozinha antes de vencer".
Opcional: responda uma conversa do Instagram com a janela aberta — prova que o
acesso novo funciona.

### Se não deu certo — diagnóstico pela resposta

| O que aparece | Causa | O que fazer |
|---|---|---|
| `kick` dá erro "O segredo … não está no Vault" | Passo 1 não feito | Passo 1 |
| `status_code` 401 | Segredo do cofre ≠ o que a função leu (improvável: é o mesmo lugar) | Mande a resposta |
| `status_code` 503 `Not configured` | A função não achou o segredo no cofre | Passo 1; confira o nome exato |
| `status_code` 404 / `null` | Função não está no ar | Passo 2 |
| `skipped` / `too_young` | Menos de 24 h desde a emissão | Espere dar 24/09 21:16 (Brasília) |
| `skipped` / `not_due` | Faltou o `true` final (ignoreWindow) | Rode o 4b como está |
| `skipped` / `needs_reconnect` | O Instagram já recusou este acesso antes | Troca manual abaixo |
| `needs_reconnect` com `reason: token_invalid` | O Instagram não aceita o acesso atual | Troca manual abaixo |
| `retry_tomorrow` | Rede / limite / instabilidade | Nada; o cron tenta amanhã. Mande o `reason` se repetir |
| `store_failed` | A Meta renovou mas o banco não gravou | **Mande o log na hora** (Edge Functions → instagram-token-renewal → Logs) |

## Trocar o acesso à mão (enquanto não existe botão de conectar)

> **Atualização 2026-09-25 (fatia 4b):** na Loja com a chave "Conectar
> Instagram" ligada (Administração › Configurações), reconectar é o botão
> **Reconectar** no cartão — ver `docs/RUNBOOK_instagram_conectar.md`. Os avisos
> do sino dessas Lojas já mandam usar o botão. A troca à mão abaixo continua
> valendo para as outras.

Quando a conta precisar ser reconectada: gere um acesso novo no painel da Meta
(passo 1 de `docs/RUNBOOK_instagram_instancia_manual.md`) e rode:

```sql
SELECT public.set_instance_meta_token(id, 'NOVO_TOKEN')
  FROM public.whatsapp_instances
 WHERE provider = 'instagram' AND connection_config->>'igAccountId' = '17841419262135883';

UPDATE public.whatsapp_instances
   SET connection_config = connection_config
         || jsonb_build_object('tokenIssuedAt', now(), 'tokenExpiresAt', now() + interval '60 days')
 WHERE provider = 'instagram' AND connection_config->>'igAccountId' = '17841419262135883';
```

O `tokenIssuedAt` novo faz o "precisa reconectar" antigo deixar de valer
sozinho: a renovação volta a funcionar e o cartão volta ao normal. Apague o
texto do editor depois (o acesso ficaria no histórico).

## A sabotagem (a suíte sabe falhar)

Descomentando o bloco SABOTAGEM da suíte (troca
`CONTINUE WHEN v_n = 0; -- [uma-vez-por-marco]` por `CONTINUE WHEN false;`
dentro da transação), medido em 2026-09-24 — exatamente 6 FAIL:

| Afirmação | Esperado | Com sabotagem |
|---|---|---|
| S6d mesma data de novo (2x) | 1 aviso cada | 3 |
| S6e dias seguintes | 1 | 5 |
| S7a token trocado: nenhum aviso de reconexão novo | 1 | 5 |
| S8d 7 dias, não repete | 1 | 3 |
| S9b vencimento não repete | 1 | 3 |
| S10a um aviso de 7 dias por token | 2 | 5 |

As outras 54 seguem verdes: as marcas continuam únicas (é a chave da tabela);
o que a sabotagem quebra é só "notificar só quem marcou primeiro". Depois do
ROLLBACK a função em produção seguiu intacta (md5 `66a79e0d…`).

## O que esta entrega NÃO faz

Conectar ou reconectar pela tela (fatia 4b), e-mail, aviso em tempo real no
sino (ele atualiza ao voltar para a aba). Não mede se o **recebimento** para
quando o acesso vence (a dúvida registrada no runbook da fatia 2 continua).

## Crons antigos com a mesma fraqueza (não mexidos aqui)

Aceitam a chave anon, que é pública, como única autorização — qualquer pessoa
com ela pode disparar:

- `process-campaign-dispatch`, `process-followup-dispatch`,
  `process-report-dispatch`, `webhook-dispatcher`, `policy-watch`
  (`verify_jwt = false`, e o código não confere quem chamou);
- `job-worker` (`verify_jwt = true`, mas a chave anon é um JWT válido).

## Desfazer

1. `SELECT cron.unschedule('instagram-token-renewal-daily');`
2. Apagar a função no painel (Edge Functions → instagram-token-renewal → Delete).
3. Bloco ROLLBACK no fim da migração `20260924000001`.

Acessos já renovados continuam valendo: desfazer só para de renovar.
