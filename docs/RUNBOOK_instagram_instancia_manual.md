# RUNBOOK — Instância de Instagram criada à mão (fatia 2/5)

Nesta fatia não existe tela para conectar o Instagram (vem na fatia 4). A
instância nasce por um comando no SQL Editor. Este documento é o passo a passo
e o que fazer quando algo não bate.

## Estado atual (2026-09-23)

| Peça | Estado |
|---|---|
| Migração `20260923000001_instagram_inbound` | **Aplicada** em produção (ledger ok) |
| Suíte `docs/teste_instagram_entrada.sql` | 61/61 verde; sabotagem derruba exatamente os 8 gates |
| Edge function `instagram-webhook` (receptor real) | **Falta deploy** — em produção ainda roda a sonda (v3), que não grava nada. Passo 0 abaixo |
| Secrets `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` | Já existiam (usados pela sonda) |
| Instância de teste (Conta Teste Gerente) | **Falta criar — passo 2 abaixo** |

Conta Teste Gerente = `baf2559e-1d38-4c5c-af7d-f6c268a9154e`.

> **Atualização 2026-09-25 (fatia 4a):** a conta do Instagram mora SÓ numa
> Loja, nunca na Conta. A instância de teste foi movida para a **Loja Teste**
> (`e6a88a32-5deb-4aa1-b246-05a512882388`) por
> `docs/mover_instagram_teste_para_loja.sql`, e `create_instagram_instance`
> passou a recusar Conta (migração `20260925000002`). Para criar outra, passe o
> id de uma Loja no primeiro argumento.

Conta do Instagram de teste (entry.id medido pela sonda) = `17841419262135883`.

> **Atualização 2026-09-25 (fatia 4b):** conectar pela tela existe — botão
> "Conectar Instagram" em Instâncias e APIs, nas Lojas liberadas pelo
> superadmin. Ver `docs/RUNBOOK_instagram_conectar.md`. Este procedimento manual
> continua valendo para quem não tem o botão.

## O que é uma instância de Instagram

Uma linha em `whatsapp_instances` (nome histórico da tabela) com:

- `provider = 'instagram'`, `status = 'connected'` (nunca `'open'`: as telas de
  campanha e de Nova Conversa só oferecem instâncias `open`, e por elas o envio
  iria pela Evolution);
- `instance_key = 'instagram_<id da conta>'`;
- `connection_config = { igAccountId, igUsername, tokenIssuedAt, tokenExpiresAt }`
  — `igAccountId` é o `entry[].id` da entrega, com **índice único** (a busca é
  por ele, e a mesma conta não pode estar em duas Contas);
- o token no **Vault**, pela mesma `set_instance_meta_token` do WhatsApp oficial
  (`instance_secrets`). Na tabela fica só a validade.

## Passo a passo

### 0. Deploy do receptor (PowerShell, na pasta do projeto, uma linha por vez)

```powershell
git checkout feat/instagram-fatia2-sonda-webhook
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
npx supabase functions deploy instagram-webhook --project-ref pqjkuwyshybxldzpfbbs --use-api
```

**Deu certo quando** termina com `Deployed Functions on project pqjkuwyshybxldzpfbbs: instagram-webhook`.
Deploya SÓ essa função; `meta-webhook` e as outras não são tocadas. Enquanto
não houver instância, toda entrega vira `unknown_account` no log e nada é gravado.

### 1. Gerar o token (painel da Meta)

1. Abra https://developers.facebook.com/apps/1445899737404624/ (o app de
   Instagram, não o app principal do WhatsApp).
2. Menu lateral: **Instagram** → **API setup with Instagram login**.
3. Na seção **Generate access tokens**, na linha da conta de teste, clique em
   **Generate token**, faça login com a conta do Instagram e copie o token.
4. Anote a hora em que gerou: o token vale **60 dias** a partir dela.

Na mesma página, na seção de **webhooks**, confira que nada mudou desde a sonda:
Callback URL `https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-webhook`
e o campo `messages` assinado. (A sonda recebeu entregas por esta configuração;
não precisa refazer.)

### 2. Criar a instância (SQL Editor)

Abra https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/sql/new, cole,
troque as duas linhas marcadas e clique em **Run**:

```sql
SELECT public.create_instagram_instance(
  'baf2559e-1d38-4c5c-af7d-f6c268a9154e',  -- Conta Teste Gerente
  'Instagram Teste',
  '17841419262135883',                     -- entry.id da conta de teste
  '@SEU_USUARIO',                          -- << troque (só para exibição)
  'COLE_O_TOKEN_AQUI',                     -- << troque
  now()                                    -- ou a hora em que gerou o token
);
```

**Deu certo quando** a saída é UMA linha parecida com
`{"instance_id": "…", "ig_account_id": "17841419262135883", "token_expires_at": "2026-11-22…"}`.

A função recusa (e não cria nada) se: a Conta não existe, o id não é só
dígitos, o token está vazio, ou já existe instância para essa conta.

Depois de rodar, **apague o texto do editor** e não salve como snippet: o token
ficaria no histórico do painel.

### 3. Mandar a mensagem de verdade

De **outra** conta do Instagram, mande uma DM para a conta de teste, por
exemplo `teste fatia 2`.

### 4. O que você deve ver

**No banco** (SQL Editor):

```sql
SELECT m.created_at, m.direction, m.status, m.content, m.channel,
       ct.channel AS canal_contato, ct.phone, ct.external_id,
       cv.unread_count, cv.channel AS canal_conversa
  FROM public.messages m
  JOIN public.contacts ct      ON ct.id = m.contact_id
  JOIN public.conversations cv ON cv.id = m.conversation_id
 WHERE m.channel = 'instagram'
 ORDER BY m.created_at DESC
 LIMIT 5;
```

