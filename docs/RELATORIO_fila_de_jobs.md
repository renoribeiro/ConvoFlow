# A fila de jobs — o que estava quebrado e o que foi consertado

**Aplicado em produção em 2026-08-28.** Migrações `20260828000002` e
`20260828000003`, ambas no ledger.

---

## O resumo em uma frase

A fila de jobs do ConvoFlow **nunca funcionou**, desde 2025-08-02, por **dois
defeitos independentes** — e nenhum dos dois jamais gerou um erro visível.

---

## Defeito 1 — produtor e consumidor em tabelas diferentes

Existiam duas filas:

| | `public.job_queue` | `public.jobs` |
|---|---|---|
| criada | `20250802131719` (2025-08-02) | `20250803074510` (2025-08-03) |
| chave | `tenant_id` → `tenants` (viva, 5 linhas) | `company_id` → `companies` (morta, 2 linhas) |
| colunas | `job_type`, `job_data`, `scheduled_at` | `type`, `payload`, `run_at` |
| id | `uuid` | `bigint` |
| enfileirador | `enqueue_job()` ✅ | **nenhum** ❌ |

**Todos os produtores** escrevem em `job_queue`: o `automation-processor` (ação
*send_message*), `process_incoming_message()`, as duas variantes de chatbot
legado e `schedule_follow_up_message()`.

**O consumidor também foi escrito para `job_queue`.** A prova está na interface
TypeScript do próprio `job-worker`:

```ts
interface Job { id: string; tenant_id: string; job_type: …; job_data: JobData; current_attempts: number }
```

Isso é exatamente o formato de `job_queue`. `jobs` devolve `company_id` / `type`
/ `payload` — nomes que o worker não lê.

**O único elo quebrado era a função `dequeue_next_job(text[])`.** Em algum
momento depois de 2025-08-18 (o dump `database-schema/schema-ddl-2025-08-18…sql`
ainda mostra a versão correta) ela foi recriada apontando para `public.jobs`.

```
produtor  →  job_queue     (escreve)
consumidor →  jobs         (lê)        ← nunca se encontram
```

## Defeito 2 — a versão "correta" também não executava

Ao restaurar a definição original e **testá-la com um job de verdade**, ela
falhou na hora:

```
ERROR: 42702: column reference "current_attempts" is ambiguous
DETAIL: It could refer to either a PL/pgSQL variable or a table column.
```

O `RETURNS TABLE (… current_attempts integer)` cria uma variável PL/pgSQL com
esse nome, então `current_attempts = current_attempts + 1` é ambíguo.

**A migração original de 2025 já continha esse defeito.** Ele nunca apareceu
porque `job_queue` nunca teve uma linha — e nunca teve uma linha porque o
Defeito 1 fazia o consumidor olhar para o outro lado. Um defeito escondia o
outro.

Corrigido com um apelido de tabela (`UPDATE public.job_queue AS jq … jq.current_attempts + 1`),
que resolve a ambiguidade sem mexer nos nomes das colunas de retorno.

## Defeito 3 — entrega duplicada

A versão que estava no ar fazia `SELECT … FOR UPDATE SKIP LOCKED` e devolvia a
linha **sem marcar `status = 'processing'`**. O PostgREST confirma cada RPC na
hora, então a trava sumia assim que a função retornava.

Duas execuções sobrepostas do `job-worker` (o loop dura 45 s, o cron disparava a
cada minuto) pegariam o **mesmo job** e enviariam a **mesma mensagem duas vezes**
ao cliente. A marcação de `processing` voltou.

---

## O que isso quebrava na prática

A ação **"enviar mensagem" das automações**. O `automation-processor` enfileira,
loga `"send_message enfileirado no job_queue"`, devolve sucesso — e a mensagem
nunca sai. Sem erro em lugar nenhum.

**Por que ainda não tinha aparecido:** a única automação ativa em produção
("Auto Nomear Novo Contato", gatilho `variable_captured`) usa a ação
`update_contact`, que escreve direto em `contacts`. Por isso `job_queue` tinha
**0 inserções desde sempre**, apesar do `automation-processor` já ter rodado 95
vezes. O primeiro cliente que montasse uma automação com "enviar mensagem"
bateria nisto.

O caminho de chatbot está desconectado por um motivo **diferente e legítimo**:
aquelas funções só casam com `builder_version = 1`, e o único chatbot em
produção é `builder_version = 2` (fluxo visual), atendido direto pelo
`process-chatbot-message`. Ali o trabalho realmente mudou de lugar.

---

## Verificação executada

Teste que enfileira um job real, consome e finaliza — com `RAISE EXCEPTION` no
fim para desfazer tudo (resíduo conferido: `job_queue` = 0 linhas).

```
1_enqueue : id_gerado=t  status=pending     attempts=0
2_dequeue : devolveu=t  id_bate=t  tenant_bate=t  job_type=send_message
            instanceName=__e2e__  ||  status=processing  attempts=1
3_complete: status_final=completed  completed_at_ok=t
```

E a prova do anti-duplicidade — a segunda chamada seguida **não** devolve o
mesmo job:

```
2a_CHAMADA_devolveu_algo = f
```

---

## Remoção de `public.jobs`

Migração `20260828000003`, com guardas: aborta se a tabela tiver qualquer linha,
se houver FK/view/publicação dependente, ou se `dequeue_next_job(text[])` ainda
não apontar para `job_queue`.

*(O guarda funcionou de verdade: a primeira tentativa abortou sozinha porque a
checagem usava `pg_get_function_identity_arguments()`, que devolve
`p_job_types text[]` — com o nome do parâmetro — e não `text[]`. Nada foi
removido nessa tentativa.)*

Saiu junto `complete_job(bigint, boolean, text)`: ele só operava em `jobs`, e ter
os dois overloads com os **mesmos nomes de parâmetro** deixava a resolução do
PostgREST ambígua na chamada do worker. Hoje sobra só `complete_job(uuid,…)`,
que opera em `job_queue` e traz a lógica de retentativa correta.

**Não foi criado índice em `jobs`** — não se indexa tabela que vai ser removida.

`handle_new_message(jsonb)` também cita `jobs`, mas é uma das funções mortas da
era `company_id` que já lançavam exceção se chamadas. Continua igual; é outro
assunto.

---

## O que falta (só um teste que precisa de gente)

O caminho SQL está provado ponta a ponta. O que **não** dá para verificar por
SQL é o envio real pelo WhatsApp, porque exige uma instância conectada e manda
mensagem para um telefone de verdade. O passo a passo para confirmar na
interface está na seção "O QUE VOCÊ PRECISA FAZER" do relatório da conversa.
