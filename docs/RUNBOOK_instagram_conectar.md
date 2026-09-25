# RUNBOOK — Conectar o Instagram pela tela (fatia 4b)

Conectar, reconectar, desligar e religar uma conta do Instagram pela tela
Instâncias e APIs, pelo login do próprio Instagram (Business Login). Até aqui a
conta nascia por `create_instagram_instance`, no SQL Editor.

## Estado atual (2026-09-25)

| Peça | Estado |
|---|---|
| Migração `20260925000003_instagram_connect` | **Aplicada** em produção (ledger ok). Guarda interna: nenhuma linha de `whatsapp_instances` mudou, 6 policies de sempre, permissões conferidas. Os 13 corpos de função no banco = arquivo (md5 do `prosrc`) |
| Chave da Loja Teste (`e6a88a32…`) | **Ligada** pela própria migração. É a única. EncaixaRH: desligada (conferido como a Camila e como a atendente: `instagram_connect_enabled` = false) |
| Suíte `docs/teste_conexao_instagram.sql` | 140/140 verde em produção (BEGIN/ROLLBACK). Sabotagem do state = 8 FAIL (abaixo) |
| Edge function `instagram-connect` | Ver passo 3 |
| Secret `INSTAGRAM_APP_ID` | **Falta — passo 2** (o `INSTAGRAM_APP_SECRET` já existe: é o que assina o webhook) |
| Endereço de retorno no painel da Meta | **Falta — passo 1** |
| Tela, ajuda, tutorial | Na branch `feat/instagram-fatia4b-conectar`, PR por abrir. Não mergeada |
| `meta-webhook`, `instagram-webhook`, `instagram-send-message`, WhatsApp | Intocados (sem diff contra a `main`) e não redeployados |

## Como funciona, em uma tela

1. Gestor ou Gerente clica em **Conectar Instagram** (ou **Reconectar** no cartão).
   A tela chama `instagram-connect` (`start`), que roda `instagram_connect_begin`
   **como o usuário**: confere cargo, alcance (gerente na Loja filha), que é
   Loja e que a chave da Loja está ligada. Cria o *state*: 256 bits aleatórios,
   preso ao usuário, à Loja e (na reconexão) ao cartão; vale 10 min; uso único;
   guardado como sha256.
2. O navegador vai ao Instagram (`force_reauth=true`: pede a senha mesmo com
   alguém logado, para a pessoa escolher a conta).
3. O Instagram devolve o navegador **à própria edge function** (o único
   endereço cadastrado na Meta). Ela pergunta ao banco para onde devolver
   (`instagram_connect_bounce`: o endereço gravado no passo 1, nunca um vindo
   da URL) e manda o navegador para Instâncias e APIs com `?ig_state&ig_code`.
4. A tela chama `instagram-connect` (`complete`) com a sessão de quem está
   logado. Nesta ordem:
   - `instagram_connect_claim` — o state existe, é **deste** usuário, não
     venceu, não foi usado. Queima o state antes de falar com a Meta.
   - Meta: código → acesso curto → acesso longo (60 dias) → `/me`
     (`user_id` = o id da conta, o mesmo das entregas do webhook).
   - `instagram_connect_check` — conta já em outra Conta/Loja → recusa sem
     dizer de quem; outra conta no cartão → recusa.
   - `POST /me/subscribed_apps?subscribed_fields=messages` — só se aceita.
   - `instagram_connect_commit` — repete a decisão sob lock e grava linha +
     acesso no cofre numa transação. Reconexão = **mesma linha** (mesmo id,
     mesmo histórico), `renewal` apagado, acesso novo no cofre. A validade
     gravada é a que a Meta devolve no `expires_in`, que pode ser a mesma data
     de antes (ver 5a).
5. **Desligar/Religar** no cartão: `set_instagram_account_active`
   (`is_active`). Não depende da chave da Loja.

`claim`, `check`, `commit` e `bounce` são **só do servidor** (service_role): o
app não consegue gravar uma conta sem a Meta ter provado que ela é do usuário.

## Passo 1 — cadastrar o endereço de retorno na Meta

1. Abra https://developers.facebook.com/apps/1445899737404624/ (o app de
   Instagram — o mesmo do webhook do Instagram, não o app do WhatsApp).
2. Menu lateral: **Instagram** → **Configuração da API com login do Instagram**
   (em inglês: *API setup with Instagram login*).
