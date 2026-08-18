-- =============================================================================
-- ConvoFlow — limpar as liberações manuais que ficaram na linha da LOJA
-- =============================================================================
-- ⚠️ NÃO É MIGRAÇÃO E NÃO ENTRA NO LEDGER. É faxina de dado, opcional, e a
--    decisão de rodar é do Yuri. O sistema funciona sem rodar isto.
--
-- -----------------------------------------------------------------------------
-- POR QUE ISTO EXISTE
-- -----------------------------------------------------------------------------
-- O botão "Liberar Manualmente" da Administração escrevia na Conta do usuário
-- SELECIONADO. Para um Gestor, essa Conta é a LOJA dele — foi assim que a
-- EncaixaRH ficou com `manual_access_granted = true` na própria linha.
--
-- Depois de `tenant_access_state` (migração 20260818000001), quem responde pelo
-- acesso de uma Loja COM pai é a Conta pai. A marca na linha da Loja deixou de
-- ser lida: é dado morto que só engana quem for ler a tabela depois.
--
-- Este script apaga essas marcas mortas. Ele NÃO tira acesso de ninguém — a
-- cláusula WHERE só alcança Loja cuja Conta pai já está liberada.
--
-- -----------------------------------------------------------------------------
-- ORDEM OBRIGATÓRIA
-- -----------------------------------------------------------------------------
--   1º  docs/aplicar_tenant_access_state.sql   (cria a função)
--   2º  este script
--
-- Invertendo a ordem você TRANCA a EncaixaRH: sem a função, o front cai no
-- caminho de degradação e avalia a própria linha da Loja — que este script
-- acabou de zerar. O bloco de segurança logo abaixo recusa a execução se a
-- função ainda não existir, então a ordem errada falha em vez de estragar.
--
-- -----------------------------------------------------------------------------
-- ANTES DE RODAR — veja exatamente o que será tocado (rode sozinho):
-- -----------------------------------------------------------------------------
--   SELECT t.name AS loja, t.manual_access_granted AS flag_na_loja,
--          c.name AS conta_pai,
--          c.subscription_status AS pai_assinatura, c.manual_access_granted AS pai_manual,
--          CASE WHEN c.subscription_status = 'active' OR c.manual_access_granted IS TRUE
--               THEN 'pai liberado -> limpar e seguro'
--               ELSE 'PAI TRANCADO -> nao sera limpo'
--          END AS veredito
--     FROM public.tenants t
--     JOIN public.tenants c ON c.id = t.parent_tenant_id
--    WHERE t.kind = 'store'
--      AND t.parent_tenant_id IS NOT NULL
--      AND t.manual_access_granted IS TRUE
--    ORDER BY t.name;
--
-- Em 2026-08-18 isso devolvia UMA linha:
--   EncaixaRH | true | Mario Acioli | NULL | true | pai liberado -> limpar e seguro
--
-- E a checagem de segurança devolvia ZERO:
--   lojas que ficariam trancadas ao limpar = 0
--
-- As Lojas órfãs ("Loja - Yuri Saldanha", "Loja - Bruno Moura") NÃO são
-- alcançadas: o WHERE exige parent_tenant_id IS NOT NULL. Loja órfã responde
-- por si mesma, então a marca dela continua sendo lida e continua valendo.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Trava 1 — a função de herança precisa existir ANTES desta limpeza.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'tenant_access_state'
  ) THEN
    RAISE EXCEPTION
      'Rode docs/aplicar_tenant_access_state.sql primeiro. Sem a funcao de heranca, limpar a marca da Loja tranca o Gestor dela.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Trava 2 — nenhuma Loja pode perder acesso por causa desta limpeza.
