# Runbook — Conversas: ordem das mensagens e contagem das pílulas

Entrega de **frontend puro**. Não tem SQL, não tem edge function, não tem
migração, não tem secret. Nada para colar no SQL Editor.

Duas correções, um PR:

1. **A conversa embaralhava na emenda entre páginas.** Mensagens de 14 de julho
   apareciam no meio das de ontem ao rolar para cima.
2. **A fila filtrada não tinha fundo visível.** "Não lidas" se refazia por baixo
   a cada 10s e era indistinguível de mensagem nova chegando. Agora a pílula
   mostra o tamanho da fila.

---

## Estado atual (conferido em 2026-08-28)

- [x] Código escrito e revisado
- [x] `npm run test:run` — 1001 testes, 48 arquivos, tudo passando
- [x] `npm run build` — passou em 47s
- [x] `tsc` e ESLint sem erro novo nos arquivos tocados
- [x] Ajuda do produto atualizada (`page:conversations`)
- [ ] Commit + push
- [ ] PR aberto
- [ ] Merge em `main`
- [ ] Deploy da Vercel confirmado
- [ ] Teste manual em produção

---

## ATENÇÃO antes de começar

Três coisas que vão morder se ignoradas:

1. **A branch atual está 11 commits ATRÁS da `main`.** `chore/reconciliar-ledger-migracoes`
   já foi mergeada (PR #27) e a `main` andou depois disso. Por isso o passo 2
   faz `rebase` — sem ele o PR viria com 11 commits já mergeados no meio.
   Já conferi: dos 11, só `ff22b05` toca um arquivo em comum
   (`ConversationsList.tsx`, na função `compactTimestamp`, linhas ~92-105) e a
   minha mudança está nas linhas ~215-226. **Não conflitam.**

2. **`CLAUDE.md` está modificado e não commitado** (+31 linhas, a seção
   "Regra 0"). Isso é trabalho seu de antes, ainda não está na `main`. O
   `git rebase` **se recusa a rodar** com arquivo rastreado modificado, então
   ele precisa entrar num commit (passo 1b) ou o passo 2 falha com
   `cannot rebase: You have unstaged changes`.

3. **Não commite o lixo.** Estes arquivos estão soltos e **não** entram neste
   PR: `audit-coverage.json`, `audit-inventory.json`, `audit-reachable.json`,
   `scripts/apply-chatbot-migration.mjs`, `test-results/`. Os comandos abaixo
   listam os arquivos um a um justamente para não varrer isso junto — não troque
   por `git add .`.

---

## Passo 1 — criar a branch e commitar

Terminal na raiz do projeto. **Uma linha por vez** (PowerShell não aceita `\`
para quebrar linha nem `&&`).

```powershell
git checkout -b fix/conversas-ordem-e-contagem
```

### 1a. O commit da correção

```powershell
git add src/hooks/useMessages.ts src/hooks/useMessages.test.ts src/hooks/useConversations.ts src/components/conversations/quickFilters.ts src/components/conversations/quickFilters.test.ts src/components/conversations/QuickFilterPills.tsx src/components/conversations/ConversationsList.tsx src/pages/Conversations.tsx src/lib/help/featureHelp.ts docs/RUNBOOK_conversas_ordem_e_contagem.md
```

Confira o que entrou antes de gravar:

```powershell
git status --short
```

Espere ver **10** arquivos em verde (`M`/`A`) — os 9 de código mais este runbook
— e o lixo do item 3 ainda em `??`.

```powershell
git commit -m "fix(conversas): conserta a ordem das mensagens e mostra o tamanho da fila" -m "A conversa embaralhava na emenda entre paginas: cada pagina nasce em ordem decrescente e e revertida dentro de si, mas as paginas eram concatenadas na ordem de chegada, entao o trecho antigo entrava DEPOIS do recente. 14 de julho aparecia abaixo de ontem. getAllMessages agora inverte a ordem das paginas antes de achatar." -m "A fila filtrada tambem nao tinha fundo visivel: a lista se refaz a cada 10s e, em Nao lidas, isso e indistinguivel de mensagem nova chegando. As pilulas de coluna real (Todas, Nao lidas, Arquivadas) passam a mostrar o total exato vindo do servidor com count exact/head. As derivadas (Aguardando, Nao respondidas, Em atendimento) so sabem contar o que foi carregado, entao mostram piso: 12+ ate a ultima pagina chegar." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

### 1b. O commit do CLAUDE.md

A "Regra 0" está pronta e só falta gravar. Se você **não** quiser mandar junto,
pule para o passo 2 — mas então rode `git stash push -- CLAUDE.md` antes, senão
o rebase trava.

```powershell
git add CLAUDE.md
```

```powershell
git commit -m "docs(claude): Regra 0 - escrita em producao pede autorizacao explicita, toda vez"
```

---

## Passo 2 — atualizar com a `main`

```powershell
git fetch origin
```

```powershell
git rebase origin/main
```

Deve terminar sem conflito. **Se aparecer conflito** em `ConversationsList.tsx`,
não é o esperado — resolva mantendo as DUAS mudanças (`compactTimestamp` com as
guardas de data nula, e o `allLoaded` logo antes de `countsPatch`), e depois:

```powershell
git rebase --continue
```

Para desistir e voltar ao estado anterior a qualquer momento:

```powershell
git rebase --abort
```

### Conferência antes de subir

```powershell
npm run test:run
```

```powershell
npm run build
```

Os dois já passaram aqui antes do rebase; rodar de novo é o que garante que a
`main` nova não quebrou nada.

---

## Passo 3 — push e PR

```powershell
git push -u origin fix/conversas-ordem-e-contagem
```

O `gh` não está instalado nesta máquina e o MCP do GitHub está com credencial
inválida, então o PR é aberto pelo navegador. O próprio `push` imprime um link
"Create a pull request"; se preferir, use direto:

**https://github.com/renoribeiro/ConvoFlow/compare/main...fix/conversas-ordem-e-contagem?expand=1**

Sugestão de título:

```
fix(conversas): ordem das mensagens na emenda entre paginas + tamanho da fila nas pilulas
```

No corpo, o que ajuda quem revisa:

- os dois sintomas que a Camila relatou e o diagnóstico de cada um;
- que as pílulas passaram a ter **dois** significados de número, e que o `+`
  é o que os separa (`12` = total da fila; `12+` = pelo menos 12, só o que
  já carregou);
- que `Aguardando` / `Não respondidas` / `Em atendimento` **não** viraram
  contagem de servidor de propósito: as regras vivem em `conversationGroups.ts`
  e `slaLevels.ts` e traduzi-las para filtro do PostgREST criaria uma segunda
  fonte da verdade.

---

## Passo 4 — merge e deploy

Merge pelo botão do GitHub. A Vercel builda sozinha no merge para `main`
(`main` é a branch de produção do projeto `convoflow`).

Acompanhe em:

**https://vercel.com/renoribeiro-hotmailcoms-projects/convoflow/deployments**

Espere o deploy de `target: production` ficar **READY** antes de testar. Leva
por volta de 1 a 2 minutos — o build local levou 47s.

> A tela de Conversas é servida por um chunk com hash no nome
> (`Conversations-<hash>.js`), e o PWA tem service worker. Se depois do deploy a
> tela parecer a antiga, force um recarregamento (Ctrl+Shift+R). Não é bug do
> deploy: é o service worker servindo o cache anterior.

---

## Passo 5 — teste manual em produção

**https://convoflow.com.br/dashboard/conversations**

### 5a. A ordem das mensagens (o sintoma da Camila)

Precisa de uma conversa com **mais de 50 mensagens** — é o tamanho da página, e
abaixo disso o bug não aparecia. A conversa do print dela serve.

1. Abra a conversa.
2. Role para cima até carregar o trecho antigo.
3. **O que tem que acontecer:** a data só anda para trás conforme você sobe.
   Nada de julho aparecendo embaixo de ontem, em nenhum ponto da rolagem.
4. Role até o topo e desça de novo, conferindo que a sequência continua íntegra.

### 5b. O tamanho da fila

1. Clique na pílula **"Não lidas"**. Ela agora mostra um número.
2. **O que tem que acontecer:** o número é o total da Loja, não o da página.
3. Abra e leia uma conversa dessa fila, volte. **O número tem que cair.** É essa
   queda que mostra a fila diminuindo enquanto ela trabalha.
4. Clique em **"Aguardando"**. Se houver mais de uma página, o número sai como
   `12+`.
5. Role a lista até o fim. **O `+` tem que sumir** — ao carregar a última página,
   o piso alcança o total.

### 5c. Não quebrou nada

- Busca por nome e por telefone ainda recorta a lista.
- Pílula **"Arquivadas"** abre as arquivadas e mostra o total delas.
- O modal **"Filtros"** (data, não lidas) continua convivendo com as pílulas.
- Trocar de instância no seletor do topo refaz as contagens.

### 5d. A ajuda

**https://convoflow.com.br/dashboard/help#page:conversations**

Confirme que aparecem as duas linhas novas em "Dicas" — a que explica `12` vs
`12+` e a que avisa que a lista se atualiza sozinha.

---

## Se precisar voltar atrás

O deploy anterior está a um clique na Vercel: abra o deployment de produção
anterior em `/deployments` e use **Instant Rollback**. Como não houve mudança de
banco, o rollback é completo — não sobra estado novo em lugar nenhum.

---

## O que este runbook NÃO pede

Para não deixar dúvida, porque quase toda entrega deste projeto pede alguma
dessas coisas e **esta não pede nenhuma**:

- ❌ Colar SQL no SQL Editor
- ❌ `npx supabase functions deploy`
- ❌ `npx supabase secrets set`
- ❌ Mexer em cron
- ❌ Registrar versão no ledger `supabase_migrations.schema_migrations`
- ❌ Variável de ambiente nova na Vercel

A contagem nova (`count: 'exact'`) lê a tabela `conversations` pela RLS que já
existe. Nenhuma policy foi criada ou alterada.

---

## Ponto de atenção para o futuro

`count: 'exact'` varre as linhas que casam com o filtro, sob RLS. No volume de
hoje (algumas centenas de conversas por Loja) é irrelevante. Se alguma Loja
chegar à casa das dezenas de milhares, o primeiro lugar a olhar são as três
contagens em paralelo em `src/pages/Conversations.tsx`. A saída seria
`count: 'planned'` ou uma RPC única — e aí sim entra migração e autorização sua.
