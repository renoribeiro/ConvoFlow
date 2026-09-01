# Plano — consertar o custo de RLS (initplan e policies sobrepostas)

Investigação de 2026-08-31, somente leitura. Nada foi alterado em produção.
Rede de segurança: `docs/teste_isolamento_rls.sql`.

---

## O que a medição mostrou

### O lint conta 59. O problema real são 170.

| | policies |
|---|---|
| Chamam `auth.uid()` / `current_setting()` cru | **59** ← é o que o lint `auth_rls_initplan` vê |
| Chamam um helper `SECURITY DEFINER` que internamente faz `auth.uid()` | **114** ← o lint **não** vê |
| **Total com o mesmo defeito** | **170** de 175 policies |

Os 59 batem exatamente com o número do advisor, o que valida o classificador.

Os 114 restantes são coisas como `tenant_id = get_current_user_tenant_id()` e
`is_super_admin()`. Cada um desses helpers é `STABLE SECURITY DEFINER` e faz
`SELECT ... FROM profiles WHERE user_id = auth.uid()`. Como são `SECURITY
DEFINER`, o Postgres **nunca faz inline** deles — é uma chamada de função de
verdade, por linha.

**É daí que vêm os 4 milhões de seq scans numa tabela de 9 linhas.** Não é a
policy da `profiles` que faz isso sozinha: é toda policy de toda outra tabela
que chama um helper, e o helper vai na `profiles`.

### As quatro tabelas que realmente pagam

Ordenar por número de acessos engana. O custo do initplan é proporcional a
**linhas varridas**, não a queries. Uma tabela de 0 linhas com 245 mil seq scans
(`mass_message_campaigns`) não ganha nada com esta correção.

| tabela | tuplas lidas | linhas | policies a reescrever |
|---|---|---|---|
| `profiles` | **19.475.664** | 9 | 7 |
| `contacts` | 1.248.865 | 136 | 2 |
| `conversations` | 558.057 | 135 | 4 |
| `messages` | 282.731 | 2.084 | 2 |

O resto do catálogo é cauda longa: mecânico de corrigir, quase sem retorno hoje.

### Medição A/B, dado real, tenant real

Consulta: as 20 mensagens / 50 contatos mais recentes, como o app faz.
Três execuções, cache quente, última medição.

| variante | `messages` blocos | `contacts` blocos |
|---|---|---|
| **A — hoje** (2 policies, sem initplan) | 58 | 286 |
| **B — só initplan** (mantém as 2 policies) | 20 (**−66%**) | 16 (**−94%**) |
| **C — só fundir policies** (sem initplan) | 38 (−34%) | 16 (−94%) |
| **D — initplan + fusão** | 19 (−67%) | 16 (−94%) |

E o pior caso, quando nenhuma linha casa (`messages`, varredura inteira):
**5.773 blocos / 57,5 ms → 1.813 blocos / 2,8 ms.** Vinte vezes mais rápido.

---

## Resposta à pergunta 3: qual dos dois domina?

**O initplan domina. As policies sobrepostas são, em grande parte, inflação do
lint.**

Os 714 lints de `multiple_permissive_policies` foram reproduzidos exatamente por
consulta própria: o lint expande cada policy por **5 roles × 4 comandos**. Uma
tabela com duas policies `FOR ALL TO public` gera **20 lints**. Os 714 vêm de
57 tabelas com cerca de 120 pares reais de policy — quase sempre o mesmo par:
`"Super admins can access all X"` + `"Users can access own tenant X"`.

E a coluna C da tabela acima mostra o resto: **depois de aplicar o initplan, a
fusão de policies quase não acrescenta nada** (66% → 67% em `messages`, zero em
`contacts`). Ela também é a mudança de maior risco, porque fundir dois `OR`
errado altera quem enxerga o quê.

Há um efeito de segunda ordem que vale registrar, porque explica o −94% de
`contacts`: `tenant_id = f()` com `f` STABLE pode virar **condição de índice**
(avaliada uma vez). Já `is_super_admin() OR tenant_id = f()` não pode — o `OR`
derruba o índice e degrada para filtro linha a linha. Envolver em `(SELECT ...)`
transforma o resultado em constante de InitPlan e devolve o índice.

