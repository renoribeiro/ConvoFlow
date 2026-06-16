---
name: "WhatsApp-Meta-Policies"
description: "Regras de uso aceitável (Acceptable Use) das APIs de WhatsApp/Meta que o ConvoFlow DEVE respeitar para não tomar restrição/ban de WABA. Consulte ANTES de mexer em qualquer envio em massa (campaigns), automações, follow-ups, onboarding de número (Embedded Signup/register) ou conteúdo de mensagem. Fonte da verdade das políticas + checklist de conformidade + mapa de violações conhecidas no código."
---

# WhatsApp / Meta — Políticas de Uso Aceitável (Compliance)

> ⚠️ Este arquivo existe porque, em **2026-06-15**, um número ("ConvoFlow Teste Chip")
> conectado pelo app teve a WABA **restrita pela Meta** por "violação dos termos de
> uso aceitável dos nossos serviços comerciais". Sempre que tocar em envio de
> mensagens, leia este arquivo + o `.agent/skills/meta-cloud-api/SKILL.md`.

## Fontes oficiais monitoradas (watchlist)

Estas URLs são acompanhadas automaticamente pela Edge Function `policy-watch`
(cron semanal) — ver tabela `whatsapp_policy_documents`. Se uma delas mudar, um
super_admin recebe notificação e ESTE arquivo deve ser revisado/atualizado.

| key | Documento | URL |
|-----|-----------|-----|
| `business-terms`        | WhatsApp Business Terms of Service | https://www.whatsapp.com/legal/business-terms |
| `business-messaging`    | WhatsApp Business Messaging Policy (uso aceitável) | https://www.whatsapp.com/legal/business-policy/ |
| `business-solution`     | WhatsApp Business Solution Terms | https://www.whatsapp.com/legal/business-solution-terms/ |
| `messaging-guidelines`  | WhatsApp Messaging Guidelines | https://www.whatsapp.com/legal/messaging-guidelines |
| `commerce-policy`       | WhatsApp/Meta Commerce Policy | https://www.whatsapp.com/legal/commerce-policy/ |
| `policy-enforcement`    | WhatsApp Business Platform — Policy Enforcement | https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement |
| `meta-terms-business`   | Meta Terms for WhatsApp Business (raiz) | https://www.whatsapp.com/legal/meta-terms-whatsapp-business |

> A "Business Messaging Policy" hoje redireciona (301) para `whatsappbusiness.com/policy`
> — onde estão as regras concretas de uso aceitável. É o documento mais importante.

---

## 1. Regras de OURO (as que mais geram restrição/ban)

1. **Opt-in obrigatório ANTES de mandar qualquer mensagem.**
   > "You may only contact people on WhatsApp if (a) they have given you their
   > mobile phone number; and (b) you have received opt-in permission from the
   > recipient confirming that they wish to receive subsequent messages."
   - Ter o telefone NÃO basta. Precisa de consentimento explícito de receber
     mensagens. O negócio é o único responsável por provar o opt-in.

2. **Fora da janela de 24h → SOMENTE template aprovado.**
   - Se o destinatário não mandou mensagem nas últimas 24h, qualquer envio
     livre (texto/mídia free-form) é proibido e retorna `131047`.
   - Campanha/automação para contato frio = SEMPRE fora da janela = SEMPRE
     precisa de template `APPROVED` da categoria correta (MARKETING/UTILITY).

3. **Não fazer spam / "surpreender" pessoas.**
   > "Do not confuse, deceive, defraud, mislead, spam, or surprise people."
   - "Messaging people at scale in an unauthorized manner" → a Meta pode
     limitar ou remover o acesso.

4. **Respeitar opt-out / bloqueio SEMPRE.**
   > "You must respect all requests (on or off WhatsApp) by a person to block,
   > discontinue, or otherwise opt out... including removing that person from
   > your contacts list."
   - Se o cliente pede "PARE"/"STOP" ou bloqueia, pare e remova da lista.

5. **Qualidade importa — bloqueios/denúncias derrubam o tier.**
   > "People can block or report businesses and our systems will limit the
   > amount of messages a business can send... if the business' quality tier
   > is low for a sustained period of time."
   - Tier inicial baixo (~1k destinatários únicos/24h). Cresce com qualidade,
     despenca com denúncias. Número novo + blast = receita de restrição.

6. **Não usar acesso não autorizado / não oficial em escala.**
   - Operar serviço que usa WhatsApp "in violation of our terms" (ex.: blast
     não autorizado) autoriza a Meta a cortar o acesso.

7. **Não se passar por outra marca/empresa (impersonation).**
   - Perfil business precisa ter info de contato de suporte, precisa e atual.

## 2. Categorias proibidas / restritas (Commerce Policy)

**Proibido sempre:** produtos/serviços ilegais; atividade criminosa; conteúdo
que cause dano. Também proibido por categoria de negócio: pirâmide/MLM,
empréstimo consignado/payday/agiotagem/cobrança de dívida, jogo de azar a
dinheiro real (salvo países liberados), produtos adultos, serviços de namoro,
moeda real/virtual/fake (inclui ICO e opções binárias), partes/fluidos do corpo.

