# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: `npm` (lockfile present). `bun.lockb` exists but `package-lock.json` is the source of truth.

```bash
npm run dev              # Vite dev server on port 8080 (host "::"; ngrok/loca.lt allowed)
npm run build            # Production build (validates required env vars; fails if missing)
npm run build:dev        # Development-mode build (skips strict env validation)
npm run preview          # Serve the production build locally
npm run lint             # ESLint over the repo
npm test                 # Vitest in watch mode
npm run test:run         # Vitest single run
npm run test:coverage    # Coverage report (v8, thresholds set to 50%)
npm run test:ui          # Vitest UI

# Run a single test file
npx vitest run src/lib/validation.test.ts
# Run tests matching a name
npx vitest run -t "validates url"

# Security scripts (custom, not standard tooling)
npm run security:check   # node scripts/security-check.cjs
npm run security:audit   # npm audit --audit-level moderate
```

There is no `type-check` script despite what `README.md` claims. Use `npx tsc -p tsconfig.app.json --noEmit` if you need a standalone type check.

Tests live as `src/**/*.{test,spec}.{ts,tsx}`. They are **excluded from the app `tsconfig`** (`tsconfig.app.json` excludes `*.test.ts(x)`), so type errors inside tests will not fail the build — keep that in mind when verifying.

Vite's production build (`mode === 'production'` in `vite.config.ts`) throws if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing.

## Big-picture architecture

**Stack.** React 18 + TypeScript + Vite (SWC plugin), TanStack Query for server state, Zustand for client state (Evolution-related only), React Router v6 with lazy-loaded routes, Tailwind + shadcn/ui (Radix primitives — `components.json` controls the shadcn aliases). Backend is Supabase (Postgres + Auth + Realtime + Edge Functions). PWA is enabled via `vite-plugin-pwa` only in production builds.

**Path alias.** `@/*` → `./src/*` (configured in both `tsconfig*.json` and `vite.config.ts`). Use it everywhere; do not introduce relative imports that cross feature folders.

**Provider tree (`src/App.tsx`).** Order matters and downstream providers depend on upstream:
`QueryClientProvider` → `TooltipProvider` → `AuthProvider` → `TenantProvider` → `ChatbotProvider` → `BrowserRouter`. `TenantProvider` reads `auth.user`, then loads the user's row from `profiles` and the matching `tenants` row. Almost every domain query downstream filters by `tenantId` — fetching anything tenant-scoped before `TenantProvider` resolves will fail or leak data across tenants.

**Route guarding.** Three composable guards under `src/components/auth/`:
- `AuthGuard` — requires a session, otherwise redirects to `/auth`.
- `ModuleGuard` — checks **only** `is_enabled` for the module in `useModules()` (the product toggle in ModuleSettings). It does **not** check plan, trial or manual access: the `PREMIUM_MODULES` gate was removed, and the code says so at `ModuleGuard.tsx:36-42`. Super admins bypass it.
- `RoleGuard` — role match against the role coming from `profiles.role` (exposed via `useRole()` in `TenantContext`), **not** `user.user_metadata.role`. Accepts `role` for an exact match or `minRole` for "this level or above" (`atendente` < `gestor` < `gerente` < `superadmin`); super admins bypass.

When adding a new dashboard route, wrap it in `ModuleGuard` with the matching `moduleName` and add the module to the database's module config; otherwise non-super-admins see redirects.

**Exception — routes visible to every role.** A screen that must open for anyone with a session takes no `ModuleGuard` and no `RoleGuard`: it sits under the `/dashboard` `AuthGuard` alone, and its sidebar entry uses `moduleName: null` (which makes `isItemVisible` in `Sidebar.tsx` short-circuit to `true`). `settings`, `profile` and `notifications` are the existing examples of this pattern — follow them rather than inventing a permissive module.

**Paywall (the only plan gate).** `useTenantAccess` → `DashboardLayout` replaces the whole dashboard with `<PaywallScreen />`. `superadmin` and `gerente` bypass it client-side. For everyone else the decision comes from the `public.tenant_access_state(uuid)` RPC (migration `20260818000001`): **only an account (`kind='account'`) holds a subscription**; a store with a `parent_tenant_id` inherits its parent's `subscription_status`/`manual_access_granted`, and an account — or an orphan store with no parent — is evaluated on its own row. There is no store-level access override. The RPC is required because `tenants` RLS deliberately gives a store member no way to read the parent account row; do not "fix" that with a policy. The rule is mirrored in `src/lib/access/tenantAccess.ts`, which is also the hook's degradation path when the RPC is unavailable — keep the two in sync (tests: `src/lib/access/tenantAccess.test.ts`).

