---
name: "WAHA-API"
description: "Documentação de referência da WAHA API (WhatsApp HTTP API self-hosted) — Core e Plus. Use esta skill para estruturar chamadas HTTP corretas de gerenciamento de sessão, envio de mensagens, controle de chats, contatos, grupos e webhooks. Indica explicitamente o que é exclusivo da edição Plus."
---

# WAHA API — Documentação de Referência

> Fontes oficiais (2026-05): https://waha.devlike.pro/docs/ (Swagger),
> https://waha.devlike.pro/docs/how-to/sessions/,
> https://waha.devlike.pro/docs/how-to/send-messages/,
> https://waha.devlike.pro/docs/how-to/webhooks/,
> https://waha.devlike.pro/docs/overview/engines/
>
> Deploy interno de referência: https://docs.memudecore.com.br/books/implementacoes/page/relatorio-de-instalacao-waha
> Veja §11 para particularidades desse deploy.

## Variáveis de Ambiente

Todas as requisições dependem destas variáveis, fornecidas pelo usuário ou lidas
do banco da instância (`whatsapp_instances.connection_config`):

  BASE_URL    → URL raiz do servidor WAHA (ex: https://waha.seu-dominio.com)
                Sem `/dashboard/` no final — esse caminho é exclusivo da UI web.
  API_KEY     → Chave global de API (header: `X-Api-Key`).
                Em deploys WAHA, equivale ao `WAHA_API_KEY` configurado no servidor.
  SESSION     → Nome da sessão WhatsApp a ser usada (ex: "default", "client-01").
                Em alguns endpoints aparece como path param, em outros como `session`
                no corpo da requisição.

Edição (Engine):
  CORE        → Engine `WEBJS` (Puppeteer) — gratuito, recursos limitados.
  PLUS        → Engines `NOWEB` / `GOWS` — recursos completos, suporte comercial.
  Sempre confirme a edição antes de usar recursos avançados (ver §3 e §10).

Formato de número: código do país + DDD + número, sem `+`, espaços ou traços —
mesmo padrão do Evolution. Internamente, WAHA aceita o formato `<numero>@c.us`
para contatos individuais e `<id>@g.us` para grupos. Sempre que o body pedir
`chatId`, use o formato com sufixo `@c.us` ou `@g.us`.

  Exemplo brasileiro individual: 5511999999999  →  5511999999999@c.us

---

## 1. Informações do Servidor

### 1.1 Status do servidor
  GET {BASE_URL}/api/server/status
  Header: X-Api-Key: {API_KEY}

  Retorna versão do WAHA, engine ativa (WEBJS, NOWEB, GOWS), uptime.

### 1.2 Versão / health-check
  GET {BASE_URL}/api/server/version
  GET {BASE_URL}/api/health   ← liveness (sem auth na maioria dos deploys)

---

## 2. Gerenciamento de Sessões

> Em WAHA, "session" é o equivalente a "instance" do Evolution.
> Cada sessão tem seu próprio número WhatsApp emparelhado.

### 2.1 Listar sessões
  GET {BASE_URL}/api/sessions
  Header: X-Api-Key: {API_KEY}

  Query params opcionais:
    all → true para listar também sessões paradas

  Retorno por sessão:
    name        → nome da sessão (= SESSION)
    status      → "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED" | "STOPPED"
    config      → objeto com webhooks, proxy, etc.
    me          → { id, pushName } quando WORKING
    engine      → "WEBJS" | "NOWEB" | "GOWS"

### 2.2 Detalhes de uma sessão
  GET {BASE_URL}/api/sessions/{SESSION}
  Header: X-Api-Key: {API_KEY}

### 2.3 Criar / atualizar sessão (idempotente)
  POST {BASE_URL}/api/sessions
  Header: X-Api-Key: {API_KEY}
  Body:
    {
      "name": "{SESSION}",
      "start": true,
      "config": {
        "webhooks": [{
          "url": "{URL_DO_WEBHOOK}",
          "events": ["message", "message.ack", "session.status"],
          "hmac": { "key": "{SEGREDO_HMAC}" },     ← opcional, valida assinatura
          "retries": { "delaySeconds": 2, "attempts": 5 }
        }],
        "proxy": null,
        "noweb": { "store": { "enabled": true, "fullSync": false } }
      }
    }

  Atalho equivalente (compat. v1):
    POST {BASE_URL}/api/sessions/start
    Body: { "name": "{SESSION}" }

### 2.4 Iniciar sessão existente
  POST {BASE_URL}/api/sessions/{SESSION}/start
  Header: X-Api-Key: {API_KEY}

### 2.5 Parar sessão (mantém credenciais)
  POST {BASE_URL}/api/sessions/{SESSION}/stop
  Header: X-Api-Key: {API_KEY}

### 2.6 Logout (remove credenciais, força novo QR no próximo start)
  POST {BASE_URL}/api/sessions/{SESSION}/logout
  Header: X-Api-Key: {API_KEY}

### 2.7 Deletar sessão
  DELETE {BASE_URL}/api/sessions/{SESSION}
  Header: X-Api-Key: {API_KEY}

### 2.8 Obter QR Code
  GET {BASE_URL}/api/{SESSION}/auth/qr?format=image
  Header: X-Api-Key: {API_KEY}
  Accept: image/png   ← retorna PNG binário

  Para receber em base64:
  GET {BASE_URL}/api/{SESSION}/auth/qr?format=raw

  Retorno raw:
    { "value": "data:image/png;base64,iVBORw0KGgo..." , "mimetype": "image/png" }

### 2.9 Pareamento por código (opção sem QR)
  POST {BASE_URL}/api/{SESSION}/auth/request-code
  Body: { "phoneNumber": "{NUMERO}" }
  Retorna: { "code": "ABCD-1234" } → cliente digita no celular.

### 2.10 Status de uma sessão (atalho)
  GET {BASE_URL}/api/sessions/{SESSION}/me
  Retorna o número emparelhado e pushName da sessão WORKING.

---

## 3. Envio de Mensagens

> Header obrigatório em todos: `X-Api-Key: {API_KEY}`
> Content-Type: `application/json`
> Em todos os bodies, `session` aponta para `{SESSION}` (algumas variantes
> aceitam o nome no path; padrão moderno é no body).
> O destinatário é sempre `chatId` no formato `5511999999999@c.us` ou
> `<groupId>@g.us`.

### 3.1 Texto simples
  POST {BASE_URL}/api/sendText
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "text": "{TEXTO}",
      "linkPreview": true,                 ← opcional
      "reply_to": null                     ← opcional, ID de mensagem citada
    }

