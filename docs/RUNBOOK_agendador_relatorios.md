# Runbook — colocar o agendador de relatórios no ar

Passo a passo para aplicar em produção (projeto `pqjkuwyshybxldzpfbbs`).
Escrito para ser seguido de cima para baixo, sem precisar perguntar nada.

**Contexto em uma linha:** a tela Relatórios › Agendamentos deixava o usuário
programar envio recorrente, mas não salvava e nada nunca era enviado. O código
que conserta isso já está na `main`; falta ligar em produção.

---

## Onde estamos

- [x] **1. Código na `main`** — commit `5019236` (20 arquivos: executor, cron,
      testes, remoção do mock). Nada mais a fazer aqui.
- [x] **2. Deploy das duas Edge Functions** — feito em 2026-08-19. `send-report`
      e `process-report-dispatch` no ar. Precisou de `npx supabase login`: além
      da variável de ambiente, a credencial salva também tinha expirado.
- [x] **3. Ligar o cron** — feito em 2026-08-19. 6 jobs em `cron.job`,
      `process-report-dispatch-every-5min` ativo.
- [x] **4. Remover a tabela morta `scheduled_reports`** — feito em 2026-08-19.
- [x] **5. Regerar os tipos** — feito em 2026-08-19. Cuidado com a codificação:
      a primeira tentativa com `>` gravou o arquivo em UTF-16 e precisou ser
      refeita (ver o aviso no passo 5 abaixo).
- [x] **6. Teste de ponta a ponta** — feito em 2026-08-19. Agendamento marcado
      para 18:08 foi entregue no tick das 18:10, sem intervenção. Envio manual
      também confirmado.

> **Lembre do atraso de até 5 minutos.** O envio não sai no minuto exato: sai no
> primeiro tick do cron depois dele. Marcou 18:08, chega até 18:10. Isso é do
> desenho, não é falha.

---

## Pegadinhas deste ambiente (leia antes)

Três coisas que já quebraram no meio do caminho:

1. **O terminal é PowerShell, não bash.** Nada de `\` no fim da linha para
   quebrar comando — cada comando vai numa linha só. Com `\`, o `git add` morre
   com `fatal: '\' is outside repository` e — pior — os comandos seguintes
   (`git commit`, `git push`) rodam assim mesmo, subindo pela metade.
2. **O CLI do Supabase é dependência do projeto, não está instalado no
   sistema.** Sempre `npx supabase ...`. Sem o `npx` dá
   `'supabase' não é reconhecido como nome de cmdlet`.
3. **A variável `SUPABASE_ACCESS_TOKEN` está setada no nível do usuário do
   Windows e está morta.** Ela sobrescreve o login do CLI e faz *tudo* devolver
   401, mesmo com `npx supabase login` bem-sucedido. Limpe antes de qualquer
   comando do CLI.

O projeto já está linkado (`supabase/.temp/project-ref` = `pqjkuwyshybxldzpfbbs`),
não precisa rodar `supabase link`.

> ⚠️ **Nunca rode `supabase db push` neste projeto.** 81 das 94 migrações locais
> não estão no ledger e algumas mexem em dado real de usuário. Migração aqui se
> aplica colando o script no SQL Editor.

---

## 2. Deploy das Edge Functions

Ordem importa: `send-report` primeiro, porque ele passou a usar o código
compartilhado em `supabase/functions/_shared/report-core.ts`.

```powershell
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
```

```powershell
npx supabase functions deploy send-report
```

```powershell
npx supabase functions deploy process-report-dispatch
```

**Se der `unexpected deploy status 401: {"message":"Unauthorized"}`:** limpar a
variável não basta — a credencial salva pelo `login` (Windows Credential
Manager, `LegacyGeneric:target=Supabase CLI:access-token`) também expira. Renove
na mesma janela e repita os deploys:

```powershell
npx supabase login
```