**Conclusão: fazer o initplan primeiro, em todas as 170. Reavaliar a fusão de
policies depois, com número na mão — provavelmente não vale o risco.**

---

## Os lotes

A reescrita é mecânica e preserva o significado exatamente:

```
  is_super_admin()                    ->  (SELECT is_super_admin())
  tenant_id = get_current_user_tenant_id()
                                      ->  tenant_id = (SELECT get_current_user_tenant_id())
  auth.uid()                          ->  (SELECT auth.uid())
```

Nada de `USING` novo, nada de policy removida, nada de policy fundida. Um valor
que era calculado por linha passa a ser calculado uma vez por comando. Para uma
função `STABLE` — e **todos** os 14 helpers são `STABLE` — o resultado é idêntico
por definição: `STABLE` significa "não muda dentro do mesmo comando".

**A exceção honesta:** helpers que recebem uma coluna da linha como argumento —
`is_my_descendant(id)`, `is_user_in_my_tenant(id)`, `is_tenant_in_my_descendants(id)`
— **não podem** ser içados, porque o argumento muda a cada linha. Ali o ganho vem
de envolver a guarda barata que vem antes no `AND` (`is_account_manager_safe()`),
que passa a ser avaliada uma vez e faz curto-circuito: para um gestor ou
atendente, a caminhada recursiva na árvore nunca chega a rodar.

| lote | o que entra | policies | por que aqui |
|---|---|---|---|
| **1** | `contacts`, `messages`, `conversations`, `contact_tags`, `quick_replies`, `lead_tracking` | 14 | Caminho do inbox. É o que a suíte cobre melhor, e é o que **causa** a maior parte dos 4 M de scans na `profiles`. |
| **2** | `profiles` (7) | 7 | A mais quente e a mais perigosa. Lote próprio, revert próprio. Inclui as três funções que recebem coluna. |
| **3** | `tenants`, `whatsapp_instances`, `module_settings`, `notifications` | 16 | Controle de acesso e layout. Quebrar aqui trava tela, não vaza dado. |
| **4** | `job_queue`, `webhook_deliveries`, `automation_*`, `chatbot_*`, `campaign_*`, `followup_*` | ~60 | Volume de acesso alto, volume de linha baixo. Ganho modesto, risco modesto. |
| **5** | cauda longa (`system_*`, `stripe_*`, `affiliate_*`, `report_*`, …) | ~73 | Higiene. Zera o lint. |

Cada lote é um `ALTER POLICY` por policy, dentro de um bloco `DO` único, com o
`INSERT` no ledger `supabase_migrations.schema_migrations` — e um arquivo par em
`supabase/migrations/`, como manda o CLAUDE.md. Reverter um lote é reaplicar o
texto antigo da policy, que fica guardado no cabeçalho do próprio script.

## Ganho esperado por lote, e como conferir

Baseline a registrar **antes** de cada lote, e de novo depois:

1. `EXPLAIN (ANALYZE, BUFFERS)` do conjunto fixo de consultas do lote, três
   execuções, cache quente — o mesmo método da tabela A/B acima.
2. `pg_stat_user_tables.seq_scan` e `seq_tup_read` da `profiles`, delta sobre uma
   janela fixa.

| lote | previsão | medida que confirma |
|---|---|---|
| 1 | −66% de blocos em `messages`, −94% em `contacts` (**já medido**) | blocos por consulta; queda no `seq_tup_read` da `profiles` |
| 2 | queda grande no `seq_tup_read` da `profiles` por leitura de perfil | `seq_tup_read` da `profiles` |
| 3 | modesto | blocos por consulta |
| 4–5 | ~zero hoje; é seguro para o crescimento | contagem de lints |

**Previsão que pode ser desmentida:** os lotes 4 e 5 quase não devem mudar nada
agora, porque as tabelas estão vazias. Se mudarem muito, minha leitura do gargalo
está errada e o plano merece revisão.

## Regra de parada

Depois de cada lote: rodar `docs/teste_isolamento_rls.sql`, medir, relatar.
Lote que deixe a suíte vermelha é revertido inteiro, sem tentar consertar por
cima.
