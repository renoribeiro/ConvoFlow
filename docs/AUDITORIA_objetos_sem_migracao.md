# Auditoria — objetos do banco sem migração local

**Data:** 2026-08-24 · **Projeto:** `pqjkuwyshybxldzpfbbs`
**Continuação de** [`RUNBOOK_reconciliacao_ledger.md`](./RUNBOOK_reconciliacao_ledger.md)

---

## O que foi feito

A reconciliação do ledger fechou o lado "arquivo sem registro". Este documento
fecha o outro lado: **objetos que existem no banco e que nenhum arquivo do
repositório sabia criar**.

Eram 23: 15 tabelas, 1 view, 6 funções e 1 índice. Todos foram reconstruídos a
partir do catálogo do PostgreSQL, em 11 arquivos novos que usam as versões que o
ledger já tinha — assim arquivo e ledger passam a casar, e nada fica "pendente".

| Arquivo criado | Objetos |
|---|---|
| `20250803074510_consolidated_initial_setup_v5_tables_only.sql` | `companies`, `company_users`, `evolution_api_instances`, `campaigns`, `jobs`, `reports` |
| `20250803074600_create_business_logic_functions_v2.sql` | `handle_new_message(jsonb)`, `process_flow_step` |
| `20250803083958_create_rpc_functions_v2.sql` | `handle_new_message(text,jsonb)`, `update_message_status`, `get_delivery_log` |
| `20250804093819_create_conversations_table.sql` | `conversations` + 4 policies |
| `20250804094915_create_notifications_table.sql` | `notifications` + 3 policies |
| `20250805020239_fix_admin_users_data_function_all_casts.sql` | `get_admin_users_data` |
| `20250805120251_automation_flows_initial.sql` | `automation_flows`, `automation_executions`, `automation_step_logs` |
| `20250810124717_add_messages_whatsapp_instance_id_index.sql` | `idx_messages_whatsapp_instance_id` |
| `20250818082851_create_module_control_system.sql` | `system_modules`, `tenant_module_settings`, `tenant_active_modules`, `activate_essential_modules_for_tenant` + catálogo de 12 linhas |
| `20260309221219_create_subscriptions_table.sql` | `subscriptions` + 3 policies |
| `20260321100253_create_rate_limits_table.sql` | `rate_limits` |

> **Estes arquivos não são o SQL original.** O original se perdeu — foi aplicado
> direto pelo Dashboard. O conteúdo é o estado de hoje, extraído do catálogo, e
> cada arquivo diz isso no cabeçalho. São idempotentes: já estão aplicados.

### Cinco tabelas centrais estavam descobertas

`conversations`, `notifications`, `automation_flows`, `automation_executions` e
`automation_step_logs` — as tabelas da tela de Conversas, do sino e de Automação
— **não tinham `CREATE` em nenhum arquivo executável.** Os únicos `CREATE` delas
estavam dentro de arquivos que a reconciliação arquivou por serem perigosos ou
supersedidos. Arquivar aqueles arquivos, sem isto, teria deixado o repositório
incapaz de recriar cinco tabelas centrais.

**Varredura final:** cruzei as 89 tabelas e views vivas contra todos os `CREATE`
em `supabase/migrations/`. Zero descobertas. (`quick_replies` aparece como falso
positivo: ela nasce de `ALTER TABLE message_templates RENAME TO quick_replies` na
`20260824000001`, e `message_templates` vem da `20250103000003`.)

---

## O que continua sem arquivo, e por que está tudo bem

Depois desta rodada, 22 versões do ledger seguem sem arquivo próprio. Nenhuma
delas representa objeto descoberto:

**9 linhas anônimas** (`20250802011200` … `20250802125719`) — sem nome no ledger,
do primeiro `db push` do Lovable. Não há como saber o que fizeram. Tudo que elas
criaram foi reescrito muitas vezes desde então e está coberto pelos arquivos de
hoje.

**13 versões nomeadas** cujos objetos já estão em outro arquivo:

| Versão | Onde o objeto vive hoje |
|---|---|
| `add_missing_columns`, `drop_existing_functions` | colunas e drops absorvidos pelos arquivos posteriores |
| `create_admin_users_function` e mais 3 iterações | estado final em `20250805020239` |
| `add_tenant_id_to_stripe_config_fixed` | `20260716000002_hierarchy_v2_foundation` |
| `create_stripe_stats_function` | `20241220000001_create_stripe_transactions` |
| `add_manual_access_to_tenants` | `20260630000001_tenant_access_gate` |
| `update_admin_users_view_with_manual_access` | `20260813000004_profile_status_source_of_truth` |
| `harden_automation_trigger_functions` | `20260624000002_wire_automation_triggers` (conferido: o arquivo já traz `SECURITY DEFINER` + `SET search_path = public`, igual ao banco) |

Reconstruir passo intermediário de `CREATE OR REPLACE` não tem valor: o estado
final é o mesmo.