3. Na etapa **Configurar o login da empresa no Instagram** (*Set up Instagram
   business login*), clique em **Configurações do login da empresa**
   (*Business login settings*).
4. No campo **URIs de redirecionamento do OAuth** (*OAuth redirect URIs*),
   cole exatamente, sem barra no fim:

   ```
   https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-connect
   ```

5. Clique em **Salvar**.

Os rótulos dos passos 2 a 4 não aparecem na documentação oficial da Meta que
consegui ler (só em guias de terceiros); se a tela estiver diferente, o que
importa é achar a lista de URIs de redirecionamento do OAuth do login do
Instagram e colar o endereço acima.

**localhost:** a documentação da Meta não diz se aceita `http://localhost`
como endereço de retorno do login do Instagram. Não precisa: o endereço
cadastrado é o HTTPS da edge function, igual para produção e para teste. O
localhost só aparece no último salto (edge function → tela), que a Meta nunca
vê.

## Passo 2 — o secret `INSTAGRAM_APP_ID`

Na mesma página do passo 1, no topo, está o **ID do app do Instagram**
(*Instagram app ID*). Ele NÃO é necessariamente o número da URL do app
(1445899737404624) — copie o que está escrito como ID do app do Instagram.

Painel do Supabase → https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/functions/secrets
→ **Add new secret** → Name `INSTAGRAM_APP_ID`, Value = o número copiado →
**Save**.

Confira, na mesma página da Meta, que o **Chave secreta do app do Instagram**
(*Instagram app secret*) é o que já está em `INSTAGRAM_APP_SECRET` — deve ser,
porque é ele que valida a assinatura do webhook, que já funciona.

Sem `INSTAGRAM_APP_ID`, a função responde 503 "A conexão do Instagram ainda não
foi configurada no servidor" e nada acontece.

## Passo 3 — deploy da função (PowerShell, na pasta do projeto, uma linha por vez)

```powershell
git fetch origin
git checkout feat/instagram-fatia4b-conectar
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
npx supabase functions deploy instagram-connect --project-ref pqjkuwyshybxldzpfbbs --use-api --no-verify-jwt
```

`--no-verify-jwt` é obrigatório: o Instagram volta para a função sem cabeçalho.
Os dois POST conferem a sessão dentro da função.

**Deu certo quando** abrir no navegador
https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-connect
mostra a página "Não foi possível voltar ao ConvoFlow" (400). `404` = o deploy
não subiu.

## Passo 4 — a chave da Loja Teste

Já está ligada (a migração ligou). Para ver ou mudar, e para ligar outra Loja:
entre como superadmin → **Administração** → aba **Configurações** → cartão
**Conectar Instagram por Loja** → chave ao lado da Loja.

Enquanto o app não tiver o acesso avançado da Meta, só contas do Instagram com
papel no app conseguem entrar. **É a chave que mantém o botão invisível para os
clientes**: não ligue em Loja de cliente antes disso.

## Passo 5 — teste real, antes do merge (localhost)

As prévias da Vercel não passam pelo CORS; use `npm run dev` numa porta livre
(a 8080 costuma estar ocupada):

```powershell
npm run dev -- --port 8081
```

Entre em http://localhost:8081 como **gerente.teste@re9.online**, escolha a
**Loja Teste** no seletor, abra **Instâncias e APIs**.

**5a. Reconectar a conta de teste (@convoflow).** No cartão, clique em
**Reconectar**, entre no Instagram com a @convoflow e autorize.
Esperado: volta para a tela com "Instagram reconectado: @convoflow foi
reconectada no mesmo cartão; o histórico continua. Válida até …". A data é a
que a Meta devolve, e **não precisa ser 60 dias depois de agora**: se o acesso
anterior ainda valia, ela pode ser a mesma que o cartão já mostrava. Foi o que
aconteceu no primeiro teste real, em 25/09/2026 às 19:21 UTC: a Meta devolveu
um `expires_in` que termina em 24/11 10:43:30 UTC, um segundo depois do acesso
renovado de manhã. Um prazo novo de cerca de 60 dias só vem quando o acesso
anterior já não valia (vencido ou recusado pelo Instagram; esse caso ainda não
foi medido). No banco:

