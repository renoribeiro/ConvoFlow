import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';
const remoteJid = '558585083963@s.whatsapp.net';

function extractMessageContent(message) {
  if (!message) return { content: '', messageType: 'unknown' };

  if (message.conversation) {
    return { content: message.conversation, messageType: 'text' };
  }
  if (message.extendedTextMessage?.text) {
    return { content: message.extendedTextMessage.text, messageType: 'text' };
  }
  if (message.imageMessage) {
    return { content: message.imageMessage.caption || '[Imagem]', messageType: 'image' };
  }
  if (message.videoMessage) {
    return { content: message.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  }
  if (message.audioMessage) {
    return { content: message.audioMessage.ptt ? '[Áudio]' : '[Arquivo de Áudio]', messageType: 'audio' };
  }
  if (message.documentMessage) {
    return { content: message.documentMessage.fileName || '[Documento]', messageType: 'document' };
  }
  if (message.locationMessage) {
    return { content: '[Localização]', messageType: 'location' };
  }
  if (message.contactMessage) {
    return { content: message.contactMessage.displayName || '[Contato]', messageType: 'contact' };
  }
  if (message.stickerMessage) {
    return { content: '[Figurinha]', messageType: 'sticker' };
  }
  if (message.reactionMessage) {
    return { content: message.reactionMessage.text || '', messageType: 'reaction' };
  }
  if (message.protocolMessage) {
    return { content: '', messageType: 'protocol' };
  }
  return { content: '[Mensagem não suportada]', messageType: 'unknown' };
}

async function testExtraction() {
  const msgsResponse = await fetch(`${apiUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({ page: 1, limit: 10, where: { key: { remoteJid } } })
  });
  
  const responseData = await msgsResponse.json();
  const messages = Array.isArray(responseData) 
    ? responseData 
    : (responseData?.messages?.records || responseData?.messages || responseData || []);
    
  console.log(`Found ${messages.length} messages array elements.`);
  
  const newMessages = [];
  for (const msg of messages) {
    const msgId = msg.key?.id;
    if (!msgId) {
      console.log('Skipped: no msgId'); continue;
    }

    const { content, messageType } = extractMessageContent(msg.message || msg);
    console.log(`Message extract: type=${messageType}, content=${content}`);
    if (messageType === 'protocol' || !content) {
      console.log('Skipped: protocol or no content'); continue;
    }

    const fromMe = msg.key?.fromMe || false;
    const timestamp = msg.messageTimestamp
      ? new Date(typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp * 1000
        : msg.messageTimestamp
      ).toISOString()
      : new Date().toISOString();

    newMessages.push({
      direction: fromMe ? 'outbound' : 'inbound',
      message_type: messageType,
      content,
      evolution_message_id: msgId,
      status: fromMe ? 'sent' : 'received',
      is_from_bot: false,
      created_at: timestamp,
    });
  }
  
  console.log(`Prepared ${newMessages.length} messages for insert.`);
  console.dir(newMessages, { depth: null });
}

testExtraction();