**Multi-tenancy.** Every domain table has `tenant_id`. Roles seen in code: `super_admin`, `tenant_admin`, regular users. Use `useTenantId()`, `useIsTenantAdmin()`, `useIsSuperAdmin()` from `TenantContext` rather than re-deriving from raw profile data.

**Server data layer.**
- `src/integrations/supabase/client.ts` — singleton client, storage key `convoflow-auth`.
- `src/integrations/supabase/types.ts` — generated DB types; import via `Tables<'name'>`.
- `src/lib/queryClient.ts` — custom `createQueryClient()` with three cache tiers driven by the *first segment* of the query key:
  - realtime (30s stale): `messages`, `conversations`, `notifications`, `instance-status`
  - static (30m stale): `tenant`, `profile`, `settings`, `modules`
  - everything else falls into `semiStatic` (5m).
  Use the `QUERY_KEYS` constants and structure keys as `[QUERY_KEYS.X, ...]` so the tiering kicks in. Mutation keys ending in `-item` auto-invalidate the matching list key.
- Generic helpers: `useSupabaseQuery`, `useSupabaseMutation` — prefer these over hand-rolling Supabase calls in components.

**WhatsApp integration (provider-pluggable).** Two providers behind a common interface:
- Frontend service: `src/services/evolutionApi.ts` (`EvolutionApiService`) plus the React glue in `src/hooks/useEvolutionApi.tsx`.
- Server-side: `supabase/functions/_shared/whatsapp-providers/{base,evolution,waha}.ts` and `provider-factory.ts`. Edge functions (`evolution-webhook`, `waha-webhook`, `automation-processor`, `job-worker`) route through `ProviderFactory.getProvider(instance)`, which reads `instance.provider` (defaulting to `evolution`) and pulls credentials from `connection_config` (new) or the legacy `evolution_api_url`/`evolution_api_key` columns. Preserve both code paths when touching connection logic.
- Webhooks are server-only — there is no client-side webhook handler. JWT verification is enabled in `supabase/config.toml` for `evolution-webhook` and `job-worker`.

**Environment.** Do **not** read `import.meta.env.VITE_*` directly. Use the singleton `env` (`src/lib/env.ts`, `EnvironmentManager`) which validates required vars at startup and exposes a typed `env.get('KEY')` API plus `env.isDevelopment()`. Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. The Evolution API URL/key are optional in env and can be set per-instance in the UI.

**Logging.** Use `logger` from `src/lib/logger.ts`, not `console.*`. It sanitizes sensitive fields automatically and respects `VITE_ENABLE_DEBUG_LOGS` / `VITE_ENABLE_CONSOLE_LOGS`. There is a parallel logger in `supabase/functions/_shared/logger.ts` for Edge Functions.

**Validation.** Zod schemas in `src/lib/validations/` (per-domain) and `src/lib/validation.ts` (primitives + `validateInput()` helper + `UrlSanitizer`). Apply at trust boundaries — form submit and any externally provided URL/API key. The Edge Function counterpart lives at `supabase/functions/_shared/validation.ts`.

**Database migrations.** SQL files under `supabase/migrations/`, named with `YYYYMMDDHHMMSS_description.sql`. Two tracking tables of note: `module_settings` (drives `ModuleGuard`) and the `webhook_*` tables added by `add_webhook_*` migrations.

**Where today's RLS actually comes from.** Read these four before changing any policy — in this order, because each one reshapes the previous:

- `20260513000002_user_hierarchy_rls.sql` — the base `profiles_*` policies, `descendant_profile_ids()`, `can_manage_profile()`.
- `20260513000003_user_hierarchy_rls_fix.sql` — rewrites those policies on top of `is_my_descendant()` / `is_user_in_my_tenant()` / `is_tenant_in_my_descendants()`. (`is_user_in_my_tenant` was later fixed again by `20260818000002`.)
- `20260716000002_hierarchy_v2_foundation.sql` — the `gerente`/`gestor`/`atendente` cutover: `ALTER POLICY` on the role literals, plus `tenants.kind` and the store-slot triggers.
- `20260817000006_rls_gerente_reads_own_stores.sql` — `tenants_parent_reads_child_stores`, so a Gerente can read a Loja that has no members yet.