```sql
SELECT id, is_active, profile_name,
       connection_config->>'tokenIssuedAt'  AS emitido,
       connection_config->>'tokenExpiresAt' AS vale_ate,
       connection_config->>'onboarding'     AS onboarding,
       connection_config->'renewal'         AS renovacao
  FROM public.whatsapp_instances
 WHERE id = '0c4029bb-e0b6-4307-849b-d947ec4e4164';
```

Esperado: mesmo id, `emitido` = agora, `vale_ate` = a data que apareceu na
tela (a que a Meta devolveu), `onboarding = instagram_login`, `renovacao` =
null. No log da função, a linha `instagram-connect: conectada` traz
`mode: reconnect` e `expiryFromMeta: true` (a Meta informou a validade; com
`false`, o ConvoFlow teria usado 60 dias a partir de agora).

**5b. Outra conta no cartão (se houver outra conta com papel no app).**
Reconectar, entrar com a outra conta. Esperado: "Você entrou no Instagram com
outra conta. Este cartão é da conta @convoflow…" e nada muda.

**5c. Desligar / religar.** **Desligar** → a confirmação diz que as mensagens
do período se perdem → confirmar. Mande uma DM para a @convoflow de outra
conta: nada aparece em Conversas (log do instagram-webhook: `inactive_instance`).
**Religar** → mande outra DM: aparece.

**5d. Mensagem ainda chega.** Com a conta religada, uma DM nova entra em
Conversas → lado Instagram. Prova que a inscrição do webhook continua.

## Diagnóstico

| O que aparece | Causa | O que fazer |
|---|---|---|
| "A conexão do Instagram ainda não foi configurada no servidor" | Falta `INSTAGRAM_APP_ID` | Passo 2 |
| Página do Instagram diz que o endereço de redirecionamento é inválido | Passo 1 não feito ou com diferença (barra no fim, http) | Passo 1, exatamente como está |
| Instagram mostra erro de permissão / app não disponível | A conta não tem papel no app (sem acesso avançado) | Adicionar a conta como testadora do Instagram no app |
| "O Instagram não aceitou o pedido de conexão" | Código usado ou vencido, ou `INSTAGRAM_APP_SECRET` errado | Tentar de novo; se repetir, conferir o secret |
| "O Instagram não aceitou ligar o recebimento de mensagens" | `subscribed_apps` recusado (conta não profissional, permissão negada) | Conta profissional; autorizar mensagens |
| "Este link de conexão do Instagram não vale mais" | Mais de 10 min, ou F5 na volta | Clicar de novo no botão |
| "Abra o ConvoFlow pelo endereço oficial" | Origem fora da lista (ex.: prévia da Vercel) | Usar www.convoflow.com.br ou localhost |

Log: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/functions/instagram-connect/logs
(`conexão não concluída` traz `step`, `reason`, `metaStep`, `metaCode`; código,
state e acessos nunca vão para o log).

## A sabotagem (a suíte sabe falhar)

Bloco SABOTAGEM da suíte: o claim passa a ignorar o VALOR do state e aceita o
primeiro state pendente do usuário. Medido em 2026-09-25 — exatamente 8 FAIL:

| Afirmação | Esperado | Com sabotagem |
|---|---|---|
| S1 state inventado / reason | invalid_state | (aceito) |
| S1 state inventado / ok | false | **true** |
| S2 dono ainda usa depois | ok | recusado (o inventado queimou o dele) |
| S2 claim devolve a Loja | a Loja | null |
| S3 reuso | used_state | invalid_state |
| S11 check aceita conta nova | connect | null |
| S4 state vencido | expired_state | invalid_state |
| S4 vencido queima | used_state | invalid_state |

As outras 132 seguem verdes. Depois do ROLLBACK a função em produção seguiu
intacta (md5 do corpo = arquivo, sem a marca `[sabotado]`). Do lado da edge
function, a mesma sabotagem em `runCallback` (seguir mesmo com o claim
recusado) derruba exatamente o teste "state inventado / de outro usuário /
vencido: para no claim" em `src/lib/instagram/instagramConnect.test.ts`.

## Desfazer

1. Cartão da Loja em Administração → desligar (o botão some; contas ficam).
2. Apagar a função no painel (Edge Functions → instagram-connect → Delete).
3. Bloco ROLLBACK no fim da migração `20260925000003` (recriar antes a
   `instagram_connection_alert_sweep` da `20260924000001`).
