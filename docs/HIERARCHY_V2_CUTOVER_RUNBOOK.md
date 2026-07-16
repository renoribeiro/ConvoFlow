# Runbook da Virada — Hierarquia V2 (Gerente/Gestor/Atendente)

> Guia operacional para o dia da virada. Siga na ordem. Cada passo tem uma
> verificação. Nada aqui foi executado automaticamente.
>
> Estado real do banco confirmado (leitura, 2026-07-16): hierarquia atual
> `superadmin/agencia/loja`; as 7 policies e 6 funções que a fundação reescreve
> existem; Mario = superadmin (sem loja); tenant "Camila Santarosa" = EncaixaRH
> (1 chip Meta conectado, 55 contatos, 970 mensagens, 54 conversas).

## Ordem geral
0. Backup fresco  →  1. Publicar site + funções  →  2. (Stripe, para cobrança)
→  3. Fase 2 no SQL Editor  →  4. Fase 3 no SQL Editor  →  5. Conferência final.

O frontend novo é **compatível** com os nomes antigos e novos, então publicá-lo
**antes** do banco não quebra nada no intervalo.

---

## 0. Backup (OBRIGATÓRIO antes de qualquer SQL)

**Opção A (recomendada):** Supabase Dashboard → seu projeto → **Database → Backups**
→ confirmar um backup recente ou clicar em **Backup now**. Com PITR, anote o
horário para poder voltar a esse ponto.

**Opção B (dump manual, extra):**
```bash
supabase db dump --linked -f backup_pre_v2.sql
```

✅ **Só prossiga depois que o backup existir.**

---

## 1. Publicar o site novo + as funções

**Frontend (Vercel):** o ideal é publicar um **Preview** da branch e testar antes
de promover. Ou, quando estiver confiante, fazer o merge para `main` (o Vercel
publica sozinho). A branch é `feat/hierarchy-v2`.

**Edge Functions alteradas** (via CLI, projeto já linkado):
```bash
supabase functions deploy manage-user
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
```

> As migrações NÃO são funções — elas são aplicadas no passo 3/4.

---

## 2. Stripe (necessário só para COBRANÇA — pode ser feito em paralelo/depois)

A migração de papéis NÃO depende do Stripe. Faça isto para o checkout novo funcionar:

1. No **Stripe Dashboard → Products**, crie dois **Prices recorrentes mensais (BRL)**:
   - **Plano Gerente** — R$ 499,90/mês → copie o `price_...`
   - **Loja extra** — R$ 99,90/mês → copie o `price_...`
2. Configure os secrets das Edge Functions:
   ```bash
   supabase secrets set STRIPE_PRICE_GERENTE=price_DO_GERENTE STRIPE_PRICE_STORE_SLOT=price_DA_LOJA_EXTRA
   ```
   (Os secrets `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` já existem da ativação anterior.)
3. Redeploy já feito no passo 1.

---

## 3. Fase 2 — Fundação (no SQL Editor do Supabase)

⚠️ São **dois arquivos** e a ordem importa. O primeiro precisa rodar **sozinho**
(não pode estar dentro de transação).

**3A.** Abra `supabase/migrations/20260716000001_hierarchy_v2_add_enum_values.sql`,
copie TODO o conteúdo, cole no SQL Editor e **execute sozinho** (só ele).

**3B.** Abra `supabase/migrations/20260716000002_hierarchy_v2_foundation.sql`,
copie TODO o conteúdo, cole no SQL Editor e execute (ele já tem `BEGIN/COMMIT`).

**Verificação da Fase 2** (rode e confira):
```sql
-- constraint deve listar os 4 papéis novos
select pg_get_constraintdef(oid) from pg_constraint where conname='profiles_role_modern_only';
-- papéis após backfill: bruno e Camila viram 'gestor'; superadmins seguem
select role, count(*) from public.profiles group by role order by role;
-- colunas novas existem
select column_name from information_schema.columns
 where table_name='tenants' and column_name in ('kind','store_slots_included');
```
Esperado: constraint com `superadmin/gerente/gestor/atendente`; `gestor=2, superadmin=4`; colunas `kind` e `store_slots_included` presentes.

---

## 4. Fase 3 — Virada Mario / Camila / EncaixaRH (no SQL Editor)

Só depois que a Fase 2 passou. Abra
`supabase/migrations/20260716000003_hierarchy_v2_mario_camila_encaixarh.sql`,
copie TODO o conteúdo, cole no SQL Editor e execute (tem `BEGIN/COMMIT` e trava
de segurança — recusa rodar se a Fase 2 não estiver aplicada).

**Verificação da Fase 3:**
```sql
-- Mario deve estar 'gerente' com uma conta (tenant_id preenchido); Camila 'gestor'
select first_name, role, tenant_id from public.profiles
 where id in ('b29f1afd-ae64-4669-9fdd-b2df9395587f','2478dce2-c829-41a6-952d-f6d27db73d78');
-- EncaixaRH deve ser store sob a conta do Mario; a conta do Mario deve ter 5 slots
select name, kind, parent_tenant_id, store_slots_included from public.tenants
 where kind='account' or id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a';
-- CHIP E DADOS INTACTOS (o mais importante):
select status from public.whatsapp_instances where tenant_id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a'; -- 'open'
select count(*) from public.messages where tenant_id='2165be9f-b6bb-49fb-ba6a-1dec6840c45a';         -- 970
```

Me avise depois de cada passo — eu confirmo os números pelo MCP (leitura).

---

## 5. Pós-virada

- Login do Mario → deve ver o **seletor de loja**, o menu **Comparar Lojas** e o
  bloco de **comprar loja extra**. A loja EncaixaRH aparece no grupo dele.
- Login da Camila → deve ser **Gestora** da EncaixaRH, com os dados de sempre e o
  WhatsApp conectado; sem enxergar outras lojas.
- Confirmar que o chip da EncaixaRH continua recebendo/enviando.

## Rollback
- Restaurar do backup do passo 0 é o caminho mais seguro e completo.
- As migrações trazem notas de rollback manual no fim de cada arquivo (002 e 003),
  para reversões pontuais sem restaurar tudo.

---

## Regra de segurança
A Fase 3 (e a Fase 2, que também altera dados) **só roda em produção** com backup
feito e com o "sim, pode migrar produção" explícito. O MCP está em somente
leitura de propósito — quem executa os SQLs é você, no SQL Editor.
