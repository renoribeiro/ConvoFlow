# RUNBOOK — Modo de manutenção

Fecha o ConvoFlow inteiro de uma vez. Todas as Contas, todas as Lojas, todos os
cargos — **menos o superadmin**, que continua entrando normalmente.

Estado: **no ar desde 2026-09-01**. SQL aplicado em produção (ledger
`20260901000001`), frontend na branch `feat/atribuicao-ctwa`.

> **Se você chegou aqui com clientes trancados e a tela não abre**, vá direto
> para [Emergência](#emergência--desligar-por-sql), no fim deste arquivo.

---

## O que ele faz

| Cargo | Durante a manutenção |
|---|---|
| `superadmin` | Entra normalmente. Vê uma faixa âmbar no topo de todas as telas. |
| `gerente` | Bloqueado. |
| `gestor` | Bloqueado. |
| `atendente` | Bloqueado. |

Quem é bloqueado vê uma tela cheia com o motivo que você escreveu, a previsão de
retorno e o contato do suporte. **Ela não parece erro de propósito** — quem lê
"erro" liga para o suporte agora; quem lê "volta hoje às 15:00" espera.

A **landing** (`/`) continua no ar, intocada: é a página de vendas. A **tela de
login** mostra um aviso, mas continua aceitando login — ela tem de continuar,
senão o superadmin também ficaria de fora.

---

## Ligar

1. Entre como superadmin em <https://convoflow.com.br/dashboard/admin>
2. Aba **Configurações** → primeiro cartão, **Modo de manutenção**
3. Preencha **Motivo** — é o texto que o cliente lê. Escreva como explicaria por
   telefone.
4. Preencha **Previsão de retorno**. Isso não é enfeite: é a hora em que o
   sistema **abre sozinho**.
5. Deixe **Início** vazio.
6. **Ligar agora** → leia a confirmação até o fim → **Sim, bloquear todo mundo agora**

**O que você deve ver quando deu certo:** o cartão fica com borda âmbar e o
selo "LIGADA — clientes bloqueados"; uma faixa âmbar pulsante aparece no topo de
todas as suas telas. Num navegador anônimo, `/auth` mostra o aviso de manutenção.

Quem estiver com o sistema aberto cai na tela de manutenção **em até um minuto**
(é o intervalo com que a página repergunta ao servidor).

---

## Agendar

Igual ao acima, mas preencha **Início** também e clique em **Agendar**.

Ninguém é bloqueado na hora. O selo fica azul, "Agendada", e a faixa no topo é
azul em vez de âmbar — dois tons porque são duas urgências diferentes, e usar o
mesmo para as duas ensinaria a ignorar as duas.

Para cancelar antes de começar: **Cancelar agendamento**.

---

## Desligar

**Pelo produto:** o botão verde **Desligar agora**, no cartão, ou o link
**Desligar** na faixa âmbar do topo (que leva ao mesmo lugar). Não pede
confirmação — desligar é a direção segura.

**Sozinho:** chegada a previsão de retorno, o bloqueio se desfaz sem ninguém
fazer nada. Não há cron envolvido: a janela é resolvida na leitura, com o
relógio do servidor.

> ⚠️ **Se a manutenção passar do horário marcado, os clientes voltam no meio
> dela.** Estique a janela ANTES de o horário chegar — a faixa no topo mostra
> quanto falta justamente para isso. Editar a previsão e clicar em "Atualizar
> motivo e previsão" resolve.

---

## Emergência — desligar por SQL

Use quando o frontend não abre, o painel não carrega ou você não consegue entrar
como superadmin.

1. Abra <https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/sql/new>
2. Cole **isto**, exatamente, e clique em **Run**:

```sql
UPDATE public.system_settings
   SET value = jsonb_set(value, '{enabled}', 'false'),
       updated_at = now()
 WHERE key = 'maintenance_mode';

SELECT * FROM public.maintenance_state();
```

3. **O que você deve ver:** a segunda consulta devolve uma linha com
   `active = false`. Pronto — todo mundo entra de novo, em até um minuto, sem
   ninguém precisar recarregar nada.

Se por qualquer motivo o `UPDATE` não resolver, o martelo é apagar a linha —
ausência de linha também significa "desligado":

```sql
DELETE FROM public.system_settings WHERE key = 'maintenance_mode';
SELECT * FROM public.maintenance_state();   -- active deve vir false
```

**Só isso basta.** Não precisa de deploy, não precisa reiniciar nada, não precisa
mexer em edge function. Cada navegador aberto repergunta a cada minuto e se
solta sozinho.

### Conferir quem está trancado agora

```sql
SELECT active, scheduled, reason, starts_at, ends_at, server_now
  FROM public.maintenance_state();
```

`active = true` → clientes bloqueados neste momento.
`scheduled = true` → agendada, ninguém bloqueado ainda.
Tudo `false` → sistema aberto.

---

## Como isso está montado

| Peça | Arquivo |
|---|---|
| Interruptor | `public.system_settings`, chave `maintenance_mode` |
| Leitura pública do estado | `public.maintenance_state()` — SECURITY DEFINER, GRANT para `anon` e `authenticated` |
| Migração / SQL aplicado | `supabase/migrations/20260901000001_maintenance_mode.sql` · `docs/aplicar_maintenance_mode.sql` |
| A regra em TypeScript | `src/lib/maintenance/maintenanceState.ts` |
| Leitura no front | `src/hooks/useMaintenanceMode.ts` |
| O bloqueio | `src/components/maintenance/MaintenanceGuard.tsx` (em `App.tsx`, entre `AuthGuard` e `DashboardLayout`) |
| A tela do cliente | `src/components/maintenance/MaintenanceScreen.tsx` |
| A faixa do superadmin | `src/components/maintenance/MaintenanceBanner.tsx` (em `DashboardLayout`) |
| O aviso no login | `src/components/maintenance/MaintenanceLoginNotice.tsx` (em `Auth.tsx` e `Login.tsx`) |
| O painel | `src/components/admin/MaintenanceSettings.tsx` (Administração › Configurações) |
| Ajuda no produto | `page:admin-maintenance` em `src/lib/help/featureHelp.ts` |

### Cinco decisões que valem lembrar

**1. Não encosta no paywall.** `useTenantAccess` responde "esta Conta pagou?";
isto responde "o sistema inteiro está parado?". Duas perguntas, dois donos, dois
modos de errar. A manutenção é conferida primeiro: durante ela nem o checkout
funcionaria direito, e mandar alguém pagar no meio de uma manutenção seria pior
que dizer a verdade.

**2. O relógio é o do servidor.** A RPC devolve `active` já calculado. Se o
computador do cliente estiver com a data errada, isso não liga nem desliga a
manutenção para ele.

**3. Sem cron, de propósito.** Um cron que "desliga a manutenção" tem um modo de
falha inaceitável aqui: não disparar, e deixar a base de clientes trancada.
Aritmética não deixa de disparar.

**4. Falha ABERTA, sempre.** RPC ausente, permissão negada, rede fora, JSON
torto, consulta que nunca responde (limite de 6 s) — tudo resulta em sistema
aberto. Só um `active = true` explícito, vindo do servidor, bloqueia. O erro
caro aqui não é deixar alguém entrar durante a manutenção; é trancar todo mundo
fora por engano.

**5. Uma janela, não duas datas.** O fim da janela é ao mesmo tempo a previsão
mostrada ao cliente e o momento em que o bloqueio se desfaz. Separar as duas
daria um campo "previsão" decorativo, que mente quando a manutenção passa dele.

---

## O que foi conferido, e como

**No banco, contra produção** (probe de 2026-09-01, que se desfez sozinho por
`RAISE EXCEPTION` — nenhuma linha sobrou):

| Situação | `active` |
|---|---|
| Sem linha nenhuma | `false` |
| Ligada agora, sem janela | `true` |
| `enabled: false` | `false` |
| Janela agendada para o futuro | `false` (`scheduled = true`) |
| Janela em curso | `true` |
| **Janela vencida** | `false` — resolveu sozinha |
| `ends_at: "banana"` | `false` — falhou aberto |
| `value` não é objeto | `false` — falhou aberto |

**Nos testes** (`npm run test:run` — 1141 passando):

- `src/lib/maintenance/maintenanceState.test.ts` — a regra sem React, incluindo
  o instante exato do vencimento e a ordem "fim antes do início" (se a ordem
  inverter, uma janela velha volta a bloquear todo mundo).
- `src/components/maintenance/MaintenanceGuard.test.tsx` — gerente, gestor e
  atendente bloqueados; superadmin passa sem sequer consultar a RPC; janela
  vencida libera; e cinco caminhos de falha aberta, inclusive a consulta que
  nunca responde.

---

## O que ainda não existe

- **Não há aviso prévio dentro do produto.** Uma manutenção agendada não avisa o
  cliente antes de começar — ele descobre quando a tela troca. Se o horário for
  em expediente, avise por fora.
- **Não há manutenção por Conta.** É tudo ou nada, por decisão. Para fechar uma
  Conta só, use a revogação de acesso em Administração › Usuários.
- **Não há registro histórico.** `system_settings` guarda `updated_at` e
  `updated_by` do estado ATUAL — dá para saber quem mexeu por último, não a
  sequência de quem ligou e desligou ao longo do tempo. Não há trilha como a de
  `tenant_access_events`. Para descobrir quem deixou a manutenção ligada:

  ```sql
  SELECT s.updated_at, p.first_name, p.last_name
    FROM public.system_settings s
    LEFT JOIN public.profiles p ON p.user_id = s.updated_by
   WHERE s.key = 'maintenance_mode';
  ```