### 3.2 Imagem
  POST {BASE_URL}/api/sendImage
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "file": {
        "url": "{URL_PUBLICA}",            ← OU "data": "<base64>"
        "filename": "foto.jpg",
        "mimetype": "image/jpeg"
      },
      "caption": "{LEGENDA}"
    }

### 3.3 Vídeo
  POST {BASE_URL}/api/sendVideo
  Body: (mesma estrutura do 3.2; mimetype `video/mp4`)
  Campos extras: `convert: true` → faz transcoding no servidor (Plus).

### 3.4 Documento
  POST {BASE_URL}/api/sendFile
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "file": {
        "url": "{URL_PUBLICA}",
        "filename": "contrato.pdf",
        "mimetype": "application/pdf"
      },
      "caption": "{LEGENDA_OPCIONAL}"
    }

### 3.5 Áudio (PTT / mensagem de voz)
  POST {BASE_URL}/api/sendVoice
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "file": {
        "url": "{URL_PUBLICA_OGG_OPUS}",   ← formato preferido: audio/ogg; codecs=opus
        "mimetype": "audio/ogg; codecs=opus"
      },
      "convert": true                      ← Plus: converte para o formato correto
    }

  Áudio comum (não-PTT):
  POST {BASE_URL}/api/sendAudio
  Body: idêntico, mas sem semântica de voice note.

### 3.6 Localização
  POST {BASE_URL}/api/sendLocation
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "latitude": -23.55052,
      "longitude": -46.633308,
      "title": "{NOME_DO_LOCAL}"
    }

