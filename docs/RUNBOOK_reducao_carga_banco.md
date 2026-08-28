# Runbook — reduzir a carga do banco

> ## ✅ TUDO APLICADO EM PRODUÇÃO — 2026-08-28
>
> Este runbook virou **registro do que foi feito**, não lista de tarefas. Os
> scripts em `docs/` continuam válidos para repetir a operação no futuro.
>
> | Item | Resultado medido |
> |---|---|
> | ① `VACUUM FULL net._http_response` | heap **140 MB → 1.752 kB** (17.876 → 219 blocos), 1.522 linhas preservadas |
> | ③ Poda `cron.job_run_details` | **634.926 → 42.320** linhas; heap **573 MB → 24 MB**; índice **14 MB → 944 kB** |
> | ③ Retenção diária | cron `purge-cron-job-run-details-daily`, jobid 11, `15 4 * * *` |
> | ⑦ Índice em `conversations` | criado + ledger `20260828000001` |
> | Crons `*/5` | 4 jobs desacelerados: **7.488 → 1.440 posts/dia (−80,8%)** |
> | Salvaguarda | cron `vacuum-http-response-monthly`, jobid 12, `0 5 1 * *` |
> | **Banco inteiro** | **758 MB → 52 MB (−93,1%)** |
>
> Também aplicados no mesmo dia (fora do escopo original deste runbook):
> `20260828000002` (conserta `dequeue_next_job`) e `20260828000003` (remove
> `public.jobs`). Ver `docs/RELATORIO_fila_de_jobs.md`.

**Medição de origem:** `pg_stat_statements`, janela de 47,3 h
(2026-08-26 19:14 → 2026-08-28 18:32 UTC). Banco: 758 MB, 593.939 chamadas,
413,9 s de execução, 141.378.301 blocos de buffer, cache hit 99,92%.

**O achado que orienta tudo:** o aplicativo inteiro é **6,68% do tempo** e
**0,12% dos blocos**. Os outros ~93% são a máquina de cron + `pg_net` conversando
com ela mesma.

| Onde vai a carga | % tempo | % blocos |
|---|---|---|
| `pg_net` (coletor + http_post) | 70,93% | **94,86%** |
| bookkeeping do `cron.job_run_details` | 14,00% | 0,60% |
| RPC do job-worker | 3,86% | 3,03% |
| outro trabalho de cron | 1,58% | 0,95% |
| **aplicativo (PostgREST)** | **6,68%** | **0,12%** |
| resto (BEGIN/COMMIT/auth) | 2,95% | 0,45% |

---

## Ordem de execução

Rode **nesta ordem**. ① primeiro porque é a maior economia e é independente de
tudo. ③ depois porque é a maior liberação de disco. ⑦ por último porque não muda
nada hoje.

| # | O quê | Arquivo | Trava | Duração | Volta atrás? |
|---|---|---|---|---|---|
| ① | Desinchar `net._http_response` | `docs/vacuum_full_http_response.sql` | ACCESS EXCLUSIVE em tabela do `net` | 1–3 s | não precisa (não altera dados) |
| ③ | Podar `cron.job_run_details` | `docs/limpar_cron_job_run_details.sql` | transação + ACCESS EXCLUSIVE | 10–40 s + 5–20 s | **não** (apaga log) |
| ⑦ | Índice em `conversations` | `docs/aplicar_indice_conversations.sql` | ACCESS EXCLUSIVE, 131 linhas | ms | `DROP INDEX` |

O item ⑤ (polling do frontend) é PR separado — ver o fim deste arquivo.

---

## ① Desinchar `net._http_response`

**Ganho:** ~92,7% do tráfego de buffer e ~59,8% do tempo de execução do banco.

**Por quê:** o coletor de lixo do pg_net roda **54,8 vezes por minuto**, lê
**6,7 MB por chamada** e não acha nada em ≥92,3% delas — porque a tabela tem
140 MB de heap para 1.495 linhas vivas.

### Rodar

1. Abra `docs/vacuum_full_http_response.sql`.
2. Rode a **PARTE A** (leitura) e guarde o resultado.
3. Rode a **PARTE B** — `VACUUM (FULL, ANALYZE, VERBOSE) net._http_response;`
   **selecionando APENAS essa linha**. Se rodar junto com outra coisa, o editor
   abre transação e falha com `VACUUM cannot run inside a transaction block`.
4. Rode a **PARTE C** e confira.

### Conferir depois

