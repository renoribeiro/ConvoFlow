---
name: "EvolutionAPI-V2"
description: "Documentação de referência da Evolution API v2 para gerenciamento de instâncias WhatsApp. Use esta skill para estruturar chamadas HTTP corretas de listagem, conexão, envio de mensagens, gerenciamento de chats, contatos e grupos."
---

# Evolution API v2 — Documentação de Referência

## Variáveis de Ambiente

Todas as requisições dependem destas variáveis, que devem ser fornecidas pelo usuário ou lidas do ambiente:

  BASE_URL    → URL raiz do servidor (ex: https://seu-servidor.com)
                Nunca inclua /manager/ — esse caminho é só da interface web.
  GLOBAL_KEY  → Global API Key do servidor (header: apikey)
  INSTANCE    → Nome da instância WhatsApp a ser usada
  INST_KEY    → API Key específica da instância (retornada no fetchInstances)

Formato de número: código do país + DDD + número, sem +, espaços ou traços.
  Exemplo brasileiro: 5511999999999

---

## 1. Informações da API

  GET {BASE_URL}/
  Header: apikey: {GLOBAL_KEY}

  Retorna: status, versão da API, URLs do swagger e manager.

---

## 2. Gerenciamento de Instâncias

### 2.1 Listar instâncias
  GET {BASE_URL}/instance/fetchInstances
  Header: apikey: {GLOBAL_KEY}

  Query params opcionais:
    instanceName → filtra pelo nome exato
    instanceId   → filtra pelo ID

  Retorno por instância:
    instanceName      → nome da instância
    instanceId        → UUID da instância
    status            → "open" (conectada) | "close" (desconectada)
    apikey            → chave individual da instância (= INST_KEY)
    owner             → número WhatsApp conectado (ex: 5511...@s.whatsapp.net)
    profileName       → nome do perfil WhatsApp
    integration       → tipo de integração (WHATSAPP-BAILEYS, etc.)

### 2.2 Estado de conexão
  GET {BASE_URL}/instance/connectionState/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

  Retorna: { "state": "open" | "close" | "connecting" }

### 2.3 Conectar / gerar QR Code
  GET {BASE_URL}/instance/connect/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

  Retorna QR Code para escanear com o WhatsApp.

### 2.4 Reiniciar instância
  PUT {BASE_URL}/instance/restart/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

### 2.5 Criar instância
  POST {BASE_URL}/instance/create
  Header: apikey: {GLOBAL_KEY}
  Body:
    {
      "instanceName": "{INSTANCE}",
      "integration": "WHATSAPP-BAILEYS"
    }

### 2.6 Definir presença da instância
  POST {BASE_URL}/instance/setPresence/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}
  Body:
    { "presence": "available" | "unavailable" }

### 2.7 Logout da instância
  DELETE {BASE_URL}/instance/logout/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

### 2.8 Deletar instância
  DELETE {BASE_URL}/instance/delete/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

---

## 3. Envio de Mensagens

> Header obrigatório em todos: apikey: {GLOBAL_KEY} ou {INST_KEY}
> Content-Type: application/json
> {INSTANCE} = nome da instância conectada (status "open")

### 3.1 Texto simples
  POST {BASE_URL}/message/sendText/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "text": "{TEXTO}",
      "delay": 1200,            ← tempo em ms antes de enviar (opcional)
      "linkPreview": true       ← pré-visualização de links (opcional)
    }

### 3.2 Mídia (imagem, vídeo, documento)
  POST {BASE_URL}/message/sendMedia/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "mediatype": "image" | "video" | "document",
      "mimetype": "{MIMETYPE}",  ← ex: "image/jpeg", "application/pdf"
      "caption": "{LEGENDA}",
      "media": "{URL_OU_BASE64}",
      "fileName": "{NOME_DO_ARQUIVO}"
    }

### 3.3 Áudio (PTT / mensagem de voz)
  POST {BASE_URL}/message/sendWhatsAppAudio/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "audio": "{URL_OU_BASE64}",
      "encoding": true
    }

### 3.4 Sticker
  POST {BASE_URL}/message/sendSticker/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "sticker": "{URL_OU_BASE64}"
    }

### 3.5 Localização
  POST {BASE_URL}/message/sendLocation/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "name": "{NOME_DO_LOCAL}",
      "address": "{ENDERECO}",
      "latitude": {LAT},
      "longitude": {LNG}
    }

### 3.6 Contato
  POST {BASE_URL}/message/sendContact/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "contact": [{
        "fullName": "{NOME}",
        "wuid": "{NUMERO_DO_CONTATO}",
        "phoneNumber": "+{NUMERO_DO_CONTATO}"
      }]
    }

### 3.7 Reação
  POST {BASE_URL}/message/sendReaction/{INSTANCE}
  Body:
    {
      "key": { "id": "{ID_DA_MENSAGEM}" },
      "reaction": "{EMOJI}"         ← ex: "👍", "❤️", ""  (vazio = remover)
    }