### 3.7 Contato (vCard)
  POST {BASE_URL}/api/sendContactVcard
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "contacts": [{
        "fullName": "{NOME}",
        "phoneNumber": "{NUMERO_DO_CONTATO}",
        "vcard": null   ← se omitido, WAHA monta automaticamente
      }]
    }

### 3.8 Reação
  PUT {BASE_URL}/api/reaction
  Body:
    {
      "session": "{SESSION}",
      "messageId": "false_5511999999999@c.us_3EB0XXXX",
      "reaction": "👍"     ← string vazia "" remove a reação
    }

### 3.9 Sticker
  POST {BASE_URL}/api/sendSticker  *(Plus)*
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "file": { "url": "{URL_WEBP}", "mimetype": "image/webp" }
    }
  Em Core, é possível enviar como imagem comum, mas não vira sticker animado.

### 3.10 Botões interativos *(Plus only)*
  POST {BASE_URL}/api/sendButtons
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "header": "{TITULO}",
      "body": "{TEXTO}",
      "footer": "{RODAPE}",
      "buttons": [
        { "type": "reply", "id": "btn_yes", "text": "Sim" },
        { "type": "reply", "id": "btn_no",  "text": "Não" }
      ]
    }
  Em Core, a chamada retorna 501 NotImplemented — use texto numerado como fallback.

### 3.11 Lista interativa *(Plus only)*
  POST {BASE_URL}/api/sendList
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "title": "{TITULO}",
      "description": "{DESCRICAO}",
      "buttonText": "{ABRIR_MENU}",
      "footer": "{RODAPE}",
      "sections": [{
        "title": "{SECAO}",
        "rows": [
          { "id": "row1", "title": "Opção A", "description": "Detalhe" }
        ]
      }]
    }

### 3.12 Enquete *(Plus only)*
  POST {BASE_URL}/api/sendPoll
  Body:
    {
      "session": "{SESSION}",
      "chatId": "{NUMERO}@c.us",
      "poll": {
        "name": "{PERGUNTA}",
        "options": ["A", "B", "C"],
        "multipleAnswers": false
      }
    }

### 3.13 Indicador de digitação / gravação
  POST {BASE_URL}/api/startTyping       Body: { session, chatId }
  POST {BASE_URL}/api/stopTyping        Body: { session, chatId }
  POST {BASE_URL}/api/sendSeen          Body: { session, chatId, messageId? }

  (Recomendado intervalar 1–3s entre start/stop antes de enviar texto.)

---

## 4. Recebimento via Webhook

### 4.1 Configurar webhook
  Configurado no momento da criação da sessão (ver §2.3) ou via:
  PUT {BASE_URL}/api/sessions/{SESSION}
  Body:
    {
      "config": {
        "webhooks": [{
          "url": "{URL_DO_WEBHOOK}",
          "events": ["message", "message.ack", "session.status",
                     "message.reaction", "message.revoked", "group.join",
                     "group.leave", "presence.update", "poll.vote"],
          "hmac": { "key": "{SEGREDO_HMAC}" },
          "retries": { "delaySeconds": 2, "attempts": 5 }
        }]
      }
    }

  Eventos disponíveis (subscribe ao que precisar):
    message              → toda mensagem recebida (entrante)
    message.any          → mensagem entrante OU enviada (eco do que você enviou)
    message.ack          → mudança de status (1=server, 2=device, 3=read, 4=played)
    message.reaction     → reação adicionada/removida
    message.revoked      → mensagem deletada para todos
    session.status       → mudanças de STARTING → SCAN_QR_CODE → WORKING → ...
    group.join / leave   → entrada/saída em grupos
    poll.vote            → voto em enquete (Plus)
    chat.archive         → conversa arquivada/desarquivada
    presence.update      → online/offline/typing
    call.received / accepted / rejected (Plus)