**Restrito (só em países permitidos, com licença e gating de idade):** armas,
álcool e tabaco, drogas (prescrição/recreativas), produtos médicos/saúde,
espécies ameaçadas, animais vivos, materiais perigosos.

**Proibido para mensagens (mesmo que legal):** partidos/políticos/campanhas
políticas; forças policiais/militares/inteligência; conteúdo ofensivo/sexual;
discriminação por característica pessoal.

> Brasil está na lista de países com restrição para OTC drugs e álcool — exige
> licença + gating de idade/região. Não habilitar verticais reguladas sem isso.

## 3. O que causa restrição/suspensão (gatilhos)

- Volume relevante de feedback negativo (bloqueios/denúncias).
- Enviar fora da janela sem template (erros 131047 em massa).
- Número novo disparando em escala sem warm-up.
- Mensagens não solicitadas / sem opt-in.
- Categoria proibida ou impersonation.
- "as determined by us in our sole discretion" — a Meta decide; o ônus da
  prova de conformidade é do negócio.

Enforcement usa tecnologia + revisão humana. Reincidência pode banir a
organização inteira de todos os produtos WhatsApp.

---

## 4. Checklist de conformidade para QUALQUER fluxo de envio

Antes de escrever/alterar código que envia mensagem, garanta:

- [ ] O destinatário tem **opt-in registrado** (campo de consentimento, não só telefone)?
- [ ] O envio respeita a **janela de 24h**? Se fora, está usando **template APPROVED**?
- [ ] Existe filtro de **opt-out / is_blocked** aplicado a TODAS as origens de público (inclusive CSV)?
- [ ] Existe caminho de **opt-out** ("PARE"/"SAIR"/"STOP") que marca o contato e para os envios?
- [ ] Há **throttle** e respeito ao **tier**/limite diário do número?
- [ ] Número **novo** tem **warm-up** (rampa gradual) antes de volume alto?
- [ ] O app reage a webhooks `account_update` / `phone_number_quality_update` (queda de qualidade/restrição)?
- [ ] Conteúdo não cai em **categoria proibida/restrita**?

## 5. Mapa de violações conhecidas no código (auditoria 2026-06-15)

> Atualize esta seção conforme os itens forem corrigidos.

Correções aplicadas em 2026-06-15 (migrations `20260615000002`/`20260615000003` + edge functions). Faltam **deploy** (`supabase db push` + `functions deploy`) e o assinar dos webhooks `account_update`/`phone_number_quality_update` no painel da Meta.

| # | Violação | Onde | Regra ferida | Status |
|---|----------|------|--------------|--------|
| V1 | Campanhas enviam **free-form** fora da janela de 24h | `process-campaign-dispatch`, `meta.ts` | §1.2 | ✅ corrigido (gate de janela p/ official + suporte a template de campanha via `sendTemplate`) |
| V2 | **CSV import ignora** `opt_out_mass_message`/`is_blocked` | `schedule_campaign_messages` | §1.1, §1.4 | ✅ corrigido (CSV respeita opt-out e `require_opt_in`) |
| V3 | **Sem checagem de janela de 24h** em nenhum envio | `whatsapp-send-message`, `job-worker`, `automation-processor`, dispatch | §1.2 | ✅ corrigido (RPC `is_within_service_window` em todos os caminhos de envio official) |
| V4 | **Sem opt-in real** — só telefone, sem consentimento | `contacts`, `CampaignWizardNew.tsx` | §1.1 | ✅ corrigido (colunas `opt_in_*`, opt-out por palavra-chave STOP/PARE/SAIR, toggle `require_opt_in`, UI de consentimento) |
| V5 | **Sem opt-out automático** (STOP) nem auto-block em denúncia | webhooks | §1.4 | ✅ parcial (palavra-chave STOP → `set_contact_opt_out_by_phone` nos 3 webhooks; auto-block por denúncia ainda não — Meta não envia evento de "report") |
| V6 | **Auto-register + envio imediato** (sem warm-up) | `meta-oauth-exchange`, dispatch | §1.5 | ✅ corrigido (cap de warm-up 50/250/1000 por dias desde `registered_at`) |
| V7 | App **ignora** `account_update`/`phone_number_quality_update` | `meta-webhook` | §1.5 | ✅ corrigido (handlers atualizam `is_restricted`/`quality_rating` + notificam admins) — exige assinar os campos no painel da Meta |

## 6. Regras de Uso para o Agente

1. NUNCA implemente envio em massa / automação sem checar opt-in + janela de 24h
   (force template fora da janela). Use o checklist da §4.
2. Toda origem de público (tags, lista, CSV, importação) DEVE passar pelos
   filtros `opt_out_mass_message = false AND is_blocked = false`.
3. Se a `policy-watch` sinalizar mudança em alguma URL da watchlist, releia o
   documento alterado e atualize as §1–§3 deste arquivo no mesmo PR.
4. Ao habilitar qualquer vertical regulada (saúde, álcool, financeiro), exija
   licença + gating de idade/região — ou bloqueie no produto.
5. Não afirme regra da Meta de memória. Confirme na fonte (URLs da watchlist).