⚠️ **`20260113000001_security_hardening_rls.sql` is NOT the source of truth and never ran.** The ledger audit of 2026-08-24 confirmed it: the policies it creates do not exist in the database, and the ones it drops are in use. It now lives in `supabase/migrations-archive/` with a warning header. Running it would drop `users_own_profile`, `service_role_full_access` and the three `tenants` policies — locking everyone out, you included. Do not resurrect it.

**Migration ledger.** Reconciled 2026-08-24 — the ledger and the repo now agree. 48 local files had no row in `supabase_migrations.schema_migrations`; 15 of those were superseded or dangerous and moved to `supabase/migrations-archive/` (a sibling directory — the CLI only ever reads `supabase/migrations`). The reconciliation script and its runbook are `docs/reconciliar_ledger_migracoes.sql` and `docs/RUNBOOK_reconciliacao_ledger.md`.

The reverse gap is closed too: 23 live objects that no migration file explained were reconstructed from the catalog into 11 files carrying the ledger's own versions — see `docs/AUDITORIA_objetos_sem_migracao.md`. Those files say so in their header: **they are the current state, not the original SQL.** Don't read them as history.

That audit also found dead objects that are still in the database, kept on purpose until you decide: five `company_id`-era functions that throw if called (both `handle_new_message` overloads, `update_message_status`, `get_delivery_log`, `process_flow_step`), a parallel dead module system (`system_modules` / `tenant_module_settings` / `tenant_active_modules` — the live one is `module_settings`), and six legacy tables locked down by `20260513120200`.

**PWA caching (`vite.config.ts`).** Important runtime cache rules:
- Supabase `realtime`/`auth`/`functions` are `NetworkOnly` — do not cache them.
- Supabase `rest`/`storage` are `NetworkFirst` (24h).
- Images/fonts use `CacheFirst`.
If you add a new Supabase URL pattern or external service, decide its caching strategy explicitly; falling through to default behavior may break realtime or auth.

## Repository conventions worth knowing

- **Locale.** User-facing strings are PT-BR (toasts, route copy, error messages). Match that language when adding UI text.
- **Lazy routes.** Every dashboard page is `React.lazy`-imported in `App.tsx` with a `<Suspense fallback={<PageLoadingSkeleton />}>` wrapper. Follow the same pattern for new pages so the bundle stays split.
- **Manual chunk splits** are configured in `vite.config.ts` (`vendor-react`, `vendor-ui`, `vendor-query`, `vendor-supabase`). If you add a heavy dependency, consider whether it should join an existing vendor chunk.
- **shadcn components.** Generated into `src/components/ui/` via the shadcn CLI using `components.json` (style: default, base color: slate, no prefix). Do not hand-edit the schema; regenerate.
- **Test setup** is at `src/test/setup.ts`; jsdom environment, globals enabled, coverage thresholds 50% across the board.
- **ESLint config** (`eslint.config.js`) intentionally turns OFF `@typescript-eslint/no-unused-vars` and downgrades `no-explicit-any` to a warning — don't be surprised by either.
- **Loose root scripts.** The repo root contains many `test_*.mjs` / `check_*.mjs` / `delete_instances*` scripts (currently untracked or modified). They are operator/debug tools, not part of the build. Don't import from them and don't treat them as documentation.
- **Multiple report files** (`FUNCTIONALITY_REPORT.md`, `IMPROVEMENTS_REPORT.md`, `RELATORIO_*.md`, `WAHA_INTEGRATION_PLAN.md`) and `.trae/documents/` contain historical analysis and plans, not current state. Read code first; treat these as background.

## Security notes specific to this repo

- `SECURITY.md` documents the in-place hardening: env-based secrets, sanitizing logger, Zod validation at boundaries, JWT verification on Edge Functions. Maintain those invariants when touching the affected modules.
- The committed `.env.example` contains a long-lived JWT-shaped value in `VITE_SUPABASE_ANON_KEY`. Treat it as untrusted/illustrative — when configuring a real environment, replace it with the project's actual anon key (never a service-role key) and never commit a populated `.env`.