### 4.2 Estrutura do payload `message`
```json
{
  "id": "evt-uuid",
  "timestamp": 1735000000,
  "event": "message",
  "session": "default",
  "engine": "NOWEB",
  "payload": {
    "id": "false_5511999999999@c.us_3EB0XXXX",
    "timestamp": 1735000000,
    "from": "5511999999999@c.us",
    "fromMe": false,
    "to": "5511888888888@c.us",
    "body": "Olá",
    "hasMedia": false,
    "media": null,
    "type": "chat",                 ← chat | image | video | audio | document | location | vcard | sticker | poll | buttons_response | list_response | reaction
    "ack": 1,
    "ackName": "DEVICE",
    "_data": { ... }                ← payload bruto da engine
  }
}
```

  Para mensagens com mídia (`hasMedia: true`), `payload.media` traz:
    { "url": "https://...", "mimetype": "...", "filename": "...", "s3": null }
  ⚠️ A `media.url` é assinada e expira — baixe e salve no seu storage assim
  que receber o webhook.

### 4.3 Validar assinatura HMAC (recomendado)
  Quando `hmac.key` está configurado, WAHA envia header:
    X-Webhook-Hmac: <hmac-sha512(JSON_BODY, key)>

  Recompute o HMAC do body bruto e compare em `timingSafeEqual`.

### 4.4 Listar webhooks configurados
  GET {BASE_URL}/api/sessions/{SESSION}
  → o objeto `config.webhooks` traz os endpoints registrados.

---

## 5. Controle de Chats

### 5.1 Listar chats
  GET {BASE_URL}/api/{SESSION}/chats
  Query: limit, offset, sortBy=conversationTimestamp, sortOrder=desc

### 5.2 Detalhes de um chat
  GET {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}    ← CHAT_ID = "5511999999999@c.us"

### 5.3 Marcar como lido
  POST {BASE_URL}/api/sendSeen
  Body: { "session": "{SESSION}", "chatId": "{CHAT_ID}" }

