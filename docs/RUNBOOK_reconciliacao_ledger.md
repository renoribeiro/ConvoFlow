# Runbook — reconciliar o ledger de migrações

**Estado:** pronto para rodar. Nada foi aplicado.
**Script:** `docs/reconciliar_ledger_migracoes.sql`
**Data da auditoria:** 2026-08-24
**Projeto:** `pqjkuwyshybxldzpfbbs`

---

## O problema, em uma frase

O banco tinha 102 versões registradas; o repositório tinha 117 arquivos de
migração. 48 desses arquivos não tinham nenhum rastro no ledger — e entre eles
havia duas migrações capazes de derrubar o acesso de todo mundo se alguém
resolvesse "aplicar o que está pendente".

## O que este runbook faz

1. Carimba 48 versões no ledger, em três lotes.
2. Tira 15 arquivos do alcance do CLI.
3. Corrige o `CLAUDE.md`, que apontava para uma migração de RLS que nunca rodou.

**Nada de esquema muda.** O script só escreve em
`supabase_migrations.schema_migrations`.

---

## Antes de começar

### Pré-requisitos

- Acesso ao SQL Editor do Supabase (não precisa de CLI, não precisa de token).
- **Nunca** rode `supabase db push` neste projeto, nem antes nem depois.

### Anote o estado de hoje

Rode isto no SQL Editor e **guarde o resultado**. É a sua linha de base.

```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations)                              AS ledger,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public')                              AS policies,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public')                                                               AS funcoes;
```

Em 2026-08-24 isso devolvia **102 / 175 / 110**.

`policies` e `funcoes` **têm que ficar iguais** do começo ao fim. Se mudarem,
alguma coisa além deste script rodou.

---

## A garantia que cada lote te dá

Cada lote é **um único bloco `DO $tag$ ... $tag$;`** — um comando só. Ou ele
termina, ou o PostgreSQL desfaz tudo o que ele fez. Isso importa porque, no SQL
Editor do Supabase, `BEGIN;` / `COMMIT;` **não** garante isso (ver `CLAUDE.md`,
armadilha 4 — em 2026-08-20 um script deixou `DELETE`s gravados mesmo abortando).

Nos LOTES 1 e 2, cada versão só é carimbada se o objeto que **prova** que ela
rodou estiver vivo no mesmo bloco. Se uma prova faltar, o lote inteiro aborta
com `RAISE EXCEPTION` e **nada** é gravado — nem as versões cuja prova passou.

As 33 provas dos LOTES 1 e 2 foram conferidas contra o banco em 2026-08-24:
todas passaram.

---

## Ordem de execução

### Passo 0 — leia a linha de base
Rode o `SELECT` da seção anterior. Anote os três números.

### Passo 1 — LOTE 1 (27 versões)

Cole no SQL Editor **só o bloco `DO $lote1$ ... $lote1$;`** de
`docs/reconciliar_ledger_migracoes.sql`.

**O que faz:** carimba 27 migrações cujo efeito está vivo no banco.
**O que pode dar errado:** se eu classifiquei alguma errada, a prova dela falha
e o lote aborta inteiro sem gravar nada. Você me traz a mensagem e eu
reclassifico. Não force.

**Conferir depois:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;  -- esperado: 129
```
E procure no painel de mensagens a linha
`NOTICE: LOTE 1 OK — 27 carimbadas agora, 0 já estavam no ledger`.

### Passo 2 — LOTE 2 (6 versões)

Cole só o bloco `DO $lote2$ ... $lote2$;`.

**O que faz:** carimba 6 migrações cujo efeito está vivo, mas cujo **arquivo
contém erro fatal** e nunca mais roda como está escrito. Carimbar é o que
impede alguém de tentar.

Estas seis **continuam** em `supabase/migrations/` de propósito: o esquema de
hoje é o efeito delas, são história real. Só não rodam mais.

| Versão | Por que o arquivo não roda |
|---|---|
| `20250802124822` | `CREATE TYPE` / `CREATE TABLE` sem guarda → *already exists* |
| `20250802131719` | `CREATE TABLE public.job_queue` sem `IF NOT EXISTS` |
| `20260113000002` | cinco `ADD COLUMN …` soltos, sem `ALTER TABLE` → **erro de sintaxe** |
| `20260513000001` | `ALTER TYPE … RENAME VALUE 'super_admin'` — o label não existe mais |
| `20260513000003` | aplicada; `is_user_in_my_tenant` depois substituída pela `20260818000002` |
| `20260716000002` | re-rodar troca a `usage_limits` inteira e reescreve `handle_new_user` |

**Conferir depois:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;  -- esperado: 135
```