### 3.8 Enquete
  POST {BASE_URL}/message/sendPoll/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "name": "{TITULO_DA_ENQUETE}",
      "selectableCount": 1,
      "values": ["{OPCAO_1}", "{OPCAO_2}", "{OPCAO_3}"]
    }

### 3.9 Lista interativa
  POST {BASE_URL}/message/sendList/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "title": "{TITULO}",
      "description": "{DESCRICAO}",
      "buttonText": "{TEXTO_DO_BOTAO}",
      "footerText": "{RODAPE}",
      "sections": [{
        "title": "{SECAO}",
        "rows": [{
          "title": "{ITEM}",
          "description": "{DESC_ITEM}",
          "rowId": "{ID_ITEM}"
        }]
      }]
    }

### 3.10 Botões
  POST {BASE_URL}/message/sendButton/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "title": "{TITULO}",
      "description": "{DESCRICAO}",
      "footer": "{RODAPE}",
      "buttons": [{
        "type": "reply",
        "displayText": "{TEXTO_BOTAO}",
        "id": "{ID_BOTAO}"
      }]
    }

---

## 4. Controle de Chat

### 4.1 Verificar se número tem WhatsApp
  POST {BASE_URL}/chat/whatsappNumbers/{INSTANCE}
  Body: { "numbers": ["{NUMERO_1}", "{NUMERO_2}"] }

### 4.2 Marcar mensagem como lida
  POST {BASE_URL}/chat/markMessageAsRead/{INSTANCE}
  Body:
    {
      "read_messages": [{
        "id": "{ID_DA_MENSAGEM}",
        "fromMe": true | false,
        "remoteJid": "{NUMERO}@s.whatsapp.net"
      }]
    }

### 4.3 Marcar como não lida
  POST {BASE_URL}/chat/markMessageAsUnread/{INSTANCE}
  Body: (mesmo formato do 4.2)

### 4.4 Arquivar conversa
  POST {BASE_URL}/chat/archiveChat/{INSTANCE}
  Body:
    {
      "lastMessage": { "key": { "remoteJid": "{NUMERO}@s.whatsapp.net" } },
      "archive": true | false
    }

### 4.5 Deletar mensagem para todos
  DELETE {BASE_URL}/chat/deleteMessageForEveryone/{INSTANCE}
  Body:
    {
      "id": "{ID_DA_MENSAGEM}",
      "fromMe": true,
      "remoteJid": "{NUMERO}@s.whatsapp.net"
    }

### 4.6 Buscar contatos
  POST {BASE_URL}/chat/findContacts/{INSTANCE}
  Body: {}  ← todos | ou { "where": { "pushName": "{NOME}" } } para filtrar

### 4.7 Buscar mensagens
  POST {BASE_URL}/chat/findMessages/{INSTANCE}
  Body:
    {
      "where": {
        "key": { "remoteJid": "{NUMERO}@s.whatsapp.net" }
      }
    }

### 4.8 Buscar conversas
  POST {BASE_URL}/chat/findChats/{INSTANCE}
  Body: {}

### 4.9 Buscar foto de perfil
  POST {BASE_URL}/chat/fetchProfilePictureUrl/{INSTANCE}
  Body: { "number": "{NUMERO}" }

### 4.10 Bloquear / desbloquear contato
  POST {BASE_URL}/chat/updateBlockStatus/{INSTANCE}
  Body:
    {
      "number": "{NUMERO}",
      "status": "block" | "unblock"
    }

---

## 5. Perfil

### 5.1 Buscar perfil
  POST {BASE_URL}/profile/fetchProfile/{INSTANCE}
  Body: { "number": "{NUMERO}" }

### 5.2 Atualizar nome do perfil
  POST {BASE_URL}/profile/updateProfileName/{INSTANCE}
  Body: { "name": "{NOVO_NOME}" }

### 5.3 Atualizar status do perfil
  POST {BASE_URL}/profile/updateProfileStatus/{INSTANCE}
  Body: { "status": "{NOVO_STATUS}" }

### 5.4 Atualizar foto do perfil
  POST {BASE_URL}/profile/updateProfilePicture/{INSTANCE}
  Body: { "picture": "{URL_OU_BASE64}" }

### 5.5 Remover foto do perfil
  DELETE {BASE_URL}/profile/removeProfilePicture/{INSTANCE}

### 5.6 Buscar configurações de privacidade
  GET {BASE_URL}/profile/fetchPrivacySettings/{INSTANCE}

### 5.7 Atualizar configurações de privacidade
  POST {BASE_URL}/profile/updatePrivacySettings/{INSTANCE}
  Body:
    {
      "readreceipts": "all" | "none",
      "profile": "all" | "contacts" | "contact_blacklist" | "none",
      "status": "all" | "contacts" | "contact_blacklist" | "none",
      "online": "all" | "match_last_seen",
      "last": "all" | "contacts" | "contact_blacklist" | "none",
      "groupadd": "all" | "contacts" | "contact_blacklist"
    }

