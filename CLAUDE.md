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

**Database migrations.** SQL files under `supabase/migrations/`, named with `YYYYMMDDHHMMSS_description.sql`. Two tracking tables of note: `module_settings` (drives `ModuleGuard`) and the `webhook_*` tables added by `add_webhook_*` migrations. RLS hardening lives in `20260113000001_security_hardening_rls.sql` — read it before changing any RLS policy.

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

O ambiente do dono do projeto tem três armadilhas que já quebraram entregas.
Respeite-as ao escrever qualquer comando para ele rodar.

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

**Nunca rode nem sugira `supabase db push`.** 81 das 94 migrações locais não
estão no ledger e algumas mexem em dado real de usuário. Migração aqui se aplica
colando um script no SQL Editor.

Por isso toda migração vem em par: o arquivo em `supabase/migrations/` (registro)
e um script pronto para colar em `docs/`, transacional, idempotente e com o
`INSERT` no ledger — o padrão está em `docs/aplicar_rls_lojas_do_gerente.sql`.
Os dois precisam ficar equivalentes, inclusive no `INSERT` do ledger: quem roda
o arquivo de migração direto no SQL Editor também tem que registrar o histórico.

Escreva o script defensivo: se ele apaga ou sobrescreve algo, cheque a premissa
dentro da transação e aborte com `RAISE EXCEPTION` quando ela não valer (ver
`docs/remover_scheduled_reports.sql`). E prefira falhar alto a usar `CASCADE`.

### Runbooks

Entrega que precisa de vários passos manuais ganha um runbook em `docs/`, com o
estado atual marcado, os comandos exatos e as verificações. Não deixe o
passo-a-passo só no chat: ele se perde e vira pergunta repetida.

- `docs/RUNBOOK_agendador_relatorios.md` — envio recorrente de relatórios por
  e-mail (deploy, cron, remoção da tabela morta, teste de ponta a ponta).
- `docs/HIERARCHY_V2_CUTOVER_RUNBOOK.md` — corte da hierarquia Conta/Loja.
