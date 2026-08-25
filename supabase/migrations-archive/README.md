# Migrações arquivadas — não rode nada daqui

Estes 15 arquivos **saíram** de `supabase/migrations/` em 2026-08-24, na
reconciliação do ledger. Cada um tem um cabeçalho explicando por que está aqui.

## Por que esta pasta e não `supabase/migrations/archive/`

O Supabase CLI lê **exatamente** o diretório `supabase/migrations` e casa os
arquivos por nome (`<14 dígitos>_<nome>.sql`). Uma subpasta dentro dele depende
do CLI ignorar entradas que não são `.sql` — o que ele faz hoje, mas é detalhe
de implementação e pode mudar de versão.

`supabase/migrations-archive/` é irmã, não filha. O CLI nunca a percorre, em
nenhuma versão. É a única colocação que não depende do comportamento dele.

Efeito prático: `supabase migration list`, `supabase db push` e `supabase db
diff` não enxergam nada desta pasta.

## O que tem aqui

**Nunca aplicadas e perigosas — 2**

| Arquivo | O que aconteceria se rodasse |
|---|---|
| `20260113000001_security_hardening_rls.sql` | Derruba as policies de `profiles` e `tenants` em uso. Perda de acesso geral, inclusive o seu |
| `20250109000001_fix_chatbots_schema.sql` | `DROP COLUMN` em 6 colunas de `chatbots` que o `useChatbots.ts` lê e grava |

**Supersedidas — 13**

| Arquivo | Substituída por |
|---|---|
| `20241220000000_create_stripe_config.sql` | ledger `20250805032512` |
| `20250103000001_automation_flows.sql` | `20260623000001` (apagou o motor legado) |
| `20250103000002_notifications.sql` | `20260630000002` |
| `20250120000002_update_schedule_campaign_messages.sql` | `20260615000002` / `20260615000003` |
| `20250802124911_5e2a2334….sql` | bootstrap alternativo morto — venceu o `20250802124822` |
| `20250802125654_702d50aa….sql` | `20260513000002` / `20260513000003` |
| `20250802125731_a5db549f….sql` | `20260716000002` (`handle_new_user`) |
| `20250802131206_e4b42387….sql` | `20250802131928` |
| `20250802132106_8a4ae043….sql` | `20260615000003` |
| `20250802151159_ffd7d7c5….sql` | `20260529130000` |
| `20250802151308_7fb09959….sql` | `20260529130000` |
| `20250802151358_650e1241….sql` | `20260529130000` |
| `20260703120000_fix_unread_count_inbound_direction.sql` | `20260703130000` (aplicar contaria em dobro) |

## As 15 estão carimbadas no ledger

`docs/reconciliar_ledger_migracoes.sql`, LOTE 3. O carimbo é uma **trava**, não
um registro de que rodaram — duas delas (as perigosas) nunca rodaram, e o
carimbo existe justamente para que continuem sem rodar.

## Se você precisar mover algo de volta

Não precisa. Se um dia precisar mesmo, o caminho é: escrever uma migração
**nova**, com data de hoje, contendo só a parte que ainda faz sentido. Nunca
reative um arquivo daqui — ele foi escrito contra um esquema que não existe mais.
