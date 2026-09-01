-- =============================================================================
-- APLICAR — Modo de manutenção (leitura pública do estado)
-- =============================================================================
-- Rodar no SQL Editor do Supabase, de uma vez. Idempotente.
--
-- O que faz: cria `public.maintenance_state()` e libera EXECUTE para anon e
-- authenticated. NÃO liga a manutenção — só ensina o sistema a perguntar se ela
-- está ligada. Nenhuma linha de dado é criada, alterada ou apagada aqui.
--
-- Equivalente ao arquivo de registro:
--   supabase/migrations/20260901000001_maintenance_mode.sql
--
-- Runbook: docs/RUNBOOK_modo_manutencao.md
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.maintenance_state()
RETURNS TABLE (
  active     boolean,
  scheduled  boolean,
  reason     text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  server_now timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_value   jsonb;
  v_enabled boolean;
  v_reason  text;
  v_start   timestamptz;
  v_end     timestamptz;
  v_now     timestamptz := now();
BEGIN
  -- O padrão é DESLIGADO. Todo caminho de erro abaixo cai neste estado.
  active     := false;
  scheduled  := false;
  reason     := NULL;
  starts_at  := NULL;
  ends_at    := NULL;
  server_now := v_now;

  BEGIN
    SELECT s.value INTO v_value
      FROM public.system_settings s
     WHERE s.key = 'maintenance_mode';

    IF v_value IS NULL THEN
      RETURN NEXT; RETURN;
    END IF;

    v_enabled := COALESCE((v_value->>'enabled')::boolean, false);
    v_reason  := NULLIF(btrim(COALESCE(v_value->>'reason', '')), '');
    v_start   := (v_value->>'starts_at')::timestamptz;
    v_end     := (v_value->>'ends_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    -- JSON fora do formato, data impossível, o que for: ninguém fica trancado.
    RETURN NEXT; RETURN;
  END;

  IF NOT v_enabled THEN
    RETURN NEXT; RETURN;
  END IF;

  -- Janela encerrada: resolve sozinha, sem cron e sem ninguém precisar lembrar.
  IF v_end IS NOT NULL AND v_now >= v_end THEN
    RETURN NEXT; RETURN;
  END IF;

  -- Agendada e ainda não começou: o sistema segue aberto.
  scheduled := v_start IS NOT NULL AND v_now < v_start;
  active    := NOT scheduled;

  reason    := v_reason;
  starts_at := v_start;
  ends_at   := v_end;

  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.maintenance_state() IS
  'Estado do modo de manutenção, legível por qualquer visitante. Falha aberta: '
  'qualquer erro devolve manutenção desligada. A janela é resolvida com o '
  'relógio do servidor, sem cron.';

-- A tela de login precisa do aviso ANTES de existir sessão — daí o `anon`.
-- O que a função devolve é texto escrito pelo superadmin para ser lido pelo
-- usuário final; não há nada aqui que já não fosse público por destino.
GRANT EXECUTE ON FUNCTION public.maintenance_state() TO anon, authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260901000001', 'maintenance_mode')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- =============================================================================
-- DEPOIS DE RODAR — conferir
-- =============================================================================
-- 1) A função existe, o ledger recebeu a linha e ela responde "desligado":
--
--   SELECT 'funcao' AS item,
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS situacao
--     FROM pg_proc
--    WHERE proname = 'maintenance_state' AND pronamespace = 'public'::regnamespace
--   UNION ALL
--   SELECT 'ledger',
--          CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END
--     FROM supabase_migrations.schema_migrations
--    WHERE version = '20260901000001';
--
--   SELECT * FROM public.maintenance_state();
--   -- esperado: active=false, scheduled=false, tudo nulo. Se vier active=true
--   -- sem ninguém ter ligado, PARE e leia o runbook.
--
-- 2) O anon consegue perguntar (é o que a tela de login usa):
--
--   SELECT has_function_privilege('anon', 'public.maintenance_state()', 'EXECUTE') AS anon_pode,
--          has_function_privilege('authenticated', 'public.maintenance_state()', 'EXECUTE') AS logado_pode;
--   -- esperado: t, t
-- =============================================================================