Se o login pelo navegador não rolar, gere um token em
https://supabase.com/dashboard/account/tokens e use ele direto na sessão:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_cole_o_token_aqui"
```

`WARNING: Docker is not running` é normal e não atrapalha — o bundle é remoto.
Se o deploy listou os `Uploading asset ...` antes do erro, o código compilou; o
problema é só de autenticação.

O `Remove-Item` vale só para a janela atual do terminal. Para matar a variável
de vez (ela está morta, só atrapalha):

```powershell
[Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', $null, 'User')
```

**Confira antes de seguir:** entre em Relatórios, gere um relatório e envie para
você mesmo. Se o e-mail chegar, o `send-report` está bem. Este é o primeiro
compile de verdade dele depois da reestruturação — se algo quebrou, é aqui.

---

## 3. Ligar o cron

SQL Editor do Supabase. Cole inteiro e rode.
Arquivo com os comentários e as verificações: `docs/agendar_relatorios_cron.sql`

```sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('process-report-dispatch-every-5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-report-dispatch-every-5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/process-report-dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxMzQxMzAsImV4cCI6MjA2OTcxMDEzMH0.xeS8OdwOHpby2NHf942Z7i240LW1a5kT5oR-aH35sD0"}'::jsonb,
    body := '{"trigger": "cron"}'::jsonb
  ) AS request_id;
  $cron$
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000001', 'report_dispatch_cron')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

**Conferir** — você deve sair de 5 para 6 jobs:

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
```

**Espere 5 minutos** e veja se o disparo respondeu 200:

```sql
SELECT status_code, left(content, 200) AS resposta, created
  FROM net._http_response ORDER BY created DESC LIMIT 3;
```

- `200` → certo.
- `404` → o passo 2 não foi feito (função não está no ar).
- `401` → a chave anon do script mudou.

---

## 4. Remover a tabela morta `scheduled_reports`

Independente do passo 3 — pode ser antes ou depois.
Arquivo completo: `docs/remover_scheduled_reports.sql`

Havia duas tabelas para a mesma ideia. Quem a tela usa e o executor lê é
`report_schedules`. A `scheduled_reports` não tem tela, não tem executor, não é
citada em lugar nenhum do código e está vazia. Deixar as duas é convite para o
próximo wiring cair na errada.

```sql
BEGIN;

DO $$
DECLARE
  linhas bigint;
BEGIN
  IF to_regclass('public.scheduled_reports') IS NULL THEN
    RAISE NOTICE 'scheduled_reports não existe — nada a fazer.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.scheduled_reports' INTO linhas;

  IF linhas > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: public.scheduled_reports tem % linha(s). Esperado: 0. Revise o conteúdo antes de remover a tabela.',
      linhas;
  END IF;
END $$;

DROP TABLE IF EXISTS public.scheduled_reports;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260819000002', 'drop_scheduled_reports')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

Estava com 0 linhas na última conferência. Se tiver aparecido linha, o script
aborta sozinho e não remove nada — aí me chame antes de forçar.

**Conferir:**

```sql
SELECT CASE WHEN to_regclass('public.scheduled_reports') IS NULL
            THEN 'removida' ELSE 'AINDA EXISTE' END AS situacao;
```

---

## 5. Regerar os tipos

Só depois do passo 4.

⚠️ **Não use `>` aqui.** O redirecionamento do PowerShell 5.1 grava o arquivo em
**UTF-16**, e aí o git mostra `0 insertions(+), 0 deletions(-)`, o `grep` não
acha mais nada dentro do arquivo e o build fica numa corda bamba. Use isto, que
força UTF-8 sem BOM:

```powershell
$t = npx supabase gen types typescript --project-id pqjkuwyshybxldzpfbbs | Out-String
```

```powershell
[IO.File]::WriteAllText("$PWD\src\integrations\supabase\types.ts", $t, (New-Object Text.UTF8Encoding $false))
```

Confira que deu certo antes de commitar — tem que devolver um número maior que zero:

```powershell
(Select-String -Path src\integrations\supabase\types.ts -Pattern 'report_schedules').Count
```

```powershell
git add src/integrations/supabase/types.ts
```

```powershell
git commit -m "chore: regenerate types apos drop de scheduled_reports"
```

```powershell
git push
```

Não edite `types.ts` à mão — ele é gerado.

---

## 6. Teste de ponta a ponta (5 minutos)

1. Relatórios › Agendamentos › **Novo Agendamento**.
2. Frequência **Diário**, seu e-mail, horário uns 10 minutos à frente.
3. **Salvar.** Isso já é meio teste: antes desta entrega o botão dava erro e
   nada era gravado.
4. Confirme que a linha entrou:

```sql
SELECT id, name, cron_expression, recipients, is_active, last_run, next_run
  FROM public.report_schedules ORDER BY created_at DESC LIMIT 5;
```

5. Passado o horário, confirme o envio:

```sql
SELECT executed_at, status, error_message,
       parameters->>'trigger'      AS origem,
       parameters->>'scheduleName' AS agenda,
       parameters->'delivered'     AS entregue
  FROM public.report_executions ORDER BY executed_at DESC LIMIT 5;
```

Esperado: `origem = schedule`, `status = success`, e o e-mail na caixa.
Se vier `status = failed`, o motivo está em `error_message` — que é justamente o
que não existia antes: a falha agora aparece em vez de sumir.

---

## Como funciona (para quando algo der errado)

- O cron chama `process-report-dispatch` a cada 5 minutos.
- A função olha as agendas ativas de todas as Contas e decide o que venceu
  comparando a expressão cron com o `last_run` — **não** com o `next_run`. Assim
  um tick perdido se recupera sozinho (janela de 60 minutos). O `next_run` é só
  para a tela mostrar "Próximo envio".
- Horário é o de **Brasília**. Marcar 09:00 significa receber entre 09:00 e 09:05.
- Antes de montar qualquer relatório, a agenda é "reclamada" por um UPDATE
  condicional. Dois disparos sobrepostos não mandam o relatório duas vezes.
- Um envio que falha **não** é repetido na mesma janela (evita e-mail duplicado
  quando o Resend já aceitou e a resposta se perdeu). A falha vira linha em
  `report_executions` com `status = failed`.
- Período dos dados segue a frequência: diário = último dia, semanal = últimos 7
  dias, mensal = últimos 30.
- Entrega é **só por e-mail**. WhatsApp foi retirado do agendamento de
  propósito; o envio manual por WhatsApp continua existindo na tela.

### Desligar

Tudo de uma vez:

```sql
SELECT cron.unschedule('process-report-dispatch-every-5min');
```

As agendas continuam salvas. Para desligar só uma Conta, basta `is_active =
false` na agenda dela (ou o botão na tela).

### Secrets

Já configuradas e funcionando (houve entrega real em 2026-06-01):
`RESEND_API_KEY` e `REPORT_FROM_EMAIL`. São as mesmas do envio manual — se o
manual funciona, o agendado tem o que precisa.
