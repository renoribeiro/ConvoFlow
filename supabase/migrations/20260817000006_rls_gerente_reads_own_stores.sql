-- =============================================================================
-- Gerente não enxerga Loja recém-criada: falta uma policy de SELECT
-- =============================================================================
-- O BUG
--
--   Uma Loja nova nasce sem nenhum usuário dentro. Nesse estado o Gerente que
--   acabou de criá-la NÃO CONSEGUE LÊ-LA. As policies de SELECT de
--   public.tenants hoje são quatro, e nenhuma cobre esse caso:
--
--     "Super admins can view all tenants"    → is_super_admin()      (não é o caso)
--     "Super admins can manage all tenants"  → is_super_admin()      (não é o caso)
--     "Users can view own tenant"            → id = get_current_user_tenant_id()
--                                              A Loja não é a Conta dele.
--     tenants_account_manager_read           → is_account_manager_safe()
--                                              AND is_tenant_in_my_descendants(id)
--
--   O problema está na última. `is_tenant_in_my_descendants()` não caminha pela
--   árvore de TENANTS — ela caminha pela árvore de PROFILES e pergunta se algum
--   perfil abaixo do meu tem `tenant_id` igual ao alvo:
--
--     WITH RECURSIVE tree AS (... perfis descendentes do meu ...)
--     SELECT 1 FROM profiles p JOIN tree t ON p.id = t.id
--      WHERE p.tenant_id = target_tenant_id
--
--   Loja sem gente = nenhum perfil aponta para ela = FALSE. A linha existe no
--   banco e fica invisível para o dono dela.
--
--   Conferido em produção (2026-08-17): das Lojas da Conta "Mario Acioli", a
--   única existente (EncaixaRH) é visível apenas porque UM perfil da subárvore
--   do Gerente aponta para ela. Todos os 5 tenants do banco têm exatamente 1
--   perfil — por isso ninguém tinha esbarrado nisto ainda.
--
-- POR QUE ISTO VIRA URGENTE AGORA
--
--   Até hoje não existia jeito de criar Loja pelo produto, então Loja vazia era
--   uma raridade de migração feita à mão. Com a edge function `create-store`,
--   Loja vazia passa a ser o ESTADO NORMAL do primeiro segundo de vida de toda
--   Loja. Sem esta policy o fluxo novo quebra em três pontos:
--
--     1. a lista "Lojas da sua Conta" (useMyStores) volta vazia;
--     2. o seletor de Loja do topo (StoreSwitcher) não lista a Loja nova;
--     3. entrar nela falha — canUseActiveTenant() faz o próprio SELECT em
--        tenants, não acha a linha e descarta a troca.
--
--   O INSERT em si nunca foi o problema: ele roda com a service key, na edge
--   function, e funciona. O que falta é a LEITURA de volta.
--
-- O QUE ESTA POLICY DÁ, EXATAMENTE
--
--   "Enxergo as Lojas cujo pai é a minha própria Conta." Nada além disso.
--
--   - Gerente: `get_current_user_tenant_id()` devolve o `profiles.tenant_id`
--     dele, que é sempre a Conta (mesmo quando ele está com uma Loja em foco
--     pelo seletor). Logo, ele passa a ler as Lojas filhas da Conta dele.
--   - Gestor e Atendente: o tenant deles é uma LOJA, e Loja não tem filha.
--     A policy devolve conjunto vazio — ninguém ganha acesso novo.
--   - Perfil suspenso/pendente/excluído: `get_current_user_tenant_id()` exige
--     status='active' e devolve NULL. `parent_tenant_id = NULL` nunca é
--     verdadeiro, então não vaza nada.
--
-- POR QUE NÃO USA is_account_manager_safe()
--
--   Ela funciona hoje: desde 20260813000006 testa
--   role::text IN ('gerente','agencia','account_manager'), e devolve TRUE para
--   os dois Gerentes ativos em produção (conferido em 2026-08-17). A policy
--   funcionaria com ela.
--
--   Mesmo assim ela fica de fora, e o motivo é o histórico: essa mesma função
--   testava só 'agencia' — valor que NENHUMA linha usa — e por causa disso
--   deixou CINCO policies mortas por meses, incluindo a que deveria mostrar as
--   Lojas ao Gerente. O predicado abaixo não precisa de nome de cargo para ser
--   correto: ele já se limita sozinho, porque só Conta tem filha. Uma renomeação
--   futura de cargo não tem como matar esta policy de novo.
--
-- O QUE FICA DE FORA, DE PROPÓSITO
--
--   Loja com `parent_tenant_id IS NULL` continua invisível por aqui. Quando
--   esta migração foi escrita havia duas assim em produção (Loja - Yuri
--   Saldanha e Loja - Bruno Moura); elas também escapavam do trigger de vagas.
--   Regularizar esses dados era item separado — esta migração não tocou em
--   nenhuma linha.
--
--   ATUALIZAÇÃO 2026-08-20: as duas foram removidas
--   (docs/remover_lojas_orfas.sql) e hoje nenhuma Loja tem parent_tenant_id
--   nulo. A policy segue escrita do mesmo jeito: o schema continua permitindo o
--   caso, e o predicado explícito deixa à vista que ele fica de fora.
--
-- Idempotente: DROP POLICY IF EXISTS antes do CREATE.
-- Transacional: ou entra tudo, ou não entra nada.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "tenants_parent_reads_child_stores" ON public.tenants;

CREATE POLICY "tenants_parent_reads_child_stores"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    kind = 'store'
    -- Redundante em SQL (`NULL = x` nunca é TRUE), explícito de propósito:
    -- deixa à vista que Loja órfã não é alcançada por esta regra.
    AND parent_tenant_id IS NOT NULL
    AND parent_tenant_id = public.get_current_user_tenant_id()
  );

COMMENT ON POLICY "tenants_parent_reads_child_stores" ON public.tenants IS
  'Deixa o dono de uma Conta ler as Lojas filhas dela, inclusive Loja recém-criada que ainda não tem nenhum usuário. Complementa tenants_account_manager_read, que só enxerga Loja onde já existe perfil (ela caminha pela árvore de profiles, não pela de tenants).';

-- Registro no ledger. O projeto aplica migração pelo SQL Editor — sem esta
-- linha, a migração ficaria aplicada no banco e ausente do histórico, que é
-- exatamente a dessincronia que já existe aqui (81 de 94 arquivos locais sem
-- registro). `statements` fica NULL de propósito: a coluna é preenchida pela
-- CLI quando é ela quem aplica, e reproduzir o formato à mão só criaria um
-- registro falso.
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260817000006', 'rls_gerente_reads_own_stores')
ON CONFLICT (version) DO NOTHING;

COMMIT;
