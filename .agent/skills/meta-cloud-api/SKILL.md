---
name: "Meta-WhatsApp-Cloud-API"
description: "Documentação de referência da WhatsApp Cloud API oficial da Meta (Graph API). Use esta skill para estruturar chamadas HTTP corretas de envio de mensagens, recebimento via webhook, gerenciamento de números/templates e perfis. Ressalta limitações importantes: sem histórico, sem grupos, janela de 24h e templates obrigatórios."
---

# Meta WhatsApp Cloud API — Documentação de Referência

> Fontes oficiais (2026-05): https://developers.facebook.com/docs/whatsapp/cloud-api,
> https://developers.facebook.com/docs/whatsapp/cloud-api/messages,
> https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks,
> https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers,
> https://developers.facebook.com/docs/whatsapp/cloud-api/messages/template-messages

## Variáveis de Ambiente

Todas as requisições dependem destas variáveis. Quando a instância está cadastrada
no projeto, busque em `whatsapp_instances.connection_config` (não-secretas) e em
`vault.instance_secrets` (token, via RPC `get_instance_meta_token`):

  GRAPH_API_VERSION   → versão da Graph API (default seguro hoje: `v19.0`).
                        Atualize só quando a Meta confirmar deprecação.
  PHONE_NUMBER_ID     → ID numérico do número emparelhado no WABA.
                        Vem do "Cloud API → Phone Numbers" no Meta Business.
  WABA_ID             → ID do WhatsApp Business Account (necessário para
                        templates, subscribe webhook, gerenciar números).
  ACCESS_TOKEN        → Bearer token. Pode ser:
                          • System User Token (recomendado, longa duração).
                          • Token gerado via Embedded Signup (curto + refresh).
                        NUNCA exponha no frontend; chame sempre via edge function.
  VERIFY_TOKEN        → string aleatória que VOCÊ define. Usada apenas no
                        handshake GET inicial do webhook (Meta envia para
                        confirmar a propriedade do endpoint).
  APP_SECRET          → segredo do app na Meta. Usado para validar a
                        assinatura `X-Hub-Signature-256` em todo POST do webhook.

Endpoint base:
  https://graph.facebook.com/{GRAPH_API_VERSION}/

Formato de número (parâmetro `to`):
  Aceita E.164 com ou sem `+`. Recomendado COM `+` para a Meta:
    +5511999999999
  Internamente, normalize antes de chamar — a Meta tolera ambos, mas alguns
  validadores rejeitam números > 15 dígitos sem `+`.

---

## 1. Informações da Conta

### 1.1 Detalhes do número emparelhado
  GET https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}
  Header: Authorization: Bearer {ACCESS_TOKEN}

  Retorna:
    id, display_phone_number, verified_name, quality_rating,
    code_verification_status, messaging_limit_tier, ...

### 1.2 Listar todos os números do WABA
  GET https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/phone_numbers
  Header: Authorization: Bearer {ACCESS_TOKEN}

### 1.3 Validar token / quem é o caller
  GET https://graph.facebook.com/{GRAPH_API_VERSION}/me?access_token={ACCESS_TOKEN}

  Use no fluxo de "verify" do `whatsapp-meta-setup` para confirmar que o
  token está válido e tem `whatsapp_business_messaging` no escopo.

---

## 2. Envio de Mensagens

> Todos os envios usam o MESMO endpoint:
>   POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/messages
> Header obrigatório: `Authorization: Bearer {ACCESS_TOKEN}`
> Content-Type: `application/json`
> Campos comuns no body: `messaging_product: "whatsapp"`, `recipient_type: "individual"`, `to`.

### 2.1 Texto simples
  Body:
    {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": "+5511999999999",
      "type": "text",
      "text": {
        "preview_url": true,
        "body": "{TEXTO}"
      }
    }

  Resposta (200):
    {
      "messaging_product": "whatsapp",
      "contacts": [{ "input": "+5511...", "wa_id": "5511..." }],
      "messages": [{ "id": "wamid.HBgN..." }]
    }

  ⚠️ A `messages[0].id` (`wamid.*`) é o identificador estável — guarde-o no
  banco para correlacionar status updates do webhook.

