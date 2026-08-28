-- =============================================================================
-- ① Desinchar net._http_response  (a maior economia isolada do banco)
-- =============================================================================
--
-- MEDIDO em 2026-08-28, janela de 47,3 h do pg_stat_statements:
--
--   O coletor de lixo do pg_net roda 155.500 vezes (54,8 por MINUTO) e responde
--   por 59,8% do tempo de execucao e 92,7% de TODO o trafego de buffer do banco.
--   Ele apaga 11.922 linhas no total — 0,077 linha por chamada. Ou seja: pelo
--   menos 92,3% das chamadas nao acham NADA e mesmo assim leem 6,7 MB cada uma.
--
--   Motivo: net._http_response tem 140 MB de heap (17.876 blocos) para guardar
--   1.495 linhas vivas. O TTL de 6 h funciona — as linhas SAO apagadas — mas o
--   autovacuum nunca trunca o arquivo, entao toda varredura percorre um cadaver
--   de 140 MB para encontrar ~0 linhas.
--
-- O QUE ESTE SCRIPT FAZ: reescreve a tabela, devolvendo ~140 MB ao disco e
-- derrubando o custo de cada varredura do coletor para perto de zero.
--
-- -----------------------------------------------------------------------------
-- POR QUE ESTE SCRIPT NAO USA BLOCO `DO $$ ... $$;`
-- -----------------------------------------------------------------------------
-- VACUUM FULL NAO PODE rodar dentro de transacao nem dentro de bloco DO — o
-- PostgreSQL recusa com "VACUUM cannot run inside a transaction block". A regra
-- da armadilha 4 do CLAUDE.md (bloco DO unico) existe para garantir ATOMICIDADE
-- em scripts que ESCREVEM dados. Aqui nao ha escrita de dados: o VACUUM FULL
-- reescreve a mesma tabela com o mesmo conteudo. Nao existe estado parcial
-- perigoso — ou ele termina, ou a tabela continua exatamente como estava.
--
-- Por isso o script e dividido em PARTES que voce roda em sequencia.
--
-- -----------------------------------------------------------------------------
-- AVISO DE TRAVA — leia antes de rodar
-- -----------------------------------------------------------------------------
-- VACUUM FULL pega ACCESS EXCLUSIVE na tabela durante toda a operacao.
--
--   Duracao esperada: 1 a 3 segundos (pior caso ~10 s).
--   Base do calculo: 140 MB de leitura sequencial + gravacao de 1.495 linhas
--   (~30 blocos) + reconstrucao de um indice de 5,6 MB. Cache hit do banco esta
--   em 99,92%, entao quase tudo vem da memoria.
--
--   O QUE PARA enquanto ele roda:
--     * o worker do pg_net, ao gravar respostas HTTP que chegarem nesses
--       segundos — elas ficam esperando, NAO se perdem;
--     * o proprio coletor de lixo do pg_net.
--
--   O QUE **NAO** PARA:
--     * net.http_post() — ele escreve em net.http_request_queue, que e OUTRA
--       tabela. Os 6 cron jobs disparam normalmente durante a janela;
--     * o aplicativo inteiro. NADA em `public` toca net._http_response.
--       Conversas, mensagens, login, webhooks de entrada: tudo segue igual.
--
--   Impacto para o usuario final: nenhum.
--
-- -----------------------------------------------------------------------------
-- PERMISSAO — ja conferida
-- -----------------------------------------------------------------------------
-- A tabela pertence a `supabase_admin`, nao a voce (`postgres`). Mesmo assim o
-- VACUUM FULL FUNCIONA, porque o Supabase concede o privilegio MAINTAIN (novo
-- no PG 17) ao papel postgres. Conferido: has_table_privilege(MAINTAIN) = true.
--
-- O que voce NAO consegue fazer (ver o runbook, secao "por que nao da para
-- ajustar o autovacuum"): ALTER TABLE ... SET (autovacuum_*) e pg_net.ttl.
-- =============================================================================


-- =============================================================================
-- PARTE A — ANTES (somente leitura). Rode e guarde o resultado.
-- =============================================================================

SELECT
  pg_size_pretty(pg_relation_size('net._http_response'))       AS heap_antes,
  pg_size_pretty(pg_indexes_size('net._http_response'))        AS indice_antes,
  pg_size_pretty(pg_total_relation_size('net._http_response')) AS total_antes,
  pg_relation_size('net._http_response') / 8192                AS blocos_antes,
  (SELECT count(*) FROM net._http_response)                    AS linhas_vivas,
  pg_size_pretty(pg_database_size(current_database()))         AS banco_antes;

-- Esperado (medido em 2026-08-28):
--   heap_antes 140 MB | indice_antes 5632 kB | total_antes 145 MB
--   blocos_antes 17876 | linhas_vivas ~1500 | banco_antes ~758 MB


-- =============================================================================
-- PARTE B — O COMANDO. Rode SOZINHO, sem mais nada selecionado.
-- =============================================================================
--
-- No SQL Editor do Supabase: selecione APENAS a linha abaixo e rode.
-- Se voce rodar junto com outra coisa, o editor abre transacao e o comando
-- falha com "VACUUM cannot run inside a transaction block".

VACUUM (FULL, ANALYZE, VERBOSE) net._http_response;


-- =============================================================================
-- PARTE C — DEPOIS (somente leitura). Confirme que funcionou.
-- =============================================================================

SELECT
  pg_size_pretty(pg_relation_size('net._http_response'))       AS heap_depois,
  pg_size_pretty(pg_indexes_size('net._http_response'))        AS indice_depois,
  pg_size_pretty(pg_total_relation_size('net._http_response')) AS total_depois,
  pg_relation_size('net._http_response') / 8192                AS blocos_depois,
  (SELECT count(*) FROM net._http_response)                    AS linhas_vivas,
  pg_size_pretty(pg_database_size(current_database()))         AS banco_depois;

-- CRITERIO DE SUCESSO:
--   blocos_depois deve cair de ~17.876 para algo na casa das DEZENAS (< 200).
--   linhas_vivas deve continuar parecida com antes (o VACUUM nao apaga nada —
--   o numero so varia porque o TTL de 6 h segue rodando).
--   banco_depois deve cair ~140 MB.
--
-- SE blocos_depois continuar alto: o VACUUM FULL nao rodou (provavelmente foi
-- executado dentro de transacao). Repita a PARTE B sozinha.


-- =============================================================================
-- PARTE D — medir o efeito real (rodar 24 h DEPOIS, somente leitura)
-- =============================================================================
--
-- Esta e a prova de que a economia aconteceu. Compare "blocos_por_chamada" com
-- o valor medido antes: 843.

SELECT
  calls                                                             AS chamadas,
  round((shared_blks_hit + shared_blks_read)::numeric / NULLIF(calls,0), 0)
                                                                    AS blocos_por_chamada,
  round(total_exec_time::numeric / 1000.0, 1)                       AS segundos_totais,
  round((100.0 * (shared_blks_hit + shared_blks_read)
        / (SELECT sum(shared_blks_hit + shared_blks_read)
             FROM extensions.pg_stat_statements))::numeric, 2)      AS pct_do_banco
FROM extensions.pg_stat_statements
WHERE query LIKE '%net._http_response%'
  AND query LIKE '%DELETE%';

-- ANTES: blocos_por_chamada 843 | pct_do_banco 92,71
-- ALVO : blocos_por_chamada < 20 | pct_do_banco < 10
--
-- Obs.: pg_stat_statements acumula desde o ultimo reset. Para uma comparacao
-- limpa, ou espere alguns dias (os numeros novos diluem os velhos), ou peca um
-- reset — que e ESCRITA e precisa de autorizacao separada.


-- =============================================================================
-- ELE VAI INCHAR DE NOVO
-- =============================================================================
-- Este script trata o SINTOMA. A tabela volta a inchar enquanto os 6 cron jobs
-- despejarem 7.488 respostas HTTP por dia nela e o autovacuum nao truncar.
--
-- Voce NAO consegue ajustar o autovacuum desta tabela (ver runbook). As duas
-- saidas duraveis sao:
--   1. reduzir a fonte — os 4 cron jobs por minuto que nunca acham trabalho
--      (decisao da Parte 3 da investigacao);
--   2. repetir este VACUUM FULL de tempos em tempos (mensal ja resolve).
--
-- Reavalie o tamanho com a PARTE A daqui a 30 dias.