## Regras Obrigatórias para Trabalho com APIs de WhatsApp

Sempre que for criar, modificar ou corrigir qualquer código que interaja com as
APIs de WhatsApp (envio/recebimento de mensagens, sessões, webhooks, contatos,
grupos, status), siga este protocolo antes de escrever qualquer linha de código:

1. Identifique qual(is) API(s) são afetadas pela mudança:
   - Evolution API v2  → consulte `.agent/skills/evolution-v2/SKILL.md`
   - WAHA API          → consulte `.agent/skills/waha/SKILL.md`
   - Meta Cloud API    → consulte `.agent/skills/meta-cloud-api/SKILL.md`

2. Leia a seção relevante do arquivo de referência correspondente ANTES de
   escrever o código. Não assuma endpoints, campos ou comportamentos de memória.

3. Se a funcionalidade envolver mais de uma API, consulte todos os arquivos
   correspondentes e garanta que a implementação seja consistente para todas.

4. Após implementar, verifique se o código respeita as "Regras de Uso para o
   Agente" listadas no final de cada arquivo SKILL.md.

## Regras Obrigatórias para a Ajuda no Produto

Toda mudança no sistema também atualiza a ajuda que o usuário lê. O conteúdo
mora em `src/lib/help/featureHelp.ts` e é exibido pelo `<FeatureHelp />`. Não
existe entrega "só de código": código sem ajuda correspondente está incompleto.

1. **Nova tela do dashboard** → crie a entrada `page:<segmento-da-rota>` em
   `featureHelp.ts` (com `category: 'tela'` e a `area` da seção do menu) e passe
   `helpKey` no `PageHeader` da tela. Se a tela não usa `PageHeader`, monte o
   `<FeatureHelp />` ao lado do título dela. Declare também o acesso da tela na
   própria entrada — `moduleName` (o mesmo nome do `ModuleGuard` da rota) e/ou
   `minRole` (a mesma escala do `RoleGuard`). Isso não é permissão: é o que faz
   a página de Ajuda não oferecer leitura sobre tela que o cargo não alcança.

2. **Novo nó de chatbot** → crie a entrada com a chave igual ao `node_type`
   (`category: 'chatbot'`, `area` = categoria da paleta em `flowConstants.ts`).
   O `NodeConfigPanel` já monta a ajuda a partir do tipo do nó.

3. **Novo gatilho, ação ou condição de automação** → crie a entrada
   `trigger:*` / `action:*` / `condition:*` (`category: 'automacao'`) e preencha
   o `helpKey` da entrada correspondente em `automationCatalog.ts`.

4. **Mudança de comportamento de algo que já existe** → atualize a entrada
   correspondente no mesmo commit. Ajuda que descreve o comportamento antigo é
   pior que ajuda nenhuma: o usuário segue o passo-a-passo e não funciona.

4b. **Mudança em fluxo de onboarding** → atualize o tutorial correspondente em
   `src/lib/help/tutorials.ts`, no mesmo commit. Contam como onboarding:
   conectar WhatsApp, convidar usuário / montar equipe, configurar o funil,
   criar chatbot e disparar campanha. Isso inclui renomear um botão, trocar a
   ordem dos passos de um assistente, acrescentar campo obrigatório ou mudar
   quem pode fazer a ação. Tutorial é passo-a-passo: um label errado no meio do
   caminho para o usuário.

5. **Nunca use o nome "pelado" de uma tela como chave.** O namespace é plano e
   já tem colisões potenciais (`condition` é nó do chatbot e `condition:*` são
   condições de automação; `update_contact` é nó e também `action:*`). O prefixo
   é o que evita o conflito.

6. **Conteúdo em pt-BR**, na voz das entradas existentes: segunda pessoa, frases
   curtas. O `whatItDoes` começa onde a `description` do `PageHeader` termina —
   parafrasear a descrição genérica não ajuda ninguém. Onde o comportamento muda
   por cargo (`superadmin` / `gerente` / `gestor` / `atendente`), diga isso no
   texto.

### Dois tipos de conteúdo

- **Referência** (`src/lib/help/featureHelp.ts`) — explica UMA tela ou UM bloco.
- **Tutorial** (`src/lib/help/tutorials.ts`) — cumpre um OBJETIVO, e objetivo
  atravessa várias telas. Cada passo é uma AÇÃO com verbo; passo sem verbo é
  referência disfarçada e o lugar dele é numa entrada do featureHelp.

