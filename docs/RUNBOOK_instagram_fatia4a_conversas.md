# RUNBOOK — Conversas com a chave WhatsApp / Instagram (fatia 4a)

A tela de Conversas ganha a chave WhatsApp / Instagram (cada lado uma lista),
o selo do outro canal com as conversas que aguardam resposta, o nome e o @ do
cliente do Instagram, e a conta de teste passa a morar na Loja Teste.

## Estado atual (2026-09-25)

| Peça | Estado |
|---|---|
| Migração `20260925000001_instagram_contact_profile` | **Aplicada** (ledger ok). 3 colunas novas em `contacts`, nenhuma linha mudou (conferido na própria migração). Corpos no banco = arquivo (md5) |
| Suíte `docs/teste_nome_contato_instagram.sql` | 16/16 em produção (BEGIN/ROLLBACK) |
| Migração `20260925000002_instagram_only_in_loja` | **Aplicada**. `create_instagram_instance` recusa Conta |
| Mudança da conta de teste para a Loja Teste (`docs/mover_instagram_teste_para_loja.sql`) | **Feita** — ver números abaixo |
| Edge function `instagram-contact-profile` | **Falta deploy — passo 1** |
| Tela | Branch `feat/instagram-fatia4a-conversas`, não mergeada |
| `meta-webhook`, `instagram-webhook`, `instagram-send-message`, envio do WhatsApp | Intocados (byte a byte iguais à `main`), nada redeployado |

Loja Teste = `e6a88a32-5deb-4aa1-b246-05a512882388` (filha da Conta Teste Gerente).
Instância de teste = `0c4029bb-e0b6-4307-849b-d947ec4e4164`.

### A mudança para a Loja Teste, em números

| | Conta Teste Gerente antes → depois | Loja Teste antes → depois |
|---|---|---|
| Instâncias | 3 → 2 | 0 → 1 |
| Vínculo do cofre | 2 → 1 | 0 → 1 |
| Contatos | 9 → 6 | 0 → 3 |
| Conversas | 9 → 6 | 0 → 3 |
| Mensagens | 53 → 44 | 0 → 9 |
| Casamentos de eco | 1 → 0 | 0 → 1 |

Totais do banco iguais antes e depois (182 contatos, 2815 mensagens). O script
conferiu dentro do próprio bloco: contagens de todas as outras Contas/Lojas
iguais, EncaixaRH linha a linha igual, nada do Instagram sobrou na Conta.

Prova de que continua recebendo e respondendo (transação desfeita): uma
mensagem simulada pelo mesmo caminho do webhook entrou na Loja Teste, na mesma
conversa, com 1 não lida; o Gestor da Loja e o Gerente da Conta viram a
conversa, viram a janela de 24 h aberta e gravaram a resposta com o autor
certo. O sino desta conta agora avisa o Gestor da Loja e o Gerente da Conta.

## Passo 1 — deploy da função do nome (PowerShell, uma linha por vez)

```powershell
git fetch origin
git checkout feat/instagram-fatia4a-conversas
Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
npx supabase functions deploy instagram-contact-profile --project-ref pqjkuwyshybxldzpfbbs --use-api
```

**Deu certo quando** termina com
`Deployed Functions on project pqjkuwyshybxldzpfbbs: instagram-contact-profile`.
Ela exige sessão (JWT); sem ela a tela só não busca o nome — nada quebra.

## Passo 2 — testar no localhost

```powershell
npm install
npm run dev
```

Abra http://localhost:8080 e entre como o **Gerente da Conta Teste Gerente**.
O `.env` local já aponta para o banco de produção.

1. **Sem Instagram, a tela de antes.** Com a Conta Teste Gerente no seletor do
   topo, abra Conversas: não aparece chave nenhuma, o subtítulo é "Gerencie
   todas as suas conversas do WhatsApp em um só lugar" e a lista é só
   WhatsApp. (A conta do Instagram saiu da Conta.)
2. **Com Instagram.** No seletor do topo, escolha a **Loja Teste**. No topo da
   lista aparece a chave WhatsApp / Instagram.
