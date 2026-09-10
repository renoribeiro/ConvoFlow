# Runbook — Camila vira Conta própria, Mario vira superadmin

**Executado em 2026-09-09. Tudo aplicado em produção. Sobra UMA decisão** (a
Conta vazia do Mario, no fim deste arquivo).

## O que foi feito, em ordem

| # | Migração | O que mudou | Estado |
|---|---|---|---|
| 1 | `20260909000001_rls_gerente_reads_child_store_data` | Gerente passa a **ler** os dados operacionais das Lojas filhas (35 tabelas) | ✅ aplicada |
| 2 | `20260909000002_camila_conta_propria_gerente` | Camila: gestor da EncaixaRH → gerente de Conta própria; EncaixaRH reparentada | ✅ aplicada |
| 3 | `20260909000003_mario_vira_superadmin` | Mario: gerente → superadmin sem Conta | ✅ aplicada |
| 4 | `20260909000004_rls_gerente_writes_child_store_inbox` | Gerente passa a **escrever** na caixa de entrada das Lojas filhas (4 tabelas) | ✅ aplicada |
| 5 | `20260909000005_storage_gerente_uploads_child_store_media` | Gerente passa a **subir mídia** para a pasta das Lojas filhas (bucket `whatsapp-media`) | ✅ aplicada |

As cinco estão no ledger (`supabase_migrations.schema_migrations`). **Nenhuma
delas deve rodar de novo** — as guardas abortam sozinhas se tentarem.

## Estado final

```
Camila Santarosa (Conta, account, manual_access_granted = true)
└── EncaixaRH (Loja, store)  ← 144 conversas, 145 contatos, 2.234 mensagens, 1 número

Mario Acioli (Conta, account)  ← VAZIA: 0 Lojas, 0 perfis
```

- Camila: perfil `2478dce2-…`, login `camila@encaixarh.com.br` **inalterado**,
  cargo `gerente`, `parent_id` NULL, Conta `c1a9d2f0-…`.
- Mario: perfil `b29f1afd-…`, login `mario@sourelevante.com.br` **inalterado**,
  cargo `superadmin`, `tenant_id` NULL.

## Por que a Parte 1 era obrigatória

O seletor de Loja do gerente é **só frontend**. O RLS das tabelas operacionais
olha o `tenant_id` do próprio perfil (`get_current_user_tenant_id()`), nunca a
Loja escolhida no seletor. Medido antes da mudança: o gerente Mario via **0**
das 144 conversas da EncaixaRH, que era Loja filha da Conta dele.

Sem a Parte 1, mover a Camila para a Conta deixaria a caixa de entrada dela
**vazia e sem mensagem de erro**.

## Verificações que rodaram

- `docs/teste_isolamento_rls.sql`: **232 ok / 0 falhas**.
- Auto-teste da suíte (sabotagem do helper compartilhado em `contacts`):
  **224 ok / 8 falhas** — 7 em `contacts` (leitura e escrita) + 1 no bucket
  `whatsapp-media`. Desfeito pelo ROLLBACK.
- Envio ponta a ponta como a Camila, numa conversa real da EncaixaRH:
  INSERT da mensagem, gatilhos ligando e atualizando a conversa, UPDATE de
  status/wamid, marcar como lida — tudo OK; e recusado ao tentar gravar,
  mover linha ou apagar em Loja de outra Conta.
- `EXPLAIN` da policy nova: `hashed SubPlan`, `loops=1` — avaliada **uma vez por
  consulta**, não por linha.
- Como a Camila, sob RLS de verdade: 144 conversas, 145 contatos, 2.234
  mensagens, 1 instância, enxerga a própria Conta e a EncaixaRH, **zero** de
  Conta/Loja alheia.
- `tenant_access_state` como ela: liberada (`manual`) na Conta e na Loja.

## Parte 4 — a escrita (resolvida no mesmo dia)

A Parte 1 concedeu **somente leitura**, e isso deixou a Camila abrindo as
conversas sem conseguir responder. Pior: em `ChatWindow.handleSendMessage` a
gravação acontece **antes** da chamada ao provedor, então o `INSERT` barrado
caía no `catch` e o `adapter.sendText()` nunca rodava — **o cliente do outro
lado não recebia nada**. Medido como ela:
`42501 new row violates row-level security policy for table "messages"`.

Corrigido pela migração **`20260909000004_rls_gerente_writes_child_store_inbox`**:
INSERT + UPDATE em **quatro** tabelas — `messages`, `conversations`,
`contacts`, `tags` — com `WITH CHECK` nos dois comandos. As outras 31 tabelas
seguem somente leitura.