Os dois declaram acesso do mesmo jeito (`moduleName` / `minRole`) e são
filtrados pelo mesmo `useHelpVisibility`. Não crie uma segunda fonte de permissão.

### Onde o conteúdo aparece

Cada entrada de referência é exibida em dois lugares, sempre pelo mesmo
componente de corpo (`src/components/shared/FeatureHelpBody.tsx` — não duplique
esse JSX):

1. **Painel lateral contextual** — o `<FeatureHelp />` da própria tela.
2. **Página de Ajuda** (`/dashboard/help`, `src/pages/Help.tsx`) — a
   documentação navegável.

Os tutoriais aparecem só na página de Ajuda, na primeira seção, renderizados por
`src/components/shared/TutorialBody.tsx`. O único ponto de descoberta deles no
produto é o cartão do Dashboard
(`src/components/dashboard/OnboardingTutorialsCard.tsx`), que aparece enquanto a
Conta não tem nenhuma instância de WhatsApp. **Não espalhe outros banners,
tooltips ou modais de tutorial pelo produto** — um ponto de entrada, por decisão.

**A página de Ajuda não precisa ser editada para receber conteúdo novo.** Ela
monta tudo por `getHelpByCategory()` e por `TUTORIALS`, na ordem de
`HELP_CATEGORIES`, com os rótulos de `HELP_CATEGORY_LABELS` e o sub-agrupamento
de `area`. Entrada e tutorial novos aparecem sozinhos. Não escreva texto de
ajuda dentro de `Help.tsx`.

Só há **uma** mudança que exige mexer na página: um valor NOVO de `category`.
Nesse caso, acrescente-o a `HELP_CATEGORIES` **na posição em que deve aparecer**
(o array define a ordem das seções) e dê a ele um rótulo em
`HELP_CATEGORY_LABELS`. Sem o rótulo a seção sai sem título; fora de posição,
sai na ordem errada.

A tela de Ajuda em si **não tem** entrada `page:help` — ela é a documentação, não
um assunto documentado. É a única exceção à regra 1.

Deep link: `/dashboard/help#<chave>` abre e rola até a entrada (ex.:
`/dashboard/help#page:conversations`). É o que o link "Ver toda a documentação"
do painel lateral usa.

### Testes que protegem a ajuda

`src/lib/help/featureHelp.test.ts` varre o `src/` atrás de chaves de ajuda e
**falha** quando: uma `helpKey` usada não tem entrada, uma entrada existe mas não
é alcançável por nenhum ponto de montagem, um tipo de nó ou entrada do catálogo
aponta para chave inexistente, uma entrada está sem título, `whatItDoes`, passos
ou `category` válida, ou um `moduleName` declarado não existe como `ModuleGuard`
em `App.tsx`.

`src/lib/help/tutorials.test.ts` protege os tutoriais e **falha** quando: um
passo aponta em `screen` para uma rota que não existe mais em `App.tsx` (renomear
rota quebra este teste), um `helpKey` de passo não existe em `FEATURE_HELP`, um
`moduleName` não corresponde a nenhum `ModuleGuard`, um `minRole` não é cargo
válido, ou um tutorial sai da faixa de 5 a 9 passos.

`src/pages/Help.test.tsx` cobre a página: renderização de todas as entradas e
tutoriais, busca sem acento, deep link (`#page:*` e `#tutorial:*`) e filtro por
cargo. `src/components/dashboard/OnboardingTutorialsCard.test.tsx` cobre o
cartão do Dashboard.

Rode `npm run test:run` antes de abrir PR — o `<FeatureHelp />` falha em silêncio
na tela, então o teste é o único lugar onde um typo de chave aparece.

## Operação: aplicar coisas em produção

### Regra 0 — você aplica e roda; só volta ao bater numa parede

> **Regra vigente desde 2026-08-28.** Ela **substituiu** a anterior, que exigia
> autorização explícita para cada ação de escrita. Se você encontrar em algum
> lugar do repositório a instrução "entregue o script, ele roda" ou "a
> autorização não se propaga", é texto velho: vale esta seção.

