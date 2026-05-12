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
- `ModuleGuard` — checks `is_enabled` for the module in `useModules()` AND, for modules in the hard-coded `PREMIUM_MODULES` list (`chatbots, automation, campaigns, followups, reports, tracking, funnel`), checks the tenant's plan/trial/manual-access flags. Super admins bypass both.
- `RoleGuard` — exact role match against `user.user_metadata.role`; super admins bypass.

When adding a new dashboard route, wrap it in `ModuleGuard` with the matching `moduleName` and add the module to the database's module config; otherwise non-super-admins see redirects.

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
