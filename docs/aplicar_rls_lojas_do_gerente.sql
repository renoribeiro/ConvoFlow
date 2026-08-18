-- =============================================================================
-- ConvoFlow — liberar a leitura das Lojas para o Gerente (projeto pqjkuwyshybxldzpfbbs)
-- Rodar de uma vez no SQL Editor do Supabase. É transacional: ou entra tudo, ou
-- não entra nada. Idempotente: rodar duas vezes não quebra.
--
-- Equivale a:
--   supabase/migrations/20260817000006_rls_gerente_reads_own_stores.sql
--
-- NÃO rodar `supabase db push` neste projeto: 81 migrations locais não estão no
-- ledger e algumas mexem em dado real de usuário.
--
-- -----------------------------------------------------------------------------
-- PARA QUE SERVE
-- -----------------------------------------------------------------------------
-- Sem isto, a Loja criada pela tela "Minhas Lojas" some da vista do próprio
-- Gerente que a criou. A linha entra no banco (o INSERT roda com service key na
-- edge function `create-store`), mas o RLS não deixa ele ler de volta:
--
--   tenants_account_manager_read usa is_tenant_in_my_descendants(), que caminha
--   pela árvore de PROFILES e pergunta "algum perfil abaixo do meu aponta para
--   este tenant?". Loja nova não tem nenhum usuário dentro → resposta FALSE.
--
-- Efeito prático sem a policy: a lista de Lojas volta vazia, o seletor de Loja
-- do topo não mostra a Loja nova, e o atalho "Abrir a loja" não entra nela.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — veja o estado de hoje (rode fora da transação):
-- -----------------------------------------------------------------------------
--   SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
--     FROM pg_policy WHERE polrelid = 'public.tenants'::regclass
--    ORDER BY polname;
--
-- Em 2026-08-17 isso devolvia 4 policies, nenhuma delas alcançando Loja sem
-- usuário. Depois de rodar este script devem ser 5.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "tenants_parent_reads_child_stores" ON public.tenants;

-- "Enxergo as Lojas cujo pai é a minha própria Conta." Nada além disso:
--   Gerente → get_current_user_tenant_id() devolve a Conta dele (mesmo com uma
--             Loja em foco no seletor), então ele lê as Lojas filhas dela.
--   Gestor/Atendente → o tenant deles é uma Loja, e Loja não tem filha:
--             conjunto vazio, nenhum acesso novo.
--   Perfil não-ativo → get_current_user_tenant_id() exige status='active' e
--             devolve NULL; `parent_tenant_id = NULL` nunca é verdadeiro.
--
-- Sem depender de is_account_manager_safe(): ela funciona hoje, mas foi ela que
-- deixou cinco policies mortas por meses ao testar só o cargo legado 'agencia'
-- (consertado em 20260813000006). Este predicado se limita sozinho e não pode
-- ser morto por uma renomeação de cargo.
CREATE POLICY "tenants_parent_reads_child_stores"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    kind = 'store'
    -- Redundante em SQL, explícito de propósito: Loja órfã (parent NULL) NÃO é
    -- alcançada por esta regra. Existem três assim em produção — item separado.
    AND parent_tenant_id IS NOT NULL
    AND parent_tenant_id = public.get_current_user_tenant_id()
  );

COMMENT ON POLICY "tenants_parent_reads_child_stores" ON public.tenants IS
  'Deixa o dono de uma Conta ler as Lojas filhas dela, inclusive Loja recém-criada que ainda não tem nenhum usuário. Complementa tenants_account_manager_read, que só enxerga Loja onde já existe perfil (ela caminha pela árvore de profiles, não pela de tenants).';

-- Registro no ledger, já que a aplicação é manual.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260817000006', 'rls_gerente_reads_own_stores')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A policy existe e o ledger recebeu a linha:
--
--   SELECT 'policy' AS item,
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS situacao
--     FROM pg_policy
--    WHERE polrelid = 'public.tenants'::regclass
--      AND polname = 'tenants_parent_reads_child_stores'
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260817000006';
--
-- 2) Ninguém ganhou acesso que não devia. Esta consulta lista, por perfil ativo,
--    quantos tenants a nova regra passa a liberar. O esperado é: Gerente vê as
--    Lojas da Conta dele; Gestor, Atendente e Superadmin veem ZERO por esta
--    policy (o Superadmin já enxerga tudo pelas policies dele):
--
--   SELECT p.role::text AS cargo, p.tenant_id AS tenant_do_perfil,
--          (SELECT count(*) FROM public.tenants t
--            WHERE t.kind = 'store'
--              AND t.parent_tenant_id IS NOT NULL
--              AND t.parent_tenant_id = p.tenant_id) AS lojas_liberadas
--     FROM public.profiles p
--    WHERE p.status = 'active'
--    ORDER BY 1;
--
-- 3) O teste de verdade é pelo produto: entre como Gerente, crie uma Loja em
--    Equipe › "Nova Loja" e confirme que ela aparece na lista e no seletor do
--    topo sem precisar convidar ninguém para dentro dela.
-- =============================================================================