**Aplique e execute você mesmo.** Migrações, `VACUUM`, mudança de cron, deploy de
edge function, commit e push. **Não entregue script para o dono colar** e não
espere autorização por ação.

**Só volte a ele quando você já TENTOU e bateu numa parede:**

- permissão que você não tem (ex.: `ALTER TABLE` numa tabela de extensão)
- credencial que falta
- decisão que só ele pode tomar (produto, prioridade, custo para o cliente)
- algo fora do seu alcance — abrir PR sem `gh` e sem MCP do GitHub, ou um teste
  que exige mandar mensagem para um telefone real

**Continua absoluto: nunca `supabase db push`** (ver a seção logo abaixo).

#### A prudência não sumiu — ela mudou de lugar

Antes ela era *perguntar antes de agir*. Agora é:

1. **Guarda dentro do script.** Escrita perigosa vai dentro de UM bloco `DO`
   único, que confere a premissa e aborta com `RAISE EXCEPTION` quando ela não
   vale — ver a armadilha 4 abaixo. O guarda é o que substitui a pergunta.
2. **Testar em vez de supor.** Se dá para provar com um teste, prove. Em
   2026-08-28 isso pagou três vezes no mesmo dia: um probe achou um bug de
   ambiguidade que existia desde 2025 numa função tida como "correta"; um guarda
   abortou sozinho por causa de um erro na própria checagem (e nada foi
   removido); e o `VACUUM FULL` via pg_cron levou 0,064 s contra a estimativa de
   "1 a 3 s". Nenhuma das três coisas apareceria sem rodar.
3. **Antes de apagar, exporte e conte.** Continua valendo: o SQL Editor não tem
   desfazer.

#### Quando precisar dele, o formato é obrigatório

Nada de "vá no painel e procure X". Assuma que ele não sabe onde nada fica. Uma
mensagem só tem que bastar, sem pergunta de volta:

- o **link exato**
- a **tela exata** e onde nela (nome do botão, canto da página)
- o **conteúdo exato** para colar ou digitar
- os **passos em ordem**
- **o que ele deve ver quando deu certo** — e, de preferência, como diagnosticar
  se não deu

E termine com uma seção separada, `O QUE VOCÊ PRECISA FAZER`, contendo **só** o
que depende dele. Se não há nada, diga isso claramente.

### As quatro armadilhas do ambiente

O ambiente do dono do projeto tem quatro armadilhas que já quebraram entregas.

As três primeiras valem **quando você precisa entregar um comando para ele
rodar** — hoje a exceção, não a regra (ver Regra 0). A **quarta vale sempre**,
inclusive para SQL que você mesmo executa: ela é o motivo de guarda e escrita
morarem no mesmo bloco `DO`.

1. **O terminal dele é PowerShell, não bash.** Nunca use `\` para quebrar linha
   — cada comando vai numa linha só. Com `\`, o `git add` morre com
   `fatal: '\' is outside repository` e, pior, os comandos seguintes na mesma
   colagem (`git commit`, `git push`) rodam assim mesmo e sobem pela metade.
   Também não valem `&&`, `||` nem here-strings de bash.

2. **O CLI do Supabase é devDependency, não está instalado no sistema.** Sempre
   `npx supabase ...`. Sem o `npx`, dá `'supabase' não é reconhecido como nome
   de cmdlet`.

3. **`SUPABASE_ACCESS_TOKEN` está setada no nível de usuário do Windows e está
   morta.** Ela sobrescreve o login e faz todo comando do CLI devolver 401,
   mesmo depois de `npx supabase login`. Limpe antes, na mesma sessão:
   `Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue`.

4. **No SQL Editor do Supabase, `BEGIN;` / `COMMIT;` NÃO garante atomicidade,
   e tabela temporária não sobrevive de um comando para o outro.** Em
   2026-08-20 o `docs/remover_lojas_orfas.sql` deu
   `ERROR: 42P01: relation "_lojas_orfas_inventario" does not exist` — e os
   `DELETE` já executados **ficaram gravados mesmo assim**. Ou seja: a frase
   "é transacional, ou entra tudo ou não entra nada", que está no cabeçalho de
   vários scripts de `docs/`, é falsa nesse editor.

   Consequência ao escrever script de escrita perigosa: **a operação inteira —
   guardas, escritas e conferência final — vai dentro de UM único bloco
   `DO $tag$ ... $tag$;`**. Um bloco `DO` é um comando só: ou termina, ou o
   PostgreSQL desfaz tudo o que ele fez. É a única forma de `RAISE EXCEPTION`
   significar "nada aconteceu". E nunca dependa de estado de sessão entre
   comandos (tabela temporária, `SET`, variável de sessão) — use variáveis
   `DECLARE` dentro do bloco. Modelo pronto: `docs/remover_lojas_orfas.sql`.