### 2.2 Imagem
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "image",
      "image": {
        "link": "{URL_PUBLICA_HTTPS}",      ← OU "id": "{MEDIA_ID}" (ver §6)
        "caption": "{LEGENDA_OPCIONAL}"
      }
    }

### 2.3 Vídeo
  Body: idêntico ao 2.2, com `type: "video"` e objeto `video: { link, caption }`.
  Limite: 16 MB via `link`, 100 MB via media upload (`id`).

### 2.4 Documento
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "document",
      "document": {
        "link": "{URL_PUBLICA_HTTPS}",
        "filename": "contrato.pdf",
        "caption": "{LEGENDA_OPCIONAL}"
      }
    }

### 2.5 Áudio (sempre tratado como PTT/voice)
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "audio",
      "audio": { "link": "{URL_PUBLICA_HTTPS_OGG_OPUS}" }
    }
  ⚠️ A Cloud API NÃO distingue PTT vs áudio comum no envio — toda mensagem
  `audio` é renderizada no celular como mensagem de voz. Use formato
  `audio/ogg; codecs=opus` para melhor compatibilidade.

### 2.6 Localização
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "location",
      "location": {
        "latitude": -23.55052,
        "longitude": -46.633308,
        "name": "{NOME_DO_LOCAL}",
        "address": "{ENDERECO}"
      }
    }

### 2.7 Contato
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "contacts",
      "contacts": [{
        "name": { "first_name": "Yuri", "formatted_name": "Yuri Saldanha" },
        "phones": [{ "phone": "+5511...", "type": "CELL", "wa_id": "5511..." }]
      }]
    }

### 2.8 Sticker
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "sticker",
      "sticker": { "id": "{MEDIA_ID_WEBP}" }   ← sticker exige upload prévio (§6)
    }

### 2.9 Reação
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "reaction",
      "reaction": {
        "message_id": "wamid.HBgN...",
        "emoji": "👍"                          ← string vazia "" remove reação
      }
    }

### 2.10 Botões interativos (Reply Buttons — até 3)
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "interactive",
      "interactive": {
        "type": "button",
        "header": { "type": "text", "text": "{TITULO}" },     ← opcional
        "body": { "text": "{TEXTO}" },
        "footer": { "text": "{RODAPE}" },                     ← opcional
        "action": {
          "buttons": [
            { "type": "reply", "reply": { "id": "btn_yes", "title": "Sim" } },
            { "type": "reply", "reply": { "id": "btn_no",  "title": "Não" } }
          ]
        }
      }
    }

### 2.11 Lista interativa (até 10 linhas/seção, 10 seções)
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "interactive",
      "interactive": {
        "type": "list",
        "header": { "type": "text", "text": "{TITULO}" },
        "body": { "text": "{TEXTO}" },
        "footer": { "text": "{RODAPE}" },
        "action": {
          "button": "{ABRIR_MENU}",
          "sections": [{
            "title": "{SECAO}",
            "rows": [
              { "id": "row1", "title": "Opção A", "description": "Detalhe" }
            ]
          }]
        }
      }
    }

### 2.12 Template (OBRIGATÓRIO fora da janela de 24h)
  Body:
    {
      "messaging_product": "whatsapp",
      "to": "{NUMERO}",
      "type": "template",
      "template": {
        "name": "boas_vindas_pt",
        "language": { "code": "pt_BR" },
        "components": [
          { "type": "header",
            "parameters": [{ "type": "image", "image": { "link": "{URL}" } }] },
          { "type": "body",
            "parameters": [
              { "type": "text", "text": "Yuri" },
              { "type": "text", "text": "ConvoFlow" }
            ] },
          { "type": "button",
            "sub_type": "quick_reply",
            "index": "0",
            "parameters": [{ "type": "payload", "payload": "btn_payload" }] }
        ]
      }
    }

  ⚠️ Templates DEVEM estar pré-aprovados na Meta (status APPROVED em §7).
  Marketing templates exigem opt-in registrado.

### 2.13 Mensagem em resposta a outra (reply / quote)
  Adicione o campo `context` em qualquer body acima:
    {
      ...
      "context": { "message_id": "wamid.HBgN..." },
      ...
    }

### 2.14 Marcar mensagem como lida (status read no chat do cliente)
  Body:
    {
      "messaging_product": "whatsapp",
      "status": "read",
      "message_id": "wamid.HBgN..."
    }