### Passo 3 — LOTE 3 (15 versões, a trava)

Cole só o bloco `DO $lote3$ ... $lote3$;`.

**Este lote é diferente.** Aqui o carimbo não quer dizer "isto rodou". Quer
dizer "isto nunca deve rodar".

- 13 são **supersedidas** — rodar hoje desfaz o estado atual.
- 2 **nunca rodaram e não podem rodar**. Para essas não existe prova de
  aplicação, e o script diz isso na cara: elas saem no `NOTICE` final marcadas
  como `NUNCA_APLICADA`.

**Conferir depois:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;  -- esperado: 150

SELECT version, name FROM supabase_migrations.schema_migrations
 WHERE name LIKE '%\_\_SUPERSEDIDA' ESCAPE '\'
    OR name LIKE '%\_\_NUNCA\_APLICADA' ESCAPE '\'
 ORDER BY version;                                           -- esperado: 15 linhas
```

E leia o `NOTICE` final — ele lista as duas travadas e por quê.

### Passo 4 — conferência final

```sql
SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS ledger,   -- 150
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies, -- 175, igual ao passo 0
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public')                                 AS funcoes;   -- 110, igual ao passo 0
```

`policies` e `funcoes` **iguais ao passo 0**. Se mudaram, pare e me chame.

---

## Como desfazer

Cada lote tem seu bloco de reversão, comentado, logo abaixo dele no script.
Descomente e rode só o do lote que você quer desfazer. Eles apagam
**exatamente** as versões daquele lote, e só as linhas com `statements IS NULL`
— assim uma linha gravada de verdade por outra ferramenta nunca é tocada.

**Reverter o LOTE 3 remove a trava.** Só faça isso se você também for devolver
os 15 arquivos de `supabase/migrations-archive/` para `supabase/migrations/` —
e aí você volta a ter, ao alcance de qualquer ferramenta, duas migrações que
derrubam o acesso.

---

## Mudanças no repositório (já feitas, não precisam de você)

### 15 arquivos foram para `supabase/migrations-archive/`

**Isso tira mesmo do alcance do CLI?** Tira. O Supabase CLI lê **exatamente** o
diretório `supabase/migrations`. `supabase/migrations-archive/` é irmã dele, não
filha — nunca é percorrida, em nenhuma versão do CLI.

Considerei `supabase/migrations/archive/`. Funcionaria hoje, porque o CLI ignora
entradas que não terminam em `.sql`. Mas isso é detalhe de implementação e pode
mudar; a pasta irmã não depende do comportamento dele. Detalhe: o
`package.json` fixa `supabase: ^2.34.3`, ou seja, o CLI **sobe de versão
sozinho** num `npm install`. Não quis apostar num detalhe interno.

Cada arquivo arquivado ganhou um cabeçalho explicando o que aconteceria se
rodasse. `supabase/migrations-archive/README.md` tem a lista completa.

### `CLAUDE.md` corrigido

Ele dizia que a RLS morava em `20260113000001_security_hardening_rls.sql` e
mandava ler esse arquivo antes de mexer em policy. **Esse arquivo nunca rodou.**
Agora aponta para as quatro migrações que produziram a RLS de hoje.

---

## Fora do escopo — próximas tarefas

- **Reconstruir arquivos locais para as 22 migrações que só existem no ledger.**
  É uma lacuna de recuperação de desastre: `subscriptions`, `system_modules`,
  `tenant_module_settings`, `rate_limits`, `admin_users_view` e outras não têm
  SQL no repositório. Tarefa separada, a próxima.
- **As duas publications de realtime**, criadas à mão no Dashboard.
  A `supabase_realtime` está vazia.
- **`handle_message_conversation` casa conversa por `(contact_id, tenant_id)` e
  ignora `whatsapp_instance_id`** — duas instâncias no mesmo contato caem na
  mesma conversa. Defeito real, adiado de propósito. Não conserte reaplicando a
  `20260703120000`: ela faz o não-lido contar em dobro.

---

## Por que isto não virou uma migração em `supabase/migrations/`

O `CLAUDE.md` manda toda migração vir em par (arquivo + script em `docs/`).
Esta entrega não é uma migração: não cria, altera nem apaga nenhum objeto do
banco. É conserto do próprio livro-caixa. Criar uma migração para ela geraria
uma 118ª linha que precisaria ser carimbada por ela mesma.