**Nunca rode nem sugira `supabase db push`.** A auditoria de 2026-08-24 mediu:
117 arquivos locais, 102 versões no ledger, **48 arquivos sem nenhum rastro**.
(O número antigo, "81 de 94", contava só as versões e exagerava: 40 daqueles 81
estavam sim no ledger, gravados com outro carimbo de tempo.)

Dessas 48, várias mexem em dado real de usuário se rodarem — as piores são
`20260716000002_hierarchy_v2_foundation` (troca a `usage_limits` inteira e
reescreve `handle_new_user`), `20260513000001_user_hierarchy_schema` (backfill
de `parent_id`/`tenant_id` em todos os perfis) e
`20260716000003_hierarchy_v2_mario_camila_encaixarh` (reescreve quatro linhas
nomeadas). Migração aqui se aplica **uma de cada vez**, nunca por replay.

Conserto do ledger: `docs/RUNBOOK_reconciliacao_ledger.md`.

Por isso toda migração vem em par: o arquivo em `supabase/migrations/` (registro)
e o SQL efetivamente aplicado, transacional, idempotente e com o `INSERT` no
ledger. Os dois precisam ficar equivalentes, **inclusive no `INSERT` do
ledger** — o `execute_sql` do MCP não grava o histórico por você, então o
`INSERT` em `supabase_migrations.schema_migrations` é sua responsabilidade.
Padrão em `docs/aplicar_rls_lojas_do_gerente.sql`.

Quando a migração for grande, arriscada ou de operação repetível, deixe também o
script em `docs/` — ele vira registro do que rodou e receita para repetir. É o
caso de `docs/RUNBOOK_reducao_carga_banco.md` e dos scripts que ele referencia.

Duas coisas úteis, medidas em 2026-08-28:

- **O `execute_sql` do MCP do Supabase roda FORA de bloco de transação**, então
  `VACUUM FULL` e `CREATE INDEX CONCURRENTLY` funcionam por ele.
- **Você tem `MAINTAIN`, não posse.** O papel `postgres` consegue `VACUUM FULL` e
  `DELETE` em tabelas de extensão (`net._http_response`, `cron.job_run_details`),
  mas **não** `ALTER TABLE` nelas, e não é superuser — `pg_net.ttl` e
  `cron.log_run` estão fora do seu alcance. Dá para limpar, não para configurar;
  migração não contorna isso, porque roda com o mesmo papel.

Escreva o script defensivo: se ele apaga ou sobrescreve algo, cheque a premissa
**dentro do mesmo bloco `DO` que faz a escrita** (ver armadilha 4 acima) e aborte
com `RAISE EXCEPTION` quando ela não valer. E prefira falhar alto a usar
`CASCADE`. Exemplos: `docs/remover_lojas_orfas.sql` (bloco único, com guardas de
identidade, de sinais de vida e de "nada além do inventário levantado") e
`docs/remover_scheduled_reports.sql`.

Antes de apagar, exporte. Uma consulta somente-leitura em `docs/`, rodada e
conferida ANTES do script de remoção, custa um clique e é a única rede que
existe — o SQL Editor não tem desfazer, e restaurar backup por causa de faxina
não compensa. Modelo: `docs/exportar_loja_yuri_antes_de_remover.sql`.

### Runbooks

Entrega que precisa de vários passos manuais ganha um runbook em `docs/`, com o
estado atual marcado, os comandos exatos e as verificações. Não deixe o
passo-a-passo só no chat: ele se perde e vira pergunta repetida.

- `docs/RUNBOOK_agendador_relatorios.md` — envio recorrente de relatórios por
  e-mail (deploy, cron, remoção da tabela morta, teste de ponta a ponta).
- `docs/HIERARCHY_V2_CUTOVER_RUNBOOK.md` — corte da hierarquia Conta/Loja.