### 5.4 Marcar como não lido (Plus)
  POST {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/unread

### 5.5 Arquivar / desarquivar
  POST {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/archive
  POST {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/unarchive

### 5.6 Fixar / desafixar (Plus)
  POST {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/pin
  POST {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/unpin

### 5.7 Buscar mensagens de um chat (histórico)
  GET {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/messages?limit=50&offset=0&downloadMedia=false

### 5.8 Deletar mensagem (para todos)
  DELETE {BASE_URL}/api/{SESSION}/chats/{CHAT_ID}/messages/{MESSAGE_ID}?forEveryone=true

### 5.9 Encaminhar mensagem
  POST {BASE_URL}/api/forwardMessage
  Body: { "session", "chatId", "messageId" }

---

## 6. Contatos

### 6.1 Listar contatos
  GET {BASE_URL}/api/{SESSION}/contacts/all

### 6.2 Verificar se número possui WhatsApp
  GET {BASE_URL}/api/{SESSION}/contacts/check-exists?phone={NUMERO}
  Retorno: { "numberExists": true, "chatId": "{NUMERO}@c.us" }

### 6.3 Buscar foto de perfil
  GET {BASE_URL}/api/{SESSION}/contacts/profile-picture?contactId={CHAT_ID}

### 6.4 Bloquear / desbloquear (Plus)
  POST {BASE_URL}/api/{SESSION}/contacts/block      Body: { contactId }
  POST {BASE_URL}/api/{SESSION}/contacts/unblock    Body: { contactId }

### 6.5 Buscar status / about
  GET {BASE_URL}/api/{SESSION}/contacts/about?contactId={CHAT_ID}

---

## 7. Grupos

> Suportado em ambas edições. Em CORE algumas operações de admin podem
> falhar por limitações da engine WEBJS — verifique a resposta.

### 7.1 Listar grupos
  GET {BASE_URL}/api/{SESSION}/groups

### 7.2 Criar grupo
  POST {BASE_URL}/api/{SESSION}/groups
  Body:
    {
      "name": "{NOME_DO_GRUPO}",
      "participants": [{ "id": "{NUMERO}@c.us" }]
    }

### 7.3 Detalhes de um grupo
  GET {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}

### 7.4 Atualizar nome / descrição
  PUT {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/subject     Body: { subject }
  PUT {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/description Body: { description }

### 7.5 Adicionar / remover / promover / despromover membros
  POST   {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/participants/add
  POST   {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/participants/remove
  POST   {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/admin/promote
  POST   {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/admin/demote
  Body em todos: { "participants": ["{NUMERO}@c.us"] }

### 7.6 Sair do grupo
  POST {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/leave

### 7.7 Link de convite
  GET    {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/invite-code
  POST   {BASE_URL}/api/{SESSION}/groups/{GROUP_ID}/invite-code/revoke

---

## 8. Perfil da Sessão

### 8.1 Buscar perfil
  GET {BASE_URL}/api/{SESSION}/profile/me

### 8.2 Atualizar nome
  PUT {BASE_URL}/api/{SESSION}/profile/name      Body: { name }

### 8.3 Atualizar status (about)
  PUT {BASE_URL}/api/{SESSION}/profile/status    Body: { status }

### 8.4 Atualizar foto
  PUT {BASE_URL}/api/{SESSION}/profile/picture
  Body: { "file": { "url": "{URL}", "mimetype": "image/jpeg" } }

### 8.5 Remover foto
  DELETE {BASE_URL}/api/{SESSION}/profile/picture

---

## 9. Diferenças Core vs Plus (resumo executivo)

| Recurso                          | Core (WEBJS) | Plus (NOWEB / GOWS) |
|----------------------------------|:------------:|:-------------------:|
| Texto, imagem, vídeo, doc, áudio |      ✅      |          ✅          |
| Localização, contato (vCard)     |      ✅      |          ✅          |
| Reações                          |      ✅      |          ✅          |
| Sticker animado                  |   parcial    |          ✅          |
| Botões interativos               |      ❌      |          ✅          |
| Listas interativas               |      ❌      |          ✅          |
| Enquetes                         |      ❌      |          ✅          |
| Bloquear / desbloquear           |   parcial    |          ✅          |
| Marcar não lido                  |      ❌      |          ✅          |
| Pin/Unpin chat                   |      ❌      |          ✅          |
| Chamadas (call.* events)         |      ❌      |          ✅          |
| Voz convertida (`convert:true`)  |      ❌      |          ✅          |
| Estabilidade em produção         |   instável   |       estável       |

Ao tentar um endpoint Plus em servidor Core, o retorno é geralmente
`501 Not Implemented` ou `400 Bad Request` com mensagem indicando que a
engine atual não suporta. Sempre cheque `engine` em §1.1 antes de oferecer
recursos avançados na UI.

---

## 10. Regras de Uso para o Agente

1. Sempre leia BASE_URL e API_KEY de `whatsapp_instances.connection_config`
   (campos `baseUrl` / `apiKey`) ou de variáveis de ambiente. Nunca hardcode.
2. Header de autenticação em todas as requisições: `X-Api-Key: {API_KEY}`.
3. Antes de enviar mensagens, verifique se a sessão está com `status: "WORKING"`
   via §2.2. Status `SCAN_QR_CODE`, `STARTING`, `STOPPED` ou `FAILED` significa
   que enviar vai falhar.
4. Sempre forme `chatId` com sufixo: `@c.us` para contatos individuais,
   `@g.us` para grupos. O número cru sem sufixo causa erro 400.
5. Antes de oferecer botões, listas ou enquetes na UI, valide a engine
   (§1.1 + tabela §9). Em Core, faça fallback automático para texto numerado
   ("1) Sim\n2) Não").
6. Na criação de sessões (§2.3), sempre configure `webhooks` com pelo menos
   `["message", "message.ack", "session.status"]`. Sem webhook, mensagens
   recebidas precisam ser puxadas via polling — caro e lento.
7. Sempre que possível, configure `hmac.key` no webhook e valide a assinatura
   no edge function antes de processar o payload.
8. Mídia recebida em webhook (`payload.media.url`) é uma URL assinada com TTL
   curto. Baixe e suba para o seu storage (Supabase Storage) na primeira
   passagem — não armazene apenas a URL temporária.
9. O campo `payload.id` segue o padrão `<fromMe>_<chatId>_<waMessageId>`
   (ex: `false_5511...@c.us_3EB0XXXX`). Use o trecho final como chave estável
   para deduplicação cruzada com outros providers.
10. WAHA não tem o conceito de "Global API Key vs Instance API Key" do
    Evolution. Há apenas a `WAHA_API_KEY` global do servidor. Para isolar
    inquilinos, use sessões separadas e RBAC no seu próprio gateway.
11. Em erro 401, a `X-Api-Key` está incorreta ou ausente. Em 404, o nome
    da sessão não existe. Em 422, o body não passou na validação Pydantic
    (leia `detail[]` no JSON de erro).
12. Para "puxar histórico" de uma conversa que já existia antes da sessão
    iniciar, use §5.7. Em CORE, somente mensagens novas (após início da
    sessão) ficam disponíveis; em PLUS NOWEB com `noweb.store.fullSync: true`,
    é possível baixar histórico mais antigo.

---

## 11. Deploy de referência: WAHA memudecore

Este é o deploy oficial usado em produção pelo time. Quando o cliente final
não fornece detalhes próprios, assuma estes valores como padrão. Fonte:
https://docs.memudecore.com.br/books/implementacoes/page/relatorio-de-instalacao-waha

### 11.1 Coordenadas

  BASE_URL    → https://waha.memudecore.com.br
  Porta       → 3000 (atrás de Traefik / Let's Encrypt — use HTTPS sem porta)
  Engine      → NOWEB (Plus — compatível com ARM64)
  Swagger UI  → https://waha.memudecore.com.br/docs
  Health      → GET https://waha.memudecore.com.br/api/health   (sem auth)
  Webhook     → https://n8n.memudecore.com.br/webhook/waha       (consumidor n8n)
  Sessão pad. → "default"

  API_KEY     → fornecida fora-de-banda; não está publicada na doc.
                Configure em `whatsapp_instances.connection_config.apiKey`.

  Infra       → Docker Swarm + rede `minha_rede`, TLS via Let's Encrypt/Traefik.

### 11.2 Criação de sessão validada (vai para o consumidor n8n)

  POST https://waha.memudecore.com.br/api/sessions
  Header: X-Api-Key: {API_KEY}
  Body:
    {
      "name": "default",
      "start": true,
      "config": {
        "webhooks": [{
          "url": "https://n8n.memudecore.com.br/webhook/waha",
          "events": ["message", "message.ack", "session.status"]
        }]
      }
    }

  Para integrar com o ConvoFlow, substitua `url` pela edge function
  `waha-webhook` do projeto Supabase do tenant. Os dois consumidores podem
  conviver — basta listar mais de um objeto no array `webhooks`.

### 11.3 Envio mínimo validado

  POST https://waha.memudecore.com.br/api/sendText
  Header: X-Api-Key: {API_KEY}
  Body:
    {
      "session": "default",
      "chatId": "5511999999999@c.us",
      "text": "Mensagem via WAHA"
    }

  ⚠️ Observação: o relatório usa o endpoint `/api/sendText` (camelCase).
  Variantes legadas tipo `/api/send/text` ou `/api/messages/send` **não**
  existem nesta build — usá-las retorna 404.

### 11.4 Boas práticas neste deploy

- A engine é NOWEB. Aceite que `noweb.store.fullSync` precisa ser combinado
  com o sysadmin antes de ligar (consome RAM/disco no servidor compartilhado).
- O servidor é compartilhado com Evolution (`https://evo.memudecore.com.br/manager`).
  Não suba sessões com o mesmo `name="default"` em ambos sem coordenar — o
  número WhatsApp não pode estar emparelhado em dois lugares.
- Como o webhook nativo já aponta para o n8n, ao plugar o ConvoFlow adicione
  um segundo entry no array `config.webhooks` em vez de sobrescrever.
- O proxy Traefik finaliza TLS; sempre use a URL `https://` sem porta. Apontar
  para `http://waha.memudecore.com.br:3000` direto pode falhar TLS handshake.