-- Se alguma Loja tem a marca e a Conta pai NÃO está liberada, aborta tudo: esse
-- caso é decisão de negócio (liberar a Conta), não faxina de dado.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_risco integer;
BEGIN
  SELECT count(*) INTO v_risco
    FROM public.tenants t
    JOIN public.tenants c ON c.id = t.parent_tenant_id
   WHERE t.kind = 'store'
     AND t.parent_tenant_id IS NOT NULL
     AND t.manual_access_granted IS TRUE
     AND c.subscription_status IS DISTINCT FROM 'active'
     AND c.manual_access_granted IS DISTINCT FROM true;

  IF v_risco > 0 THEN
    RAISE EXCEPTION
      '% Loja(s) perderiam acesso: a marca esta na Loja e a Conta pai nao esta liberada. Libere a Conta primeiro e rode de novo.', v_risco;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Auditoria ANTES do UPDATE — o histórico precisa registrar o que existia.
-- `revoked` é honesto: o que foi revogado é a marca DA LOJA. O acesso da pessoa
-- não muda, e a nota diz isso, para ninguém ler o histórico e achar que houve
-- corte de acesso.
-- -----------------------------------------------------------------------------
INSERT INTO public.tenant_access_events (tenant_id, action, source, actor_user_id, note)
SELECT t.id, 'revoked', 'manual', NULL,
       'Faxina 2026-08-18: marca manual removida da Loja. O acesso passou a ser herdado da Conta '
       || c.name || ', que segue liberada. Nada muda para os usuarios desta Loja.'
  FROM public.tenants t
  JOIN public.tenants c ON c.id = t.parent_tenant_id
 WHERE t.kind = 'store'
   AND t.parent_tenant_id IS NOT NULL
   AND t.manual_access_granted IS TRUE
   AND (c.subscription_status = 'active' OR c.manual_access_granted IS TRUE);

-- -----------------------------------------------------------------------------
-- A limpeza. Idempotente: rodar de novo casa zero linhas.
-- A condição do pai liberado é repetida aqui de propósito — a Trava 2 já abortou
-- o caso perigoso, mas o UPDATE não depende dela para estar correto.
-- -----------------------------------------------------------------------------
UPDATE public.tenants t
   SET manual_access_granted    = false,
       manual_access_granted_by = NULL,
       manual_access_granted_at = NULL,
       updated_at               = now()
  FROM public.tenants c
 WHERE c.id = t.parent_tenant_id
   AND t.kind = 'store'
   AND t.parent_tenant_id IS NOT NULL
   AND t.manual_access_granted IS TRUE
   AND (c.subscription_status = 'active' OR c.manual_access_granted IS TRUE);

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) Nenhuma Loja com pai carrega mais a marca (esperado: 0):
--
--   SELECT count(*) AS sobrou
--     FROM public.tenants
--    WHERE kind = 'store' AND parent_tenant_id IS NOT NULL
--      AND manual_access_granted IS TRUE;
--
-- 2) Ninguém perdeu acesso. Esta consulta reproduz a regra da funcao e deve dar
--    o MESMO resultado de antes da faxina:
--
--   SELECT t.name AS tenant,
--          CASE
--            WHEN COALESCE(c.subscription_status, t.subscription_status) = 'active' THEN 'paid'
--            WHEN COALESCE(c.manual_access_granted, t.manual_access_granted) IS TRUE THEN 'manual'
--            ELSE 'locked'
--          END AS situacao
--     FROM public.tenants t
--     LEFT JOIN public.tenants c
--            ON t.kind = 'store' AND t.parent_tenant_id IS NOT NULL AND c.id = t.parent_tenant_id
--    ORDER BY situacao, t.name;
--
--    Esperado (igual ao de antes): 5 liberados e so "Loja - Bruno Moura" locked.
--
-- 3) As órfãs continuam com a marca delas (esperado: "Loja - Yuri Saldanha"):
--
--   SELECT name, manual_access_granted
--     FROM public.tenants
--    WHERE kind = 'store' AND parent_tenant_id IS NULL;
--
-- =============================================================================
-- ROLLBACK (só faz sentido logo depois; devolve a marca à Loja)
--   UPDATE public.tenants
--      SET manual_access_granted = true, manual_access_granted_at = now()
--    WHERE id = '2165be9f-b6bb-49fb-ba6a-1dec6840c45a';  -- EncaixaRH
-- =============================================================================