### 2.15 Indicador de digitação ("typing_on")
  Body:
    {
      "messaging_product": "whatsapp",
      "status": "read",
      "message_id": "wamid.HBgN...",
      "typing_indicator": { "type": "text" }
    }

  ⚠️ Disponível em todas as Cloud API a partir de 2024-Q4. Combina com
  marcar como lido — Meta exige `status: read` no mesmo payload.

---

## 3. Recebimento via Webhook

### 3.1 Configurar webhook (uma vez por App)
  No App Dashboard da Meta → WhatsApp → Configuration → Webhooks:
    Callback URL = {URL_DO_EDGE_FUNCTION}
    Verify Token = {VERIFY_TOKEN}        ← mesmo string que o seu edge function valida
    Subscribe to: messages, message_template_status_update, account_update,
                  business_capability_update, ...

### 3.2 Subscribe do WABA (uma vez por WABA, programaticamente)
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/subscribed_apps
  Header: Authorization: Bearer {ACCESS_TOKEN}
  Body: {} (vazio)

  Sem essa chamada, o app não recebe webhooks daquele WABA mesmo com URL
  configurada.

### 3.3 Handshake GET (verificação de propriedade)
  Quando você salva a URL no painel, a Meta envia:
    GET {URL_DO_WEBHOOK}?hub.mode=subscribe
                        &hub.verify_token={VERIFY_TOKEN}
                        &hub.challenge={CHALLENGE_RANDOM}

  Seu endpoint deve responder com status 200 e CORPO = `{CHALLENGE_RANDOM}`
  somente se `hub.verify_token === {VERIFY_TOKEN}` configurado. Caso contrário,
  retorne 403.

### 3.4 Validar assinatura POST (`X-Hub-Signature-256`)
  Header: `X-Hub-Signature-256: sha256=<hex_hmac_sha256(raw_body, APP_SECRET)>`
  Recompute usando o body raw (antes do parse JSON) e compare com
  `timingSafeEqual`. Reject 401 se diferente. NUNCA pule essa validação.

