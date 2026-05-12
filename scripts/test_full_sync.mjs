import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pqjkuwyshybxldzpfbbs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxamt1d3lzaHlieGxkenBmYmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDEzNDEzMCwiZXhwIjoyMDY5NzEwMTMwfQ.9slreizIqXZ2TqKqZY04r9p5k8ceKRvJ7BEVyEqUemk';
const supabase = createClient(supabaseUrl, supabaseKey);

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';

function extractMessageContent(message) {
  if (!message) return { content: '', messageType: 'unknown' };

  if (message.conversation) return { content: message.conversation, messageType: 'text' };
  if (message.extendedTextMessage?.text) return { content: message.extendedTextMessage.text, messageType: 'text' };
  if (message.imageMessage) return { content: message.imageMessage.caption || '[Imagem]', messageType: 'image' };
  if (message.videoMessage) return { content: message.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  if (message.audioMessage) return { content: message.audioMessage.ptt ? '[Áudio]' : '[Arquivo de Áudio]', messageType: 'audio' };
  if (message.documentMessage) return { content: message.documentMessage.fileName || '[Documento]', messageType: 'document' };
  if (message.locationMessage) return { content: '[Localização]', messageType: 'location' };
  if (message.contactMessage) return { content: message.contactMessage.displayName || '[Contato]', messageType: 'contact' };
  if (message.stickerMessage) return { content: '[Figurinha]', messageType: 'sticker' };
  if (message.reactionMessage) return { content: message.reactionMessage.text || '', messageType: 'reaction' };
  if (message.protocolMessage) return { content: '', messageType: 'protocol' };
  
  return { content: '[Mensagem não suportada]', messageType: 'unknown' };
}

async function testSync() {
  const phone = '558587486425';
  const remoteJid = `${phone}@s.whatsapp.net`;
  
  // Find contact
  const { data: contact } = await supabase.from('contacts').select('id, tenant_id, whatsapp_instance_id').eq('phone', phone).limit(1).single();
  if (!contact) {
    console.log("Contact not found!"); return;
  }
  
  console.log(`Processing contact: ${contact.id}`);
  
  // Fetch from Evo
  const msgsResponse = await fetch(`${apiUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({ page: 1, limit: 10, where: { key: { remoteJid } } })
  });
  
  const responseData = await msgsResponse.json();
  const messages = Array.isArray(responseData) ? responseData : (responseData?.messages?.records || responseData?.messages || responseData || []);
  
  console.log(`Fetched ${messages.length} from Evo API.`);
  
  if (messages.length === 0) return;
  
  const newMessages = [];
  for (const msg of messages) {
    const msgId = msg.key?.id;
    if (!msgId) continue;
    
    const { content, messageType } = extractMessageContent(msg.message || msg);
    if (messageType === 'protocol' || !content) continue;
    
    const fromMe = msg.key?.fromMe || false;
    const timestamp = msg.messageTimestamp
      ? new Date(typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp * 1000
        : msg.messageTimestamp
      ).toISOString()
      : new Date().toISOString();

    newMessages.push({
      contact_id: contact.id,
      tenant_id: contact.tenant_id,
      whatsapp_instance_id: contact.whatsapp_instance_id,
      direction: fromMe ? 'outbound' : 'inbound',
      message_type: messageType,
      content,
      evolution_message_id: msgId,
      status: fromMe ? 'sent' : 'received',
      is_from_bot: false,
      created_at: timestamp,
    });
  }
  
  console.log(`Inserting ${newMessages.length} messages to DB...`);
  const { error: insertError } = await supabase.from('messages').insert(newMessages);
  
  if (insertError) {
    console.error("Supabase insert error:", insertError.message, insertError.details, insertError.hint);
  } else {
    console.log("Insert success!");
  }
}

testSync();