---

## 6. Grupos

### 6.1 Criar grupo
  POST {BASE_URL}/group/create/{INSTANCE}
  Body:
    {
      "subject": "{NOME_DO_GRUPO}",
      "description": "{DESCRICAO}",
      "participants": ["{NUMERO_1}", "{NUMERO_2}"]
    }

### 6.2 Buscar todos os grupos
  GET {BASE_URL}/group/fetchAllGroups/{INSTANCE}?getParticipants=false

### 6.3 Buscar grupo por JID
  GET {BASE_URL}/group/findGroupInfos/{INSTANCE}?groupJid={GROUP_JID}

### 6.4 Buscar membros do grupo
  GET {BASE_URL}/group/participants/{INSTANCE}?groupJid={GROUP_JID}

### 6.5 Adicionar / remover / promover membros
  POST {BASE_URL}/group/updateParticipant/{INSTANCE}
  Body:
    {
      "groupJid": "{GROUP_JID}",
      "action": "add" | "remove" | "promote" | "demote",
      "participants": ["{NUMERO}"]
    }

### 6.6 Atualizar nome do grupo
  POST {BASE_URL}/group/updateGroupSubject/{INSTANCE}
  Body:
    {
      "groupJid": "{GROUP_JID}",
      "subject": "{NOVO_NOME}"
    }

### 6.7 Atualizar descrição do grupo
  POST {BASE_URL}/group/updateGroupDescription/{INSTANCE}
  Body:
    {
      "groupJid": "{GROUP_JID}",
      "description": "{NOVA_DESCRICAO}"
    }

### 6.8 Buscar link de convite
  GET {BASE_URL}/group/inviteCode/{INSTANCE}?groupJid={GROUP_JID}

### 6.9 Revogar link de convite
  POST {BASE_URL}/group/revokeInviteCode/{INSTANCE}
  Body: { "groupJid": "{GROUP_JID}" }

### 6.10 Sair do grupo
  DELETE {BASE_URL}/group/leaveGroup/{INSTANCE}
  Body: { "groupJid": "{GROUP_JID}" }

---

## 7. Webhook

### 7.1 Configurar webhook
  POST {BASE_URL}/webhook/set/{INSTANCE}
  Body:
    {
      "url": "{URL_DO_WEBHOOK}",
      "webhook_by_events": false,
      "webhook_base64": false,
      "events": [
        "APPLICATION_STARTUP",
        "QRCODE_UPDATED",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_DELETE",
        "SEND_MESSAGE",
        "CONTACTS_UPSERT",
        "CONTACTS_UPDATE",
        "PRESENCE_UPDATE",
        "CHATS_UPSERT",
        "CHATS_UPDATE",
        "CHATS_DELETE",
        "GROUPS_UPSERT",
        "GROUP_UPDATE",
        "GROUP_PARTICIPANTS_UPDATE",
        "CONNECTION_UPDATE",
        "CALL",
        "NEW_JWT_TOKEN"
      ]
    }

### 7.2 Consultar webhook configurado
  GET {BASE_URL}/webhook/find/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

---

## 8. Configurações da Instância

### 8.1 Definir configurações
  POST {BASE_URL}/settings/set/{INSTANCE}
  Body:
    {
      "rejectCall": false,
      "msgCall": "{MENSAGEM_AO_REJEITAR_CHAMADA}",
      "groupsIgnore": false,
      "alwaysOnline": false,
      "readMessages": false,
      "readStatus": false,
      "syncFullHistory": false
    }

### 8.2 Consultar configurações
  GET {BASE_URL}/settings/find/{INSTANCE}
  Header: apikey: {GLOBAL_KEY}

---

## 9. Regras de Uso para o Agente

1. Sempre use BASE_URL e GLOBAL_KEY das variáveis de ambiente ou configurações do projeto.
2. Nunca adicione /manager/ à BASE_URL — esse caminho é exclusivo da interface web.
3. Antes de enviar mensagens, verifique se a instância está com status "open" via endpoint 2.2.
4. O {INSTANCE} em todos os endpoints é o instanceName retornado pelo endpoint 2.1.
5. Números sempre no formato E.164 sem +: código do país + DDD + número (ex: 5511999999999).
6. JIDs de grupos terminam em @g.us — JIDs de contatos terminam em @s.whatsapp.net.
7. Para enviar mídia, prefira URL pública acessível; use base64 apenas quando necessário.
8. O campo delay nos envios é em milissegundos — simula digitação humana antes do envio.
9. Respostas com status "PENDING" são normais — o WhatsApp confirma a entrega assincronamente.
10. Em caso de erro 401, a apikey está incorreta ou ausente. Em erro 404, o instanceName não existe.
