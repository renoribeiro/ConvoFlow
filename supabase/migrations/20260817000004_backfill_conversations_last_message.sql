-- =============================================================================
-- Desnormaliza a última mensagem na linha da conversa (4/5 — backfill)
--
-- A trigger só atua em mensagem NOVA. Sem este passo, toda conversa já existente
-- apareceria sem prévia até alguém escrever de novo.
--
-- Usa LATERAL: uma passada em `conversations` e, para cada linha, um acesso
-- direto ao índice (contact_id, created_at DESC) criado na migração 2/5 — em vez
-- de uma subconsulta correlacionada reavaliada por coluna.
--
-- Conversa sem nenhuma mensagem NÃO é tocada (o JOIN LATERAL a descarta): fica
-- com as quatro colunas em NULL, que é justamente o estado que o front lê como
-- "sem prévia" e mantém em "Aguardando".
--
-- Idempotente: rodar de novo apenas recalcula os mesmos valores a partir da
-- mensagem mais recente. Serve inclusive como reparo, se a trigger algum dia
-- ficar para trás.
--
-- A direção é normalizada com o MESMO CASE da trigger, senão um 'incoming'
-- histórico violaria o CHECK da migração 1/5.
-- =============================================================================

DO $$
DECLARE
  v_linhas integer;
BEGIN
  WITH ultima AS (
    SELECT c.id AS conversation_id,
           m.content,
           m.direction,
           m.status,
           m.message_type
      FROM public.conversations c
      JOIN LATERAL (
        SELECT msg.content, msg.direction, msg.status, msg.message_type
          FROM public.messages msg
         WHERE msg.contact_id = c.contact_id
           AND msg.tenant_id  = c.tenant_id
         ORDER BY msg.created_at DESC
         LIMIT 1
      ) m ON true
  )
  UPDATE public.conversations c
     SET last_message_content   = u.content,
         last_message_direction = CASE WHEN u.direction IN ('inbound','incoming')
                                       THEN 'inbound'
                                       ELSE 'outbound' END,
         last_message_status    = u.status,
         last_message_type      = u.message_type
    FROM ultima u
   WHERE c.id = u.conversation_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RAISE NOTICE 'Backfill da última mensagem: % conversa(s) atualizada(s).', v_linhas;
END $$;