---

## ⚠️ O que a reconstrução revelou — precisa da sua decisão

Ao extrair o DDL, apareceu bastante coisa morta. **Nada foi apagado.** As
remoções abaixo são decisão sua, e cada uma pede script próprio com export antes.

### 1. Cinco funções que quebram se forem chamadas

São da era `company_id`, anterior à multi-tenancy por `tenant_id`. Referenciam
colunas que **não existem mais** — conferido no catálogo em 2026-08-24:

| Função | Coluna inexistente que ela usa |
|---|---|
| `handle_new_message(jsonb)` | `contacts.company_id`, `contacts.last_seen`, `messages.type`, `chatbots.company_id` |
| `handle_new_message(text,jsonb)` | `contacts.company_id`, `messages.api_message_id` |
| `update_message_status(text,text)` | `messages.api_message_id`, `messages.updated_at` |
| `get_delivery_log(uuid)` | `messages.company_id` |
| `process_flow_step(uuid,uuid,text)` | corpo vazio (placeholder); grava em `logs.errors` no exception |

O PostgreSQL não valida corpo de `plpgsql` na criação, por isso elas seguem no
catálogo sem dar sinal. Qualquer chamada estoura em tempo de execução.

Quem faz esse trabalho hoje: `process_incoming_message` (`20260529130000`), as
tabelas `chatbot_nodes`/`chatbot_edges` (`20260601000001`) e o `job_queue`.

**Atenção ao nome:** existem duas `handle_new_message` com assinaturas
diferentes, as duas mortas. Não confunda com `handle_new_user()`, que é **viva e
essencial** — é ela que cria o perfil quando alguém se cadastra.

### 2. Um sistema de módulos paralelo e morto

`system_modules` (12 linhas) + `tenant_module_settings` (**0 linhas**) +
`tenant_active_modules`.

Quem alimenta o `ModuleGuard` de verdade é a tabela `module_settings`, via
`useModules`. O trio acima aparece **apenas** em
`src/integrations/supabase/types.ts`, que é gerado automaticamente a partir do
banco. Nenhum código de aplicação lê ou escreve nele.

Zero linhas em `tenant_module_settings` é a prova de que nunca foi usado.

Bônus: as policies desse trio comparam `profiles.id = auth.uid()`. A coluna que
guarda o id do auth é `profiles.user_id` — o predicado nunca casa. Mais uma
razão pela qual nunca funcionou.

### 3. Seis tabelas legadas da era `company_id`

`companies` (2 linhas), `evolution_api_instances` (1 linha), `campaigns`,
`company_users`, `jobs`, `reports` (0 linhas cada).

Estão com RLS ligada e **zero policies** — negam tudo. Não é descuido: foi a
`20260513120200_lockdown_legacy_orphan_tables` que as trancou assim. Do ponto de
vista de segurança já estão neutralizadas; o custo de mantê-las é confusão de
nome com as tabelas vivas:

| Legada morta | Viva de verdade |
|---|---|
| `campaigns` | `mass_message_campaigns` |
| `evolution_api_instances` | `whatsapp_instances` |
| `jobs` | `job_queue` |
| `reports` | `report_templates` / `report_data` |
| `companies` / `company_users` | `tenants` / `profiles` |

### Recomendação

Não apagar agora. O ganho é arrumação, o risco é real (as 3 linhas em
`companies`/`evolution_api_instances` podem ter valor histórico), e a segurança
já está resolvida pelo lockdown. Se quiser apagar depois, o caminho é o do
`CLAUDE.md`: exportar antes com consulta somente-leitura em `docs/`, e um único
bloco `DO` com guardas de identidade.

Se decidir manter, mantenha também estes arquivos de reconstrução — sem eles o
banco volta a ter objetos que ninguém sabe de onde vieram.

---

## Como conferir que o buraco fechou

```bash
# nenhum objeto vivo sem arquivo
grep -rq "CREATE TABLE IF NOT EXISTS public.subscriptions" supabase/migrations/

# versoes do ledger x arquivos locais
ls supabase/migrations/*.sql | wc -l          # 113
```

```sql
-- no SQL Editor
SELECT count(*) FROM supabase_migrations.schema_migrations;  -- 150
```

## Fora do escopo, ainda aberto

- **As duas publications de realtime**, criadas à mão no Dashboard.
  `supabase_realtime` está vazia — é por isso que a tela vive de polling de 10s.
- **`handle_message_conversation` casa conversa por `(contact_id, tenant_id)` e
  ignora `whatsapp_instance_id`.** A constraint `conversations_tenant_id_contact_id_key`
  reproduz isso. Duas instâncias no mesmo contato compartilham conversa. Defeito
  real, adiado de propósito.
- **Backup de dados**: `scripts/backup-db.mjs` cobre os dados, mas precisa da
  senha do banco. Com estes arquivos + aquele backup, a recuperação fica completa.