`conversations` entrou porque três gatilhos de `messages` mexem nela e
**nenhum é `SECURITY DEFINER`** (`handle_message_conversation`,
`update_conversation_on_message`, `sync_conversation_last_message`). Com
`INSERT ... ON CONFLICT DO UPDATE`, uma linha invisível ao RLS faz o comando
**errar**, não passar batido — sem INSERT e UPDATE em `conversations`, o
próprio INSERT em `messages` falharia dentro do gatilho.

**`DELETE` não foi concedido**, de propósito: responder cliente não exige
apagar nada. Se um dia precisar, é outra migração e outra decisão.

## Parte 5 — a mídia

Texto passou a sair na Parte 4, mas foto/áudio/documento não: `uploadWhatsAppMedia`
sobe o arquivo antes, em `<tenant_id>/<arquivo>`, e `whatsapp_media_tenant_upload`
só aceitava a pasta da Conta do próprio perfil. Medido como a Camila: pasta da
EncaixaRH `false`, pasta da própria Conta `true`.

**`20260909000005_storage_gerente_uploads_child_store_media`** cria
`whatsapp_media_gerente_child_store_upload` — só `INSERT`, só no bucket
`whatsapp-media`, usando o mesmo `gerente_child_store_ids()`.
`uploadWhatsAppMedia` usa `upsert: false`, então subir arquivo é INSERT puro e
UPDATE não entrou. Leitura já era pública no bucket; DELETE continua restrito à
Conta do próprio perfil.

### ⚠️ Bug achado de passagem: o bucket `bug-reports`

As três policies de `bug-reports` têm uma cláusula de Loja filha que é **código
morto**. Elas comparam com `storage.foldername(t.name)` — o *nome do tenant* —
em vez do `name` do objeto. `storage.foldername('EncaixaRH')` devolve `{}`,
então `[1]` é NULL e o `EXISTS` nunca casa. Medido em 2026-09-09:
cláusula como está → `false`; com o `name` do objeto → `true`.

Efeito prático: um gerente não consegue anexar print de bug report de uma Loja
filha. **Não corrigi** — outro bucket, outra decisão. Fica registrado aqui e no
cabeçalho da migração 5.

## Exposição nova a conferir

A policy `gerente_reads_child_store_data` inclui `whatsapp_instances`, que
carrega `connection_config` e as colunas legadas `evolution_api_key` /
`evolution_api_url`. A tabela é necessária para a caixa de entrada e a tela de
Números renderizarem. Efeito: **todo gerente passa a ler as credenciais do
provedor das Lojas dele**. Para a Camila não muda nada (ela já lia, como
gestora). Se isso incomodar, o caminho é uma view com colunas limitadas — não
está feito.

`instance_secrets` ficou **de fora** de propósito.

---

# O QUE VOCÊ PRECISA FAZER

## 1. Decidir sobre a Conta vazia "Mario Acioli" — NÃO apaguei

**Recomendação: não apague. Renomeie mentalmente para "arquivada" e deixe.**

Ela não custa nada, não aparece para ninguém além dos superadmins, e apagá-la é
irreversível no SQL Editor (não tem desfazer).

O que sairia junto, medido em 2026-09-09 (`ON DELETE CASCADE` a partir de
`tenants.id`):

| Tabela | Linhas |
|---|---|
| `tags` (semeadas automaticamente na criação) | 5 |
| `tenant_access_events` (auditoria da liberação manual de 2026-08-11) | 1 |
| `profiles` | **0** — o Mario já saiu na Parte 3 |
| Lojas filhas | **0** |
| conversas, contatos, mensagens, números, chatbots, assinaturas | **0** |

Ou seja: apagar levaria 5 tags e **1 linha de auditoria**. A auditoria é o único
motivo real para não apagar — ela registra que a Conta foi liberada
manualmente, e esse histórico some junto.

O risco de cascata que existia sumiu quando o Mario saiu: enquanto o perfil dele
apontava para essa Conta, um `DELETE` teria **apagado o usuário dele junto**
(`profiles.tenant_id` → `tenants` é `ON DELETE CASCADE`). Hoje não apaga mais
ninguém.

Se ainda assim você quiser apagar, peça — eu escrevo o script com guarda de
"está mesmo vazia" e exportação prévia, no modelo do
`docs/remover_lojas_orfas.sql`. **Não rode um `DELETE` na mão.**

## 2. Avisar a Camila

Texto pronto na resposta do chat (seção "O que a Camila vai ver de diferente").

## 3. (resolvido) Escrita na EncaixaRH

Feito na Parte 4 — ela responde normalmente. Nada a decidir aqui.