3. Clique em **Instagram**: a lista mostra as 3 conversas do Instagram; somem
   "Sincronizar" e "Nova Conversa"; o seletor de instância mostra só a conta do
   Instagram, com "Todas as contas do Instagram".
4. **Nome.** Em alguns segundos os três clientes deixam de ser "Cliente do
   Instagram" e passam a mostrar o nome (ou o @). Conferência no SQL Editor:
   ```sql
   SELECT name, username, profile_status, profile_checked_at
     FROM public.contacts WHERE channel = 'instagram';
   ```
   Esperado: `ok` com nome/@, ou `unavailable` (o cliente bloqueou a conta ou
   nunca mandou mensagem). Nenhum fica `pending` por mais de alguns segundos.
5. **Busca.** No lado do Instagram, busque o @ de um cliente, com e sem a
   arroba: a conversa aparece nas duas.
6. **Selo.** De outro celular, mande uma DM para a conta de teste com o lado
   **WhatsApp** aberto: em até 30 s aparece o número no botão "Instagram". Abra
   a conversa: o número some na hora.
7. **Link direto.** Em Contatos (Loja Teste), clique em "Conversar" num contato
   do Instagram: a tela abre a conversa e a chave vai sozinha para Instagram.
8. **Instâncias.** Em Contatos e em Conversas, o seletor de instância tem
   "Todas as instâncias" e, sem escolha, mostra isso (e não a primeira).

## O eco do celular (resposta pelo app do Instagram) — ENTROU DEPOIS

> **Atualização 2026-09-25:** feito na migração `20260925000004` e no
> `instagram-webhook` v6. O runbook vigente é
> `docs/RUNBOOK_instagram_eco_nao_lidas.md`. O texto abaixo é o registro do
> motivo de ter ficado de fora desta fatia. Duas diferenças em relação à
> receita: a função continuou sendo `process_instagram_message` (ganhou um 7º
> argumento com DEFAULT NULL, no lugar de uma `_v2`) e a guarda também trata
> as linhas sem horário.

Nesta fatia, a resposta dada pelo app do Instagram continuava sem zerar as
não lidas, então a conversa seguia em "Aguardando" até alguém abri-la no
ConvoFlow.

Por quê: a guarda combinada compara o **horário da Meta** do eco com o das
mensagens do cliente (para o eco nunca zerar uma mensagem que chegou depois
dele). Esse horário só existe na entrega do webhook (`messaging[].timestamp`),
e o `instagram-webhook` hoje o descarta — `delivery.ts` não lê o campo e
`toRpcArgs` passa só 6 argumentos. Guardar o horário exige mudar e redeployar
o `instagram-webhook`, que está na lista de intocáveis desta entrega. Sem ele,
a única guarda possível é a ordem de chegada, que é justamente o risco.

O que seria preciso, quando o `instagram-webhook` puder ser tocado:
1. `delivery.ts`: ler `timestamp` (ms desde 1970) de cada item e levá-lo ao RPC;
2. uma função nova, `process_instagram_message_v2(..., p_meta_ts)` — mudar a
   assinatura da atual criaria uma sobrecarga ambígua no caminho quente;
3. guardar o horário da Meta numa tabela ao lado (como `instagram_echo_claims`)
   em vez de coluna nova em `messages`;
4. no ramo do eco: zerar `unread_count` só se não existir mensagem do cliente
   com horário da Meta posterior ao do eco;
5. suíte SQL com as duas ordens (eco antes / depois da mensagem do cliente).

## Desfazer

- Tela: não mergear / reverter os commits.
- Nome: `DROP` das duas funções e das três colunas (bloco ROLLBACK no fim da
  migração `20260925000001`) — tire a tela do ar antes, ela pede as colunas.
- Mudança para a Loja: voltar seria um `UPDATE` de `tenant_id` de volta, nas
  mesmas sete tabelas e pelos mesmos ids (o script não serve ao contrário: as
  guardas dele exigem a instância na Conta). Não é recomendado — a regra agora
  é Instagram só em Loja, e `create_instagram_instance` recusa Conta.
