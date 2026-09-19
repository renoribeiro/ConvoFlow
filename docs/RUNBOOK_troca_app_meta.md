# RUNBOOK — Troca do app da Meta (ConvoFlow → app novo)

**Escrito para:** quem for executar a troca, às 3 da manhã, sem poder perguntar
nada a ninguém. Cada passo diz onde clicar, o que digitar, como é o resultado
certo e o que fazer se não for. Leia a seção "Cola" antes de começar e deixe
esta página aberta.

**O que muda ao final:** o número da EncaixaRH (e qualquer número conectado
pelo botão "Conectar com a Meta" daqui para a frente) passa a falar com a Meta
pelo **app novo** `855618774210988`, e o **app antigo** `959529690042279` para
de receber webhooks. Nenhuma conversa, mensagem, contato, chatbot ou sessão
muda de lugar: a reconexão atualiza a instância **no lugar** (fatia 2, PR #65).

**Estado em 2026-09-19 (data deste runbook):**
- fatia 1 (excluir recusa histórico) — no ar, PR #64;
- fatia 2 (reconexão no lugar) — no ar, PR #65; migração `20260919000002`
  aplicada; `meta-oauth-exchange` deployada;
- fatia 3 (esta) — `meta-webhook` **ganhou** o log `app: primary|secondary`
  em cada entrega e a guarda contra resposta em dobro; **precisa ser
  deployada antes da noite** (passo P6);
- secrets: `META_APP_ID` = app antigo (conferido pelo digest);
  `META_APP_SECRET_SECONDARY` e `META_GLOBAL_VERIFY_TOKEN_SECONDARY` **existem
  e não estão vazios** (digests diferentes do sha256 de string vazia) — o
  passo P8 confere se o valor é o do app novo ou um placeholder.

---

## Cola — tudo que você vai copiar

| O quê | Valor |
|---|---|
| App **antigo** (Meta for Developers, nome "ConvoFlow") | `959529690042279` |
| App **novo** | `855618774210988` |
| WABA da EncaixaRH | `979901055032057` |
| Phone Number ID da EncaixaRH | `1135808682957799` |
| `whatsapp_instances.id` da EncaixaRH | `b6d80cd7-d508-46be-a5b6-8f09b9fdf329` |
| WABA de teste (Conta Teste Gerente) | `2542773286191227` |
| Phone Number ID de teste (`Teste_APP_META`) | `1291744174026561` |
| `whatsapp_instances.id` de `Teste_APP_META` | `32764f27-197a-4753-90ed-44e81618dc89` |
| Projeto Supabase | `pqjkuwyshybxldzpfbbs` |
| URL do webhook (callback) | `https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/meta-webhook` |
| Vercel: time / projeto / domínio de produção | `renoribeiro` (team `team_bLpLAV7kDJEMAn0FJIehtmAi`) / `convoflow` / `www.convoflow.com.br` |
| Versão da Graph API usada pelo código | `v20.0` |

**Links diretos**
- Secrets do Supabase: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/settings/functions
- SQL Editor: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/sql/new
- Logs da `meta-webhook`: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/functions/meta-webhook/logs
- Logs da `meta-oauth-exchange`: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/functions/meta-oauth-exchange/logs
- Variáveis do Vercel: https://vercel.com/renoribeiro/convoflow/settings/environment-variables
- Deployments do Vercel: https://vercel.com/renoribeiro/convoflow/deployments
- App antigo: https://developers.facebook.com/apps/959529690042279/
- App novo: https://developers.facebook.com/apps/855618774210988/

### Os seis nomes de segredo — e quem é quem

Dois deles são **o mesmo valor com nomes diferentes**. Não se confunda.

| Onde | Nome | O que é | Quem usa |
|---|---|---|---|
| Supabase | `META_APP_ID` | **App ID** do app (público) | `meta-oauth-exchange` (troca do código por token) |
| Vercel | `VITE_FACEBOOK_APP_ID` | **o mesmo App ID** | o botão "Conectar com a Meta" (SDK do Facebook no navegador) |
| Supabase | `META_APP_SECRET` | App Secret do app **primário** | `meta-oauth-exchange` E `meta-webhook` (assinatura) |
| Supabase | `META_GLOBAL_VERIFY_TOKEN` | Verify token do app **primário** | `meta-webhook` (handshake GET) |
| Supabase | `META_APP_SECRET_SECONDARY` | App Secret do app **secundário** | só `meta-webhook` |
| Supabase | `META_GLOBAL_VERIFY_TOKEN_SECONDARY` | Verify token do app **secundário** | só `meta-webhook` |
| Vercel | `VITE_META_CONFIG_ID` | ID da **configuração do Embedded Signup** (é criada dentro do app; a do app antigo não serve para o novo) | o botão "Conectar com a Meta" |

Regras que o código impõe (leia duas vezes):
- O webhook aceita entrega assinada pelo primário **ou** pelo secundário; sem
  nenhum dos dois casar, responde 401 e a Meta reenvia por até 36 h.
- A troca do código por token (reconexão) usa **só** o primário
  (`META_APP_ID` + `META_APP_SECRET`). Por isso, na hora da reconexão, o
  primário TEM de ser o app novo.
- Supabase **não mostra** o valor de um secret depois de salvo. O que você
  sobrescrever sem anotar, perdeu (o App Secret dá para reler no painel da
  Meta; o verify token, só se você anotou).
- Mudar secret no Supabase **não exige deploy**; mudar `VITE_*` no Vercel
  **exige um Redeploy** (é embutido no build).

### Como ler os logs (você vai fazer isso várias vezes)

Abra os logs da `meta-webhook` (link acima). Na caixa de busca, digite
`Meta webhook delivery`. Cada entrega aceita gera uma linha assim:

```
Meta webhook delivery  {"app":"primary","wabaIds":["979901055032057"],"phoneNumberIds":["1135808682957799"],"messages":1,"statuses":0,"otherFields":[]}
```

- `app: primary` = assinada pelo `META_APP_SECRET`; `app: secondary` = pelo
  `META_APP_SECRET_SECONDARY`.
- `wabaIds` diz de qual conta veio; `phoneNumberIds`, de qual número.
- Uma entrega recusada aparece como `Invalid Meta webhook signature` com o
  campo `bodyAppId` (a WABA) — é a sua pista de "qual app está mandando com
  o secret errado".

Se preferir o **Logs Explorer** (Supabase → Logs → Explorer), esta consulta
lista as últimas entregas:

```sql
select timestamp, event_message
from function_logs
where event_message like '%Meta webhook delivery%'
order by timestamp desc
limit 100
```

---

## Legenda

- **[REVERSÍVEL]** — dá para voltar; a linha "Para desfazer" diz como.
- **[IRREVERSÍVEL]** — não dá para voltar por dentro do sistema. Pare e
  releia antes de executar.
- **✅ Certo quando** — o que você tem de ver.
- **❌ Se não** — o que fazer.

---

## Parte P — Preparação (dias antes, de dia, com calma)

Tudo aqui é seguro de fazer em horário comercial. **Faça mesmo.** O objetivo
é que a noite tenha só cinco passos (N1–N5).

### P1. Conferir o app novo na Meta [REVERSÍVEL — não muda nada]

1. Abra https://developers.facebook.com/apps/855618774210988/ →
   menu esquerdo **Análise do app** (App Review) → **Permissões e recursos**.
2. ✅ Certo quando: `whatsapp_business_management` e
   `whatsapp_business_messaging` aparecem com **Acesso avançado** aprovado.
3. No topo da página, o seletor de modo do app.
   ✅ Certo quando: **Ao vivo** (não "Em desenvolvimento").
4. ❌ Se não: **pare a migração**. Um app em desenvolvimento só aceita login
   de quem tem papel no app; a Camila não tem. Sem acesso avançado, o
   Embedded Signup não devolve o número da EncaixaRH. Resolva o App Review
   antes de marcar a noite.

### P2. Domínio do site no app novo [REVERSÍVEL]

1. App novo → menu esquerdo **Login do Facebook para Empresas** (ou "Login
   do Facebook") → **Configurações**.
2. Campo **Domínios permitidos para o SDK do JavaScript**: precisa conter
   `https://www.convoflow.com.br`. Se não, adicione e **Salvar alterações**.
3. ✅ Certo quando: o domínio aparece na lista salva.
4. ❌ Se não estiver e você não adicionar: o botão "Conectar com a Meta" abre
   e fecha com erro de domínio na noite. Para desfazer: remover o domínio.

### P3. Configuração do Embedded Signup do app novo [REVERSÍVEL]

1. App novo → menu esquerdo **WhatsApp** → **Cadastro incorporado**
   (Embedded Signup) → **Configurações** (Configurations).
2. Se não existir uma configuração, **Criar configuração**: login
   "Login do Facebook para Empresas", produto WhatsApp, aceite os padrões,
   salve.
3. Copie o **ID da configuração** (um número longo). Anote como
   `CONFIG_ID_NOVO`. Vai para o Vercel no passo N3.
4. ✅ Certo quando: a configuração existe e você tem o ID anotado.

### P4. Anotar o que existe hoje (para poder voltar) [REVERSÍVEL — só leitura]

Anote num arquivo local ou no gerenciador de senhas (nunca no chat, nunca no
repositório):

1. App antigo → **Configurações do app** → **Básico** → **Chave secreta do
   app** → **Mostrar** → anote como `SECRET_ANTIGO`.
2. App novo → o mesmo caminho → anote como `SECRET_NOVO`.
3. App antigo → **WhatsApp** → **Configuração** → bloco **Webhook** →
   **Editar**: o campo "Verificar token" mostra o token atual. Anote como
   `VERIFY_ANTIGO`. Se o campo vier vazio/mascarado e você não sabe o valor,
   anote "desconhecido" — o passo N2 tem uma saída para isso.
4. Defina o verify token do app novo: uma string aleatória longa (ex.: 32
   letras e números). Anote como `VERIFY_NOVO`. (Pode ser igual ao antigo;
   a única exigência é ser o mesmo valor no painel da Meta e no secret.)

### P5. Exportar o token do app antigo [IRREVERSÍVEL — se você pular, perde para sempre]

> Este é **o único passo que não tem volta** na migração inteira. A
> reconexão (N4) grava o token do app novo **por cima** do token do app
> antigo no cofre. Depois disso ninguém mais tem um token do app antigo — e
> **sem ele não dá para desinscrever o app antigo da WABA** (o `DELETE
> /subscribed_apps` desinscreve o app dono do token; é assim que a Meta
> documenta). Exporte agora.

1. Abra o SQL Editor (link na Cola). Cole e rode (Ctrl+Enter):
   ```sql
   select public.get_instance_meta_token('b6d80cd7-d508-46be-a5b6-8f09b9fdf329') as token_app_antigo;
   ```
2. ✅ Certo quando: vem **uma** linha com um texto longo começando com `EAA`.
3. Copie o valor **inteiro** e guarde no **gerenciador de senhas** (1Password,
   Bitwarden — o que a RE9 usa) numa entrada chamada
   `Meta — token do app antigo 959529690042279 — EncaixaRH — apagar após [data]`.
   **Não** cole em chat, e-mail, Slack, planilha nem neste repositório.
4. **Prove que o token é do app antigo e está vivo** (PowerShell; substitua
   `COLE_AQUI`):
   ```powershell
   $t = "COLE_AQUI"
   Invoke-RestMethod -Uri "https://graph.facebook.com/v20.0/debug_token?input_token=$t&access_token=$t" | ConvertTo-Json -Depth 5
   ```
   ✅ Certo quando: `app_id` = `959529690042279`, `is_valid` = `True`,
   `expires_at` = `0` (não expira).
   ❌ Se `app_id` for outro: este token não é do app antigo — pare e me
   chame. ❌ Se `is_valid` for `False`: o token já morreu; a EncaixaRH não
   está enviando hoje e a reconexão vai consertar isso — mas a
   desinscrição do app antigo terá de ser pelo painel (N5, alternativa).
5. **Por quanto tempo guardar:** até 7 dias depois de o app antigo estar
   desinscrito e a Parte D concluída. Depois, apague a entrada. O token só
   serve para (a) o `DELETE` do N5 e (b) uma emergência de envio se a
   reconexão falhar no meio.

### P6. Deployar a `meta-webhook` desta fatia [REVERSÍVEL]

Sem isto, os logs da noite não dizem qual app entregou e a janela de entrega
dupla pode duplicar resposta de bot.

1. Mergeie o PR desta fatia (`feat/meta-runbook-troca-app`). No PowerShell,
   na pasta do projeto, em `main` atualizada (`git checkout main` e
   `git pull`), rode **uma linha por vez**:
   ```powershell
   Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
   npx supabase functions deploy meta-webhook --project-ref pqjkuwyshybxldzpfbbs
   ```
2. ✅ Certo quando: termina com `Deployed Functions on project pqjkuwyshybxldzpfbbs: meta-webhook`
   e a lista "Uploading asset" inclui `_shared/meta-webhook-delivery.ts`.
3. Confira que está viva: mande **uma mensagem de teste** para o número da
   EncaixaRH de um celular qualquer e olhe os logs (seção "Como ler os
   logs"). ✅ Certo quando: aparece `Meta webhook delivery` com
   `app: primary` e `phoneNumberIds: ["1135808682957799"]`.
4. ❌ Se der 401 no CLI: a variável morta voltou; repita a linha 1 na mesma
   janela. ❌ Se a mensagem não aparecer nos logs: **não continue** — o
   webhook do app antigo não está entregando; descubra por quê antes.
5. Para desfazer: `git checkout 9c0eb63 -- supabase/functions/meta-webhook`
   e deployar de novo (volta a versão sem o log `app`).

### P7. Secrets secundários = app novo [REVERSÍVEL]

1. Abra os Secrets do Supabase (link na Cola).
2. Na linha `META_APP_SECRET_SECONDARY` → ícone de editar → cole
   `SECRET_NOVO` → salvar.
3. Na linha `META_GLOBAL_VERIFY_TOKEN_SECONDARY` → editar → cole
   `VERIFY_NOVO` → salvar.
4. ✅ Certo quando: as duas linhas mostram "atualizado agora" (ou o digest
   mudou). O app antigo continua entregando normalmente (o primário não
   mudou).
5. Para desfazer: editar e colar os valores anteriores — se você não os
   anotou, esvaziar o valor (webhook volta a se comportar como só-primário).

### P8. Callback do app novo apontando para o ConvoFlow [REVERSÍVEL]

1. App novo → menu esquerdo **WhatsApp** → **Configuração**.
2. Bloco **Webhook** → **Editar**:
   - URL de callback: `https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/meta-webhook`
   - Verificar token: `VERIFY_NOVO` (o mesmo do P7)
   - **Verificar e salvar**.
3. ✅ Certo quando: a janela fecha sem erro. Nos logs da `meta-webhook`
   aparece `Meta webhook verified {"app":"secondary"}`.
   ❌ Se disser "não foi possível validar a URL de retorno": ou o
   `VERIFY_NOVO` do P7 não é igual ao digitado aqui, ou o secret ainda não
   propagou — espere 1 minuto e tente de novo. Se persistir, nos logs vai
   estar `Meta webhook verification failed`.
4. Ainda no bloco Webhook → **Gerenciar** → assine (Subscribe) os campos:
   `messages`, `account_update`, `phone_number_quality_update`
   (`message_template_status_update` se estiver disponível). Salvar.
5. ✅ Certo quando: os campos aparecem com "Inscrito" (Subscribed).
6. Para desfazer: **Gerenciar** → cancelar inscrição dos campos; ou apagar a
   URL de callback.

### P9. Provar o caminho do app novo com o número de teste [REVERSÍVEL — só leitura]

1. Mande uma mensagem de um celular para o número de teste (`Teste_APP_META`,
   Phone Number ID `1291744174026561`).
2. Logs da `meta-webhook`. ✅ Certo quando: `Meta webhook delivery` com
   `app: secondary` e `phoneNumberIds: ["1291744174026561"]`.
3. ❌ Se aparecer `Invalid Meta webhook signature` com
   `bodyAppId: 2542773286191227`: o `SECRET_NOVO` do P7 está errado —
   confira no painel do app novo e repita P7.
   ❌ Se não aparecer nada: o app novo não está inscrito nessa WABA. Rode no
   PowerShell, com o token da instância de teste (SQL Editor:
   `select public.get_instance_meta_token('32764f27-197a-4753-90ed-44e81618dc89');`):
   ```powershell
   $t = "TOKEN_DA_INSTANCIA_DE_TESTE"
   Invoke-RestMethod -Method Post -Uri "https://graph.facebook.com/v20.0/2542773286191227/subscribed_apps" -Headers @{Authorization="Bearer $t"}
   ```
   Deve responder `success: True`. (Se o token expirou — memória de
   2026-09-12: era token de usuário, curto — gere um System User token no
   Business Manager e regrave pelo botão "Validar e conectar" da tela
   Instâncias, campos manuais.)

**Fim da preparação.** Se P1–P9 estão verdes, a noite é só a Parte N.

---

## Parte N — A noite (janela de ~20 minutos; a EncaixaRH fica sem dupla cobertura por menos de 1 minuto)

Antes de começar: Camila precisa estar **disponível e logada** (ver N4).
Deixe abertas quatro abas: Secrets do Supabase, Variáveis do Vercel, logs da
`meta-webhook`, e o PowerShell com o token antigo já numa variável:

```powershell
$antigo = "COLE_O_TOKEN_DO_P5"
```

### N1. Trocar primário ↔ secundário no Supabase, NESTA ORDEM [REVERSÍVEL]

A ordem garante que **em nenhum instante** a entrega do app antigo é
recusada.

1. `META_APP_SECRET_SECONDARY`: cole `SECRET_ANTIGO` → salvar.
   (Agora primário e secundário são os dois o app antigo. O app novo fica
   recusado por alguns segundos — ele só entrega para o número de teste.)
2. `META_GLOBAL_VERIFY_TOKEN_SECONDARY`: cole `VERIFY_ANTIGO` → salvar.
   (Se anotou "desconhecido" no P4: cole `VERIFY_NOVO` mesmo; só importa
   para handshake, e nenhum handshake do app antigo vai acontecer.)
3. `META_APP_SECRET`: cole `SECRET_NOVO` → salvar.
   (Agora primário = novo, secundário = antigo. Os dois entregam.)
4. `META_GLOBAL_VERIFY_TOKEN`: cole `VERIFY_NOVO` → salvar.
5. `META_APP_ID`: cole `855618774210988` → salvar.
6. ✅ Certo quando: mande uma mensagem ao número da EncaixaRH e veja nos
   logs `Meta webhook delivery` com `app: secondary` e
   `phoneNumberIds: ["1135808682957799"]` (o app antigo agora é o
   secundário). Mande uma ao número de teste: `app: primary`.
7. ❌ Se aparecer `Invalid Meta webhook signature` com
   `bodyAppId: 979901055032057`: o valor colado em (1) não é o
   `SECRET_ANTIGO`. Corrija (1). A Meta reenvia o que recusou (até 36 h).
8. Para desfazer (ordem inversa): `META_APP_ID` = `959529690042279`;
   `META_GLOBAL_VERIFY_TOKEN` = `VERIFY_ANTIGO`; `META_APP_SECRET` =
   `SECRET_ANTIGO`; depois os dois `_SECONDARY` de volta ao app novo.

### N2. Vercel: apontar o botão para o app novo [REVERSÍVEL]

1. Variáveis do Vercel (link na Cola).
2. `VITE_FACEBOOK_APP_ID` → editar → valor `855618774210988` → salvar (mantenha
   os ambientes Production e Preview marcados).
3. `VITE_META_CONFIG_ID` → editar → valor `CONFIG_ID_NOVO` (P3) → salvar.
4. ✅ Certo quando: as duas variáveis mostram o valor novo e "Updated just now".
5. Para desfazer: colar os valores antigos (anote-os antes de editar: a tela
   mostra o valor ao clicar em editar) e fazer o N3 de novo.

### N3. Vercel: Redeploy de produção [REVERSÍVEL]

1. Deployments (link na Cola) → o deployment de produção mais recente
   (etiqueta **Production**, **Current**) → menu `⋯` → **Redeploy** →
   **desmarque** "Use existing Build Cache" → **Redeploy**.
2. Espere ficar **Ready** (2–4 min).
3. ✅ Certo quando: o deployment novo está **Ready** e marcado **Current**.
   (A confirmação de que o botão aponta para o app novo é a janela da Meta
   abrir no N4 — se abrir pedindo login e mostrando "ConvoFlow" como app
   solicitante, com o portfólio da EncaixaRH, está certo.)
4. Para desfazer: Deployments → o deployment **anterior** → `⋯` →
   **Promote to Production** (instantâneo; ele foi construído com as
   variáveis antigas).

### N4. Reconectar a EncaixaRH pelo botão (a Camila clica) [IRREVERSÍVEL no token — o resto é atualização no lugar]

Quem pode clicar: alguém com **cargo Gerente da Conta-mãe da EncaixaRH**
(a Camila) ou Gestor da Loja EncaixaRH — e que tenha o **login do Facebook
que administra o portfólio empresarial da EncaixaRH**. Superadmin **não**
abre esta tela ("Exclusivo para lojas").

1. Camila entra em `https://www.convoflow.com.br` → no **seletor de Conta
   no topo**, escolha a Loja **EncaixaRH** (não a Conta-mãe).
2. Menu **Instâncias e APIs** → **Nova Instância** → **API Oficial do
   WhatsApp** → **Continuar** → deixe o nome **em branco** → **Conectar com
   a Meta**.
3. Na janela da Meta: login do Facebook da empresa → escolha o portfólio da
   EncaixaRH → escolha a conta do WhatsApp Business **já existente**
   (WABA `979901055032057`) → escolha o número **já existente** → avance
   até o fim (a Meta pode pedir SMS no número: tenha o celular por perto).
4. ✅ Certo quando: aviso verde **"Número reconectado"** e a lista continua
   com **a mesma** instância "Encaixa Rh" (não uma segunda linha). Nos logs
   da `meta-oauth-exchange`: `Embedded Signup: decisão {"mode":"reconnect",
   "access":"gerente_child_store" ...}` seguido de
   `whatsapp_instance reconectada no lugar` e
   `Registro pulado: número já registrado nesta instância`.
5. ❌ Se aparecer **"Este número já está conectado em outra Conta ou Loja
   que você não administra"**: quem clicou não alcança a Loja EncaixaRH.
   Nada mudou; a Meta nem foi chamada. Troque de usuário/seletor e repita.
   ❌ Se aparecer **"Falha na troca do código Meta"**: o `META_APP_ID` /
   `META_APP_SECRET` do N1 não são do app novo, ou o botão ainda está no app
   antigo (N2/N3 não pegaram). Nada mudou localmente. Corrija e repita — a
   Meta emite outro código a cada clique.
   ❌ Se aparecer **"Falha ao inscrever app no WABA"**: a Meta recusou o
   app novo nessa WABA. **É o cenário que ninguém conseguiu testar antes**
   (app novo assumindo número onboarded pelo app antigo). Nada mudou
   localmente; o app antigo segue funcionando. Pare aqui, desfaça N1–N3 se
   quiser voltar ao estado de antes (não precisa: com N1 os dois apps são
   aceitos), e me chame de manhã.
   ❌ Se aparecer **"Falha ao salvar instância"**: raríssimo; nada foi
   gravado (a gravação é uma transação). Repita o clique.
6. **O que passou a ser irreversível aqui:** o token do app antigo no cofre
   foi substituído pelo do app novo. Você tem a cópia do P5. A instância,
   as conversas e o histórico **não** mudaram (mesmo id).

### N5. Desinscrever o app antigo da WABA — IMEDIATAMENTE depois do N4 [REVERSÍVEL]

Enquanto você não fizer isto, **cada mensagem chega duas vezes** (uma por
app). Faça em seguida ao aviso verde; o PowerShell já está aberto com
`$antigo`.

1. Rode:
   ```powershell
   Invoke-RestMethod -Method Delete -Uri "https://graph.facebook.com/v20.0/979901055032057/subscribed_apps" -Headers @{Authorization="Bearer $antigo"}
   ```
2. ✅ Certo quando: responde `success : True`.
3. Prove com o token **novo** (SQL Editor:
   `select public.get_instance_meta_token('b6d80cd7-d508-46be-a5b6-8f09b9fdf329');`
   — agora devolve o token do app novo):
   ```powershell
   $novo = "COLE_O_TOKEN_NOVO"
   Invoke-RestMethod -Uri "https://graph.facebook.com/v20.0/979901055032057/subscribed_apps" -Headers @{Authorization="Bearer $novo"} | ConvertTo-Json -Depth 5
   ```
   ✅ Certo quando: em `data` aparece **só** o app `855618774210988`.
4. ❌ Se o DELETE responder erro 190 (token inválido) — o token antigo
   morreu entre o P5 e agora. **Alternativa pelo painel** (também
   reversível): app **antigo** → **WhatsApp** → **Configuração** → bloco
   Webhook → **Gerenciar** → cancelar a inscrição do campo `messages` (e dos
   outros). Isso para as entregas do app antigo para **todas** as WABAs
   dele. Se o app antigo não tem outro uso, é equivalente.
5. Para desfazer (reinscrever o app antigo):
   ```powershell
   Invoke-RestMethod -Method Post -Uri "https://graph.facebook.com/v20.0/979901055032057/subscribed_apps" -Headers @{Authorization="Bearer $antigo"}
   ```

### N6. Prova de vida [só leitura]

1. Mande uma mensagem de um celular para o número da EncaixaRH.
   ✅ Logs: `Meta webhook delivery` com `app: primary`,
   `phoneNumberIds: ["1135808682957799"]`, **uma** linha só (não duas). A
   mensagem aparece em Conversas.
2. Responda pelo ConvoFlow.
   ✅ A resposta chega no celular; logs da `whatsapp-send-message`:
   `Meta message sent` com `instance_id: b6d80cd7-…`.
3. Se a EncaixaRH tem chatbot publicado: mande uma mensagem que dispare o bot.
   ✅ **Uma** resposta do bot, não duas.
4. ❌ Se a resposta humana falhar com erro de token (190): o token novo não
   está no cofre — olhe `select public.get_instance_meta_token(...)`; se
   vier o antigo, a reconexão não gravou (impossível pelo desenho, mas
   confira). ❌ Se chegar `app: secondary`: o N5 não pegou — repita N5.

**Fim da noite.** O resto é de dia.

---

## Parte D — Dias seguintes

### D1. Esperar 36 h antes de mexer nos secundários [REVERSÍVEL]

A Meta reenvia entregas que falharam por até 36 h. Uma entrega antiga
(assinada pelo app antigo) ainda pode chegar até 36 h depois do N5. Enquanto
o secundário = app antigo, ela é aceita e o dedupe a descarta em silêncio
(`Meta message already processed, skipping`). Não limpe os secundários
antes disso.

### D2. Confirmar que o app antigo parou [só leitura]

Logs Explorer, 24 h:
```sql
select timestamp, event_message
from function_logs
where event_message like '%Meta webhook delivery%' and event_message like '%"app":"secondary"%'
order by timestamp desc
limit 20
```
✅ Certo quando: vazio nas últimas 24 h (só `primary` chegando).

### D3. Esvaziar os secrets secundários [REVERSÍVEL]

1. Secrets do Supabase → `META_APP_SECRET_SECONDARY` → editar → apague o
   valor (deixe vazio) → salvar. Idem `META_GLOBAL_VERIFY_TOKEN_SECONDARY`.
2. ✅ Certo quando: as entregas continuam `app: primary`. O código trata
   secundário vazio como inexistente (teste
   `src/lib/metaWebhookSignature.test.ts`).
3. **Não apague o código** do secundário: é permanente, para a próxima troca.
4. Para desfazer: colar `SECRET_ANTIGO` / `VERIFY_ANTIGO` de volta.

### D4. O app antigo [NÃO apague]

Deixe o app antigo existindo, sem callback ou sem campos inscritos. Apagar o
app é irreversível na Meta e não traz nada. Reavalie em 30 dias.

### D5. Apagar a cópia do token antigo [IRREVERSÍVEL, e é o desejado]

Sete dias depois do D3, apague a entrada do gerenciador de senhas do P5.

---

## O que observar nas horas seguintes — e o que cada sintoma significa

| O que olhar | Onde | Normal | Se não |
|---|---|---|---|
| Entregas chegando | logs `meta-webhook`, busca `Meta webhook delivery` | uma linha por evento, `app: primary` | duas linhas por evento = app antigo ainda inscrito (repita N5); `app: secondary` = idem; nenhuma linha em 1 h de dia útil = app novo não entrega (P8 desfeito? campos desinscritos?) |
| Assinatura recusada | busca `Invalid Meta webhook signature` | nenhuma | `bodyAppId: 979901055032057` = retry do app antigo chegando com secundário errado (N1 passo 1 mal colado); outro id = app desconhecido apontando para a URL |
| Duplicata detectada | busca `duplicate delivery lost the race` ou `already processed` | algumas nos primeiros minutos após N4; zero depois do N5 + 36 h | contínuas = os dois apps inscritos (N5 não pegou) |
| Envio humano | logs `whatsapp-send-message`, busca `Meta message sent` | uma por resposta | erro `190`/`OAuthException` = token do cofre inválido (a reconexão não gravou o novo, ou o app novo perdeu a permissão na WABA) |
| Resposta do bot em dobro | um contato de teste | uma resposta | duas = entrega dupla + `meta-webhook` sem a guarda (P6 não deployado) |
| Status de mensagem (`delivered`/`read`) | busca `Meta message status updated` | chegam com `app: primary` | não chegam = campo `messages` não inscrito no app novo (P8 passo 4) |
| Aquecimento / teto diário | `whatsapp_instances.registered_at` da EncaixaRH | `2026-06-11 22:42:51+00`, inalterado | nulo ou recente = a reconexão registrou de novo (não deveria: `Registro pulado` no log) — me chame |
| Contagens do histórico | SQL: `select count(*) from messages where whatsapp_instance_id='b6d80cd7-d508-46be-a5b6-8f09b9fdf329'` | ≥ 2.622 e só subindo | menor = algo apagou (impossível pela reconexão; investigue antes de qualquer outra coisa) |

---

## A janela de entrega dupla — o que decidimos

- **Quando começa:** no segundo passo da reconexão (N4), quando o app novo
  é inscrito na WABA. **Quando termina:** no N5. Com o PowerShell pronto, é
  o tempo de ler o aviso verde e apertar Enter: **menos de 1 minuto**.
- **O que acontece dentro dela:** cada evento chega duas vezes. Se a segunda
  chega **depois** da primeira ter gravado, o dedupe (SELECT por wamid) a
  descarta inteira. Se as duas chegam **ao mesmo tempo** (milissegundos), as
  duas passam pelo SELECT; a segunda morre no índice único dentro da RPC.
  **Antes desta fatia** o handler ignorava esse erro e chamava o bot mesmo
  assim — resposta em dobro. **Agora** ele para ali
  (`duplicate delivery lost the race`). Status (`delivered`/`read`) são
  UPDATEs idempotentes; opt-out por palavra-chave é idempotente.
- **Dá para encurtar mais?** Só invertendo a ordem (desinscrever o antigo
  ANTES de reconectar), e isso abre uma janela de **zero** entrega em vez de
  dupla — mensagem de cliente perdida de verdade, sem retry (a Meta só
  reenvia o que foi entregue e falhou, não o que ninguém estava inscrito
  para receber). Não vale.
- **Recomendação:** aceitar a janela, mantê-la em segundos, e ter o P6
  deployado (que a torna inofensiva mesmo se demorar).