| Medida | Antes | Alvo |
|---|---|---|
| `blocos_depois` | 17.876 | **< 200** |
| `total_depois` | 145 MB | < 5 MB |
| `banco_depois` | ~758 MB | ~618 MB |

E, **24 h depois**, a PARTE D: `blocos_por_chamada` deve cair de **843** para
**< 20**.

### O que trava, exatamente

Só o worker do pg_net, por 1–3 segundos:

- respostas HTTP que chegarem nesses segundos **esperam** — não se perdem;
- `net.http_post()` **não para**: ele escreve em `net.http_request_queue`, outra
  tabela. Os 6 crons disparam normalmente;
- **nada em `public` toca essa tabela.** Conversas, mensagens, login: intactos.

**Impacto para o usuário final: nenhum.**

### Por que não dá para ajustar o autovacuum e evitar que inche de novo

Você perguntou se dá para ajustar o autovacuum da tabela em vez de repetir o
VACUUM. **Não dá — e não é questão de migração, é permissão.** Conferido:

| Caminho | Resultado | Motivo |
|---|---|---|
| `ALTER TABLE net._http_response SET (autovacuum_vacuum_scale_factor = ...)` | ❌ falha | A tabela é de `supabase_admin`. Você é `postgres` e `pg_has_role(..., 'MEMBER')` = **false**. `ALTER TABLE` exige ser dono. |
| `SET pg_net.ttl = '1 hour'` (hoje 6 h) | ❌ falha | O parâmetro tem `context = 'superuser'` e `rolsuper` do `postgres` é **false**. |
| `ALTER DATABASE postgres SET pg_net.ttl = ...` | ❌ falha | Mesmo motivo. |
| `VACUUM FULL net._http_response` | ✅ **funciona** | O Supabase concede `MAINTAIN` (privilégio novo do PG 17) ao `postgres`. Conferido: `has_table_privilege(MAINTAIN)` = **true**. É exatamente por isso que ① é possível. |

Ou seja: você tem permissão para **limpar**, não para **configurar**. Não existe
migração que resolva — migração roda com o mesmo papel `postgres`.

**As três saídas reais, em ordem de preferência:**

1. **Reduzir a fonte** — são 7.488 respostas HTTP por dia vindas dos crons.
   Quatro dos cinco jobs por minuto nunca acham trabalho (ver Parte 3 abaixo).
   Cortar ou espaçar esses jobs ataca a causa.
2. **Repetir o VACUUM FULL** de tempos em tempos. Mensal já basta: são 1–3 s de
   trava. Dá para agendar num cron próprio, mas **confirme antes** que o pg_cron
   aceita `VACUUM FULL` neste projeto (ele roda comandos fora de transação
   explícita, mas vale testar manualmente uma vez antes de confiar).
3. **Pedir ao suporte do Supabase** para baixar `pg_net.ttl` de 6 h para 1 h.
   Reduziria a janela retida em 6×. É o único caminho para a configuração.

---

## ③ Podar `cron.job_run_details`

**Ganho:** 587 MB de 758 MB — **77% do disco**.

**Contexto:** 634.166 linhas desde 2025-08-02, nunca podadas. Cresce
**7.488 linhas/dia ≈ 218 MB/mês**, e isso **não depende de quantos clientes você
tem**. Foi o que estourou o NANO.

### O que está sendo jogado fora — resposta à sua pergunta

Você pediu para eu olhar as 208.544 falhas antes de sumirem. Olhei a tabela
inteira agrupada por `(jobid, status, mensagem)`. **Existem exatamente 7 grupos
em 634 mil linhas, e apenas DUAS mensagens distintas:**

| jobid | job | status | mensagem | linhas | período |
|---|---|---|---|---|---|
| 1 | job-worker | `failed` | `ERROR: schema "net" does not exist` | **208.544** | 2025-08-02 → 2026-06-05 |
| 1 | job-worker | `succeeded` | `1 row` | 121.282 | 2026-06-05 → 2026-08-28 |
| 2 | process-campaign-dispatch | `succeeded` | `1 row` | 121.282 | 2026-06-05 → 2026-08-28 |
| 4 | process-followup-dispatch | `succeeded` | `1 row` | 96.782 | 2026-06-22 → 2026-08-28 |
| 5 | webhook-dispatcher | `succeeded` | `1 row` | 83.681 | 2026-07-01 → 2026-08-28 |
| 6 | process-report-dispatch | `succeeded` | `1 row` | 2.568 | 2026-08-19 → 2026-08-28 |
| 3 | whatsapp-policy-watch | `succeeded` | `1 row` | 10 | 2026-06-22 → 2026-08-24 |

