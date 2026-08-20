# Runbook — Paywall por cargo (Gerente bloqueado, com saída própria)

Entrega de **frontend apenas**. Não tem migração, não tem coluna nova, não tem
deploy de Edge Function. O que muda:

- **gerente** perde o bypass do paywall e passa a ser bloqueado quando a Conta
  dele não está paga — mas a tela de bloqueio traz preço, plano e um botão de
  assinar que funciona de verdade;
- **gestor** e **atendente** veem a tela de bloqueio **sem preço e sem botão**,
  com o recado de falar com o Gerente e o contato do suporte;
- **superadmin** não muda nada: bypass total, como sempre.

Branch: `feat/cancelar-followup-na-resposta` → `main`.

---

## Estado em 2026-08-20 (conferido no banco de produção)

| Conta (`kind='account'`) | `subscription_status` | `manual_access_granted` | Gerente | Depois da mudança |
|---|---|---|---|---|
| Mario Acioli | `null` | `true` | mario@sourelevante.com.br | **LIBERADA** (manual) |
| Conta Teste Gerente | `null` | `true` | gerente.teste@re9.online | **LIBERADA** (manual) |

Nenhuma Conta tem assinatura ativa; todo o acesso de hoje é liberação manual.
**Nenhum gerente é trancado por esta mudança.**

As Lojas também não mudam de estado: EncaixaRH e Loja Teste herdam do pai
liberado, Loja - Yuri Saldanha é órfã liberada, e Loja - Bruno Moura já estava
bloqueada antes (órfã sem liberação).

---

## Passo 0 — Conferir os secrets do Stripe (o único item não verificado)

Não dá para ler secret pelo MCP, e o conector do Stripe desta máquina aponta
para outra conta (ImobIA). **Confira à mão antes de subir:**

https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/settings/functions

Precisam existir, com valor `live`:

| Secret | Para quê |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_PRICE_GERENTE` | `price_...` do Plano Gerente, R$ 499,90/mês |
| `STRIPE_PRICE_STORE_SLOT` | `price_...` da Loja extra, R$ 99,90/mês |

Os Price IDs conferem em https://dashboard.stripe.com/prices (modo Live).

**Se algum faltar**, não trave a entrega: abra
`src/lib/billing/checkout.ts` e ponha `CHECKOUT_ENABLED = false`. As duas telas
(paywall e aba Assinatura) passam a mostrar só o contato de suporte, juntas.
Ligar de novo depois é a mesma linha.

---

## Passo 1 — Conferir o banco (tem que devolver duas linhas LIBERADA)

SQL Editor: https://supabase.com/dashboard/project/pqjkuwyshybxldzpfbbs/sql/new

```sql
select
  name,
  case
    when subscription_status = 'active' then 'LIBERADA (paga)'
    when manual_access_granted then 'LIBERADA (manual)'
    else 'SERA BLOQUEADA'
  end as depois_da_mudanca
from public.tenants
where kind = 'account'
order by name;
```

Se aparecer `SERA BLOQUEADA`, **pare**: aquele gerente perde o acesso no deploy.

---

## Passo 2 — Testar e buildar

Um comando por linha (PowerShell não aceita `\` nem `&&`).

```
npm run test:run
```
```
npm run build
```

Esperado: 902 testes passando, 40 arquivos; build sem erro.

---

## Passo 3 — Commit e push

```
git add src/lib/billing src/hooks/useTenantAccess.ts src/hooks/useTenantAccess.test.tsx src/components/auth/PaywallScreen.tsx src/components/auth/PaywallScreen.test.tsx src/components/settings/SubscriptionSettings.tsx src/components/layout/DashboardLayout.tsx src/lib/help/featureHelp.ts docs/RUNBOOK_paywall_por_cargo.md
```
```
git commit -m "feat(paywall): bloquear o gerente com saida propria, e telas por cargo"
```
```
git push -u origin feat/cancelar-followup-na-resposta
```

PR: https://github.com/renoribeiro/ConvoFlow/compare/main...feat/cancelar-followup-na-resposta

---

## Passo 4 — Conferir depois do deploy da Vercel

1. Entre com **gerente.teste@re9.online**. Tem que abrir normal (a Conta está
   liberada na mão). Se cair no paywall, algo está errado — volte ao Passo 1.
2. Entre com **camila@encaixarh.com.br** (gestor). Tem que abrir normal.
3. Entre como **superadmin** (reno@re9.online). Tem que abrir normal.

### Ver a tela nova de propósito

Só assim dá para conferir o visual novo, porque hoje ninguém está bloqueado:

1. Como superadmin, em **Administração**, revogue a liberação manual da
   **Conta Teste Gerente**.
2. Entre com **gerente.teste@re9.online**: deve aparecer "Acesso bloqueado" com
   R$ 499,90, a lista do plano, o botão verde **Assinar agora**, o botão
   **Já paguei — reconferir acesso** e o contato do suporte.
3. Entre com **yuri20raulino@gmail.com** (gestor da Loja Teste): mesma tela
   **sem preço e sem botão**, dizendo para falar com o Gerente.
4. Como superadmin, **devolva a liberação manual** da Conta Teste Gerente.

Não faça esse teste com a Conta **Mario Acioli** — é cliente de verdade.

---

## Voltar atrás

Uma linha, em `src/hooks/useTenantAccess.ts`:

```ts
const temBypass = role === 'superadmin' || role === 'gerente';
```

Com isso o gerente volta a nunca ver o paywall, e o resto da entrega (telas por
cargo, checkout funcionando, constante única) continua no lugar.