Uma linha: `direction = inbound`, `status = received`, `content = teste fatia 2`,
os três canais `instagram`, `phone` vazio, `external_id` = o id do remetente,
`unread_count = 1`.

**No produto** (entrando como alguém da Conta Teste Gerente):

- **Conversas**: uma conversa nova no topo, com 1 não lida, aparecendo como
  **"Contato sem nome"** e sem número. É esperado: a fatia 4 é que mostra o @.
- **Instâncias e APIs**: a instância "Instagram Teste" com a etiqueta rosa
  **Instagram**. O ícone de status aparece vermelho (a tela só conhece
  `open`/`connecting`); é esperado e não afeta nada.
- **Não** responda pela caixa de entrada do ConvoFlow: o envio de Instagram é a
  fatia 3. Se tentar, aparece o aviso *"Este contato não tem número de WhatsApp
  para receber a mensagem."* e nada é enviado.

**Eco**: responda pelo **app do Instagram no celular**. Em segundos aparece uma
segunda linha `direction = outbound`, `status = sent`, na mesma conversa; a
contagem de não lidas **não** sobe e a prévia da conversa passa a ser a sua
resposta.

**O que NÃO deve acontecer**: bot respondendo, automação disparando, a conversa
ganhando responsável sozinha, webhook de saída, notificação de regra de tempo.

**Nos logs** (https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/functions/instagram-webhook/logs):
`instagram-webhook: entrega` com `inbound: 1` e, logo depois,
`instagram-webhook: mensagem` com `outcome: stored`.

### Se não aparecer nada — diagnóstico pelo log

| O que o log mostra | Causa | O que fazer |
|---|---|---|
| Nenhuma linha | A Meta não entregou | Conferir a inscrição do webhook (passo 1) |
| `assinatura invalida` (401) | `INSTAGRAM_APP_SECRET` diferente do segredo do app 1445899737404624 | Recolar o secret |
| `mensagem nao gravada` com `outcome: unknown_account` | O `account` do log ≠ `igAccountId` gravado | Comparar os dois; recriar a instância com o id do log |
| `outcome: inactive_instance` | `is_active = false` | Ver "Desligar" abaixo |
| `evento fora do escopo` com `kind: attachment` (ou outro) | Foi foto/áudio/reação/story | Mandar **texto**. Fora do escopo da fatia 2 |
| `process_instagram_message falhou` (500) | Erro de banco | A Meta reentrega sozinha (é idempotente); mandar o log |

## Desligar (sem apagar nada)

```sql
UPDATE public.whatsapp_instances SET is_active = false
 WHERE provider = 'instagram' AND connection_config->>'igAccountId' = '17841419262135883';
```

A partir daí toda entrega dessa conta vira `inactive_instance`: nada é gravado,
e a Meta recebe 200. Religar é o mesmo comando com `true`.

## O dia 61 — o token expira

> **Atualização 2026-09-24 (fatia 4):** a renovação automática existe — cron
> diário, avisos no sino e a validade no cartão de Instâncias e APIs. Passo a
> passo, estado e diagnóstico em `docs/RUNBOOK_instagram_renovacao.md`. O texto
> abaixo é de quando ela não existia; a troca manual continua valendo para
> reconectar.

**O que o token faz hoje: nada.** Receber não usa o token: a entrega chega
assinada com o segredo do app, e a instância é achada pelo `entry.id`. O token
só está guardado para a fatia 3.

**O que quebra quando ele vencer:**

1. **Enviar** (fatia 3): toda chamada à Graph API com o token vencido volta com
   erro `190` (OAuthException, sessão expirada). A mensagem do atendente não sai.
2. **Buscar nome/@ do cliente**, se alguma fatia fizer isso com o token: mesmo erro.
3. **Renovar deixa de ser possível.** A Meta só renova token com pelo menos
   24 h de vida **que ainda não venceu**
   (`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`,
   que devolve um token novo de mais 60 dias). Vencido, só gerando outro no
   painel (passo 1) ou, na fatia 4, reconectando pelo login do Instagram.
4. **Receber: não verificado.** A documentação não diz se a entrega de webhook
   para quando o token da conta vence. A inscrição é do app, então a expectativa
   é que continue, mas isso não foi medido. A data está em
   `connection_config->>'tokenExpiresAt'`; se não houver renovação até lá, vale
   observar os logs nesse dia.

**Como seria o conserto (não construído nesta fatia):** um cron diário chama uma
edge function que, para cada instância `provider = 'instagram'` com
`tokenExpiresAt` a menos de ~10 dias, lê o token do Vault, chama
`refresh_access_token`, grava o novo com `set_instance_meta_token` e atualiza
`tokenIssuedAt`/`tokenExpiresAt`. Se falhar, notifica o gerente da Conta com
antecedência, porque depois de vencido não tem volta automática.

**Trocar o token à mão enquanto isso não existe:**

```sql
SELECT public.set_instance_meta_token(id, 'NOVO_TOKEN')
  FROM public.whatsapp_instances
 WHERE provider = 'instagram' AND connection_config->>'igAccountId' = '17841419262135883';

UPDATE public.whatsapp_instances
   SET connection_config = connection_config
         || jsonb_build_object('tokenIssuedAt', now(), 'tokenExpiresAt', now() + interval '60 days')
 WHERE provider = 'instagram' AND connection_config->>'igAccountId' = '17841419262135883';
```