### 3.5 Estrutura do payload (mensagens recebidas)
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "{WABA_ID}",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "5511...",
          "phone_number_id": "{PHONE_NUMBER_ID}"
        },
        "contacts": [{
          "profile": { "name": "Yuri" },
          "wa_id": "5511999999999"
        }],
        "messages": [{
          "from": "5511999999999",
          "id": "wamid.HBgN...",
          "timestamp": "1735000000",
          "type": "text",
          "text": { "body": "Olá" },
          "context": { "from": "+5511...", "id": "wamid.PREVIOUS..." }
        }]
      }
    }]
  }]
}
```

  Variações por `type`:
    text       → text.body
    image      → image: { id, mime_type, sha256, caption? }
    video      → video: idem image
    audio      → audio: { id, mime_type, voice: true|false }
    document   → document: { id, filename, mime_type, caption? }
    sticker    → sticker: { id, mime_type, animated }
    location   → location: { latitude, longitude, name?, address? }
    contacts   → contacts: [...]
    reaction   → reaction: { message_id, emoji }
    interactive → interactive: { type: "button_reply"|"list_reply", button_reply|list_reply }
    button     → button: { payload, text }   (resposta de template)

### 3.6 Status updates (statuses[] no mesmo payload)
```json
"statuses": [{
  "id": "wamid.HBgN...",
  "status": "sent" | "delivered" | "read" | "failed",
  "timestamp": "1735000000",
  "recipient_id": "5511999999999",
  "errors": [...]   ← apenas em failed
}]
```

### 3.7 Eventos não relacionados a mensagens
  message_template_status_update → mudança de APPROVED/REJECTED/PAUSED.
  account_update                 → mudanças no WABA.
  business_capability_update     → tier, qualidade.
  phone_number_quality_update    → green/yellow/red rating.

---

## 4. Download de Mídia

### 4.1 Resolver mídia em URL (1ª chamada)
  GET https://graph.facebook.com/{GRAPH_API_VERSION}/{MEDIA_ID}
  Header: Authorization: Bearer {ACCESS_TOKEN}

  Resposta: { "id": "...", "url": "https://lookaside.fbsbx.com/...",
              "mime_type": "...", "sha256": "...", "file_size": ... }

  ⚠️ A `url` retornada é assinada e válida por ~5min — baixe imediatamente.

### 4.2 Baixar bytes (2ª chamada)
  GET {url_retornada_no_4.1}
  Header: Authorization: Bearer {ACCESS_TOKEN}

  ⚠️ É CRÍTICO incluir o Bearer no download — sem ele, a Meta rejeita 401.
  Após baixar, suba para o Supabase Storage e guarde a URL pública lá.

### 4.3 Deletar mídia (opcional, libera quota)
  DELETE https://graph.facebook.com/{GRAPH_API_VERSION}/{MEDIA_ID}

---

## 5. Envio de Mídia (upload-then-send)

### 5.1 Upload
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/media
  Header: Authorization: Bearer {ACCESS_TOKEN}
  Content-Type: multipart/form-data
  Form fields:
    messaging_product = whatsapp
    type              = image/jpeg | video/mp4 | application/pdf | ...
    file              = (binário)

  Retorno: { "id": "{MEDIA_ID}" }

### 5.2 Usar nas mensagens
  Em §2.2 / §2.3 / §2.4 / §2.5 / §2.8, troque `link` por `id: "{MEDIA_ID}"`.
  Vantagem: sem expor URL pública; serve até 100 MB.

---

## 6. Gerenciamento de Números

### 6.1 Solicitar código de verificação
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/request_code
  Body: { "code_method": "SMS", "language": "pt_BR" }

### 6.2 Verificar código
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/verify_code
  Body: { "code": "123456" }

### 6.3 Registrar número (libera para envio)
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/register
  Body: { "messaging_product": "whatsapp", "pin": "{2FA_PIN_NUMERICO_6_DIGITOS}" }

### 6.4 Atualizar perfil business
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{PHONE_NUMBER_ID}/whatsapp_business_profile
  Body:
    {
      "messaging_product": "whatsapp",
      "about": "{ABOUT}",
      "address": "{END}",
      "description": "{DESC}",
      "email": "{EMAIL}",
      "vertical": "OTHER",
      "websites": ["https://..."],
      "profile_picture_handle": "{HANDLE_DO_UPLOAD}"
    }

---

## 7. Templates

### 7.1 Listar templates do WABA
  GET https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/message_templates
       ?fields=name,status,category,language,components&limit=200

### 7.2 Criar template
  POST https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/message_templates
  Body:
    {
      "name": "boas_vindas_pt",
      "language": "pt_BR",
      "category": "MARKETING" | "UTILITY" | "AUTHENTICATION",
      "components": [
        { "type": "HEADER", "format": "TEXT", "text": "Olá, {{1}}!" },
        { "type": "BODY", "text": "Sua confirmação é {{1}}" },
        { "type": "FOOTER", "text": "ConvoFlow" },
        { "type": "BUTTONS",
          "buttons": [{ "type": "QUICK_REPLY", "text": "Confirmar" }] }
      ]
    }

  Status retornado: PENDING → revisão Meta → APPROVED (use com 2.12) | REJECTED | PAUSED.

### 7.3 Deletar template
  DELETE https://graph.facebook.com/{GRAPH_API_VERSION}/{WABA_ID}/message_templates?name={NAME}

---

## 8. Limitações IMPORTANTES (leia antes de planejar funcionalidade)

1. **Sem histórico de conversas via API.** Diferente do Evolution/WAHA, a
   Cloud API NÃO expõe endpoint para "buscar mensagens do chat X". Toda
   mensagem trafegada PRECISA ter chegado pelo seu webhook em tempo real.
   Conversas anteriores ao subscribe do webhook são inacessíveis.

2. **Sem suporte a grupos.** A Cloud API só fala 1:1. Não há endpoint para
   criar/listar/postar em grupos. Funcionalidades de grupo na UI devem ser
   ocultadas/desabilitadas para instâncias `provider = 'official'`.

3. **Janela de atendimento de 24 horas.**
   - Cliente envia mensagem → o número recebe permissão de responder com
     qualquer tipo de conteúdo (livre) durante 24h após a última mensagem
     do cliente.
   - Após as 24h, o número pode INICIAR ou continuar conversa SOMENTE com
     templates aprovados (§7).
   - Tentativas de envio livre fora da janela retornam erro `131047`
     ("Re-engagement message").

4. **Templates exigem aprovação prévia.** Templates novos passam por
   revisão Meta (~24h). Marketing templates exigem opt-in registrado;
   bloqueios crescentes em caso de spam.

5. **Sem grupos, sem broadcast lists.** Para envios em massa use Lists
   próprias + sequência de chamadas individuais.

6. **Tier de mensageria.** Cada número começa com tier baixo (1k clientes
   únicos/24h) e cresce com qualidade. `messaging_limit_tier` em §1.1.

7. **Sem indicação de online/last seen.** A Cloud API não expõe presença
   do contato.

8. **PTT vs áudio normal indistinguível no envio.** Tudo `type: "audio"`
   vira voice note no celular. No webhook, `audio.voice: true` indica que
   foi gravado como voz.

9. **Webhooks são at-least-once.** Implemente deduplicação por `messages[].id`.

10. **Rate limits em pares por destinatário.** Mais que ~80 msg/min para o
    mesmo número resulta em throttling. Espalhe envios.

---

## 9. Códigos de erro mais comuns

  131000  → falha genérica (consulte error_data.details).
  131005  → permissão negada (token sem `whatsapp_business_messaging`).
  131008  → parâmetro obrigatório ausente.
  131009  → parâmetro inválido (ex: número mal formado).
  131016  → meta detected service issue (transient → retry).
  131021  → recipient cannot be sender.
  131026  → mensagem para número que não existe no WhatsApp.
  131047  → fora da janela de 24h sem template (Re-engagement).
  131051  → tipo de mensagem não suportado (Cloud API).
  132001  → template não existe ou não está APPROVED.
  132005  → namespace de template inválido.
  133010  → telefone não registrado (rode §6.3).
  368     → você foi bloqueado pelo cliente.

---

## 10. Regras de Uso para o Agente

1. NUNCA chame Graph API direto do frontend. Todo envio passa por edge
   function (`whatsapp-meta-setup` para setup, futuro `meta-send` ou via
   `job-worker` para envio); o `ACCESS_TOKEN` fica no Vault e só sai pelo
   RPC `get_instance_meta_token` (security definer, service_role only).
2. Antes de qualquer envio livre, verifique se o destinatário enviou
   mensagem nas últimas 24h. Se NÃO, force `type: "template"` (§2.12).
3. Antes de oferecer envio para uma instância `provider='official'`,
   confirme que `register` (§6.3) já foi executado — caso contrário,
   todas as mensagens retornam `133010`.
4. Em qualquer instância Meta, ESCONDA na UI: criação de grupos, listagem
   de grupos, "puxar histórico", funcionalidades dependentes de presença
   online.
5. Em todo POST do webhook, valide `X-Hub-Signature-256` antes de qualquer
   parse. Em GET, valide `hub.verify_token` antes de retornar `hub.challenge`.
6. Mídia recebida tem URL com TTL ~5min. Salve no Supabase Storage assim
   que receber e armazene a URL persistente em `messages.media_url`.
7. Use `wamid.*` como chave estável em `messages.evolution_message_id`
   (ou rename do schema para `provider_message_id`). Faça deduplicação
   por essa coluna em INSERTs.
8. `phone_number_id` é o seletor primário para resolver instância no
   webhook — NUNCA use `display_phone_number` (pode mudar em port-in).
9. Templates: sempre cheque `status === 'APPROVED'` antes de oferecer na
   UI. Cache a lista do §7.1 com TTL 5–10min para reduzir chamadas.
10. Em caso de erro 5xx ou 131016, faça retry com backoff exponencial
    (3 tentativas, 1s/2s/4s). Erros 4xx (exceto 131016) são determinísticos
    — não retry, anote em `messages.status='failed'` com `error_code`.
11. Em deploy, configure obrigatoriamente: `VERIFY_TOKEN` (env), `APP_SECRET`
    (env), `PHONE_NUMBER_ID`/`WABA_ID`/`GRAPH_API_VERSION` (per-instance em
    `connection_config`), `ACCESS_TOKEN` (Vault per-instance).
12. Se o usuário fala "puxar histórico" em uma instância Meta, responda
    explicitamente: "A API oficial da Meta não permite baixar histórico
    anterior à conexão. Apenas mensagens novas, recebidas via webhook,
    aparecem aqui."
