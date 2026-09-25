# Instagram fatia 4a — Contatos e Instâncias e APIs (2ª entrega)

Branch `feat/instagram-fatia4a-contatos-instancias`:

1. `fix(contatos)`: o formulário de contato volta a salvar.
2. `feat(contatos)`: canal WhatsApp / Instagram em Contatos.
3. `feat(instancias)`: seções WhatsApp e Instagram em Instâncias e APIs.
4. `docs`: este runbook.
5. `feat(instagram)`: contato do Instagram fora do público da campanha e do
   follow-up automático (Agendado e Sequência). Decisão do dono.

A rede de segurança no servidor não foi tocada: `schedule_campaign_messages`
só agenda contato com telefone, `process-campaign-dispatch` falha a execução
sem telefone e `process-followup-dispatch` cancela o agendado e pula o passo
de WhatsApp da sequência.

## Estado

| O quê | Situação |
|---|---|
| Código | pushado, PR aberta, **não mergeada** |
| Migração | **nenhuma** |
| Edge function | **nenhuma** (nada deployado; meta-webhook, instagram-webhook, instagram-send-message e envio de WhatsApp intocados) |
| Frontend | vai para o ar sozinho no merge (Vercel) |

## O achado do formulário

"Editar Contato" e "Novo Contato" não salvavam **nenhum** contato desde
**2025-08-18** (commit `42396ce`), de WhatsApp ou não, em todas as Contas —
EncaixaRH inclusive. Três portões em série:

1. a validação exigia `tenant_id`, que o formulário nunca manda — a pessoa via
   "Por favor, corrija os erros no formulário" sem campo marcado, e o botão
   Salvar travava até fechar;
2. o hook de mutação repetia a validação e recusava os `null`;
3. o payload levava `assigned_to`, coluna que não existe em `contacts`.

Prova no banco: dos 182 contatos, os únicos com e-mail ou observação são os 5
de um seed SQL; a EncaixaRH (172) tem zero. O campo "Responsável" saiu (nunca
gravou nada).

## Testar no localhost (PowerShell, uma linha por vez)

```powershell
git fetch origin
git checkout feat/instagram-fatia4a-contatos-instancias
npm install
npm run dev
```

Abra http://localhost:8080 e entre como o **Gerente da Conta Teste Gerente**.

> O localhost fala com o banco de produção. Os passos 1 e 3 gravam de verdade
> (uma observação em contato de teste). Apague a observação no fim.

1. **Formulário (WhatsApp).** No seletor do topo, **Conta Teste Gerente**.
   Contatos › "Ana Beatriz Nogueira" › `⋯` › Editar. Escreva algo em
   Observações › **Salvar**.
   *Deu certo quando* aparece "Contato atualizado com sucesso!", a janela fecha
   e, reabrindo, a observação está lá. Antes desta branch, aparecia "Por favor,
   corrija os erros no formulário".
2. **Contatos da Conta (só WhatsApp).** Na mesma Conta: **não** aparece o
   filtro Todos / WhatsApp / Instagram; o seletor diz "Todas as instâncias"; a
   busca diz "Nome ou telefone..."; cada contato tem o logo do WhatsApp ao lado
   do nome e o telefone embaixo. É a tela de sempre, mais o logo.
3. **Contatos da Loja (Instagram).** Seletor do topo › **Loja Teste**.
   Contatos: aparece o filtro **Todos / WhatsApp / Instagram**; os três
   contatos têm o logo do Instagram e o @ no lugar do telefone. Busque
   `@oyuri` — sobra "Yuri Saldanha | Tráfego Pago". Clique em **WhatsApp** —
   a lista fica vazia (a Loja só tem Instagram). Volte para Todos, `⋯` ›
   Editar num contato: **não** há campo Telefone; o campo "Instagram" mostra o
   @ e não deixa editar. Salve uma observação: "Contato atualizado com
   sucesso!".
4. **Exportar.** Ainda na Loja Teste, "Exportar": o CSV tem as colunas
   "Canal" e "Usuário do Instagram".
5. **Paleta.** `Ctrl+K`, digite `oyuri`: o contato aparece com o @ embaixo, e
   a conta "Instagram Teste" fica no grupo "Contas do Instagram", não em
   "Sessões WhatsApp".
6. **Instâncias e APIs (Loja Teste).** Duas seções: "Instâncias WhatsApp" diz
   "Nenhuma instância de WhatsApp cadastrada."; "Contas do Instagram" mostra
   "Instagram Teste", "Conta: @convoflow", "Válida até 24/11/2026 às 07:43" e
   "Conectado". Sem "Chave", sem botão de conectar. No topo: "Total de
   conexões 1 — 0 instâncias de WhatsApp · 1 conta do Instagram",
   "Conectados 1".
7. **Excluir (é seguro: vai ser recusado).** Lixeira do cartão do Instagram:
   "Excluir conta do Instagram", "Conta @convoflow", "Canal Instagram",
   "Exclusão recusada: esta conta guarda histórico" com Conversas 3,
   Mensagens 9, Contatos 3 — e **sem** botão de excluir. Feche.
8. **Instâncias e APIs (Conta Teste Gerente).** Seletor › Conta Teste Gerente:
   uma seção só, "Total de Instâncias 2", linhas com "Chave:" e os botões de
   sempre. É a tela de antes.
9. **Campanha: WhatsApp igual a antes.** Seletor › **Conta Teste Gerente** ›
   Campanhas › "Nova Campanha". Preencha nome, a instância "Teste_APP_META" e
   a mensagem, "Próximo", e no passo Público clique em **Contatos**: os
   contatos de WhatsApp aparecem como sempre (nome e telefone). Feche sem
   salvar. O Instagram escondido não dá para ver no localhost: nenhuma Loja de
   teste tem, ao mesmo tempo, instância de WhatsApp conectada e contato do
   Instagram — na Loja Teste o assistente para no passo 1, porque a única
   conexão dela é o Instagram (aparece desabilitada, "(desconectada)"). Quem
   prova o Instagram fora da lista é o teste
   `src/components/campaigns/CampaignWizardNew.channel.test.tsx`.
10. **Follow-up automático não oferece Instagram.** Loja Teste › Follow-ups ›
    "Novo Follow-up". Em **Manual**, o seletor de contato mostra os 3 contatos
    do Instagram (com o @) — junto com os de WhatsApp da Conta, porque o
    Gerente enxerga as duas. Troque para **Agendado** e depois **Sequência**:
    os do Instagram somem e os de WhatsApp continuam, com nome e telefone.
    Escolha um do Instagram no Manual e troque para Agendado: a escolha volta
    para "Selecione um contato". Feche sem salvar.

Limpeza: apague a observação dos passos 1 e 3 (Editar › apague › Salvar — o
campo vazio grava NULL).

## Desfazer

Não mergear, ou reverter os commits da lista do topo. Não há nada no servidor para
desfazer.
