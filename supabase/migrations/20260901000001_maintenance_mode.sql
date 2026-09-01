-- =============================================================================
-- Modo de manutenção — leitura pública do estado
-- =============================================================================
-- O interruptor mora em `public.system_settings`, chave 'maintenance_mode':
--
--   {
--     "enabled":   true,
--     "reason":    "Atualização do banco de dados.",
--     "starts_at": null | "2026-09-01T03:00:00.000Z",
--     "ends_at":   null | "2026-09-01T05:00:00.000Z"
--   }
--
-- POR QUE UMA FUNÇÃO, e não um SELECT direto: o RLS de `system_settings` só
-- entrega a tabela ao superadmin, e quem precisa saber que a manutenção está
-- ligada é justamente todo mundo que NÃO é superadmin. Esta função é o único
-- furo, e ele é do tamanho certo: devolve quatro campos escritos para serem
-- lidos pelo usuário final, nunca a tabela.
--
-- POR QUE SEM CRON: a janela é resolvida na leitura, com o relógio do servidor.
-- Um cron que "desliga a manutenção" tem um modo de falha inaceitável aqui —
-- não disparar e deixar a base de clientes trancada. Aritmética não deixa de
-- disparar. E o relógio ser o do servidor impede que o computador do cliente,
-- com a data errada, ligue ou desligue a manutenção sozinho.
--
-- FALHA ABERTA, SEMPRE. Qualquer coisa que dê errado aqui dentro — linha
-- ausente, JSON torto, data impossível — devolve manutenção DESLIGADA. Uma
-- soluçada do banco não pode trancar cliente nenhum.
-- =============================================================================

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