**Não há nada além de "schema net does not exist".** Não é uma amostra — o
agrupamento cobre a tabela toda e os 7 grupos somam o total. Não existe segunda
causa escondida, erro intermitente, nem mensagem que aparece só em algumas
linhas.

**O que a falha significa:** por **10 meses** (2025-08-02 → 2026-06-05) o
`job-worker` chamou `net.http_post()` sem o `pg_net` visível. O job **nunca
rodou** nesse período. Corrigido em 2026-06-05.

**O único valor histórico é o registro de que houve 10 meses de falha
silenciosa** — e isso agora está escrito no cabeçalho do script, versionado no
git. Não há motivo para guardar 208.544 cópias da mesma frase. Se ainda assim
quiser o dump cru, a consulta está comentada na PARTE A do script.

### Rodar

1. **PARTE A** (leitura) — guarde o resultado.
2. **PARTE B** — bloco `DO` único com 4 guardas. Conforme a armadilha 4 do
   CLAUDE.md: guardas, escrita e conferência no MESMO bloco, então qualquer
   `RAISE EXCEPTION` desfaz o `DELETE` inteiro. 10–40 s.
3. **PARTE C** — `VACUUM (FULL, ANALYZE) cron.job_run_details;` **sozinho**.
   Sem isso a contagem cai mas **o disco não volta**: o `DELETE` removeu as
   linhas mais antigas, que ficam no COMEÇO do arquivo, e `VACUUM` comum só
   devolve espaço que está no FIM. 5–20 s.
4. **PARTE D** — conferir.

### Conferir depois

| Medida | Antes | Alvo |
|---|---|---|
| linhas | 634.166 | ~42.000 |
| mais antiga | 2025-08-02 | ≤ 7 dias atrás |
| heap | 573 MB | 30–60 MB |
| banco | ~758 MB | **~170 MB** (com ① feito) |

### Retenção — PARTE E, autorização separada

Sem isso volta a crescer 218 MB/mês.

**Como estou fazendo:** um **cron job novo, o sétimo**, rodando **1× por dia às
04:15 UTC** (01:15 Brasília), que apaga o que passar de 7 dias.

**Por que precisa de cron próprio:** o pg_cron 1.6 não tem retenção embutida.
A alternativa seria desligar o log com `cron.log_run = off`, mas esse parâmetro
tem `context = 'postmaster'` (conferido em `pg_settings`) — exige reiniciar o
servidor e editar o arquivo de configuração, o que você não alcança em Supabase
gerenciado.

**E, mesmo se alcançasse, seria a escolha errada:** foram 10 meses de falha
silenciosa do job-worker que só apareceram **porque havia log**. Manter o log e
podar é melhor que não ter log.

**Custo do job novo:** 1 execução/dia apagando ~7.488 linhas. Irrelevante perto
do que remove.

⚠️ A poda diária mantém a **contagem** baixa mas não devolve disco sozinha
(mesmo motivo da PARTE C). O arquivo estabiliza em ~50–60 MB. Confira a cada
alguns meses com a PARTE D e repita a PARTE C se tiver crescido.

---

## ⑦ Índice em `conversations`

**Ganho hoje: zero.** É preventivo. Rodar por último.

`docs/aplicar_indice_conversations.sql` + o par em
`supabase/migrations/20260828000001_idx_conversations_tenant_archived_last_message.sql`.
Bloco `DO` único com guardas e o `INSERT` no ledger.

**Não se assuste** ao rodar `EXPLAIN` depois e ver `Seq Scan`: com 131 linhas o
planejador está certo em ignorar o índice. Ele passa a valer quando uma Loja
tiver dezenas de milhares de conversas — aí a ordenação por `last_message_at`
sem índice vira sort de tabela inteira, a cada 30 s, por aba aberta.

**O índice do `jobs` está retido** até você decidir a Parte 3.

### Conferir depois

As duas linhas do bloco final precisam dizer `ok` (índice + ledger).

---

## ⑤ Polling — PR separado

Branch `perf/reduzir-polling-conversas`, só frontend. Ver a descrição do PR.

---

## Resumo do disco

| Momento | Tamanho |
|---|---|
| hoje | 758 MB |
| depois de ① | ~618 MB |
| depois de ① + ③ | **~170 MB** |

De 758 MB para ~170 MB sem tocar em **um byte** de dado de cliente — porque
`public`, o aplicativo inteiro, são 8,5 MB.
