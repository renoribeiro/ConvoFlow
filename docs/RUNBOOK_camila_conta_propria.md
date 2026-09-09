# Runbook — Camila vira Conta própria, Mario vira superadmin

**Executado em 2026-09-09. Tudo aplicado em produção. Sobra UMA decisão** (a
Conta vazia do Mario, no fim deste arquivo).

## O que foi feito, em ordem

| # | Migração | O que mudou | Estado |
|---|---|---|---|
| 1 | `20260909000001_rls_gerente_reads_child_store_data` | Gerente passa a **ler** os dados operacionais das Lojas filhas (35 tabelas) | ✅ aplicada |
| 2 | `20260909000002_camila_conta_propria_gerente` | Camila: gestor da EncaixaRH → gerente de Conta própria; EncaixaRH reparentada | ✅ aplicada |
| 3 | `20260909000003_mario_vira_superadmin` | Mario: gerente → superadmin sem Conta | ✅ aplicada |

As três estão no ledger (`supabase_migrations.schema_migrations`). **Nenhuma
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

- `docs/teste_isolamento_rls.sql`: **218 ok / 0 falhas**.
- Auto-teste da suíte (sabotagem): **215 ok / 3 falhas**, todas em `contacts`,
  exatamente as três previstas. Desfeito pelo ROLLBACK.
- `EXPLAIN` da policy nova: `hashed SubPlan`, `loops=1` — avaliada **uma vez por
  consulta**, não por linha.
- Como a Camila, sob RLS de verdade: 144 conversas, 145 contatos, 2.234
  mensagens, 1 instância, enxerga a própria Conta e a EncaixaRH, **zero** de
  Conta/Loja alheia.
- `tenant_access_state` como ela: liberada (`manual`) na Conta e na Loja.

## ⚠️ Limitação conhecida — a Camila NÃO escreve na EncaixaRH

A Parte 1 concedeu **somente leitura** (`FOR SELECT`). Hoje a EncaixaRH tem
**zero membros**, e a Camila é a única pessoa que a atende.

Na prática ela vai **abrir as conversas e não conseguir responder**: enviar
mensagem é `INSERT` em `messages` e `UPDATE` em `conversations`, e nenhuma
policy de escrita foi criada.

Duas saídas, decisão do dono:

1. **Estender para escrita** — dar ao gerente INSERT/UPDATE nas Lojas filhas
   (as mesmas 35 tabelas, ou só o subconjunto da caixa de entrada). É a que
   devolve o dia a dia dela.
2. **Criar um Gestor na EncaixaRH** — ela mesma com um segundo login, ou uma
   pessoa da equipe. Mantém o modelo atual intacto (Conta acompanha, Loja
   opera), mas exige um login novo.

Enquanto nenhuma das duas acontecer, **a Camila só consegue acompanhar**.

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

## 3. Decidir sobre a escrita na EncaixaRH

Ver "Limitação conhecida" acima. É a única coisa que pode atrapalhar o trabalho
dela amanhã.
