import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';

async function main() {
  const chatsResponse = await fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({})
  });
  
  const chats = await chatsResponse.json();
  const others = [];
  
  for (const chat of chats) {
    const chatId = chat.id || chat.remoteJid || '';
    if (chatId.includes('@g.us')) continue;
    if (chatId === 'status@broadcast') continue;
    if (!chatId.endsWith('@s.whatsapp.net')) {
      others.push(chatId);
    }
  }
  
  console.log(`Other skipped: ${others.length}`);
  console.log(others.slice(0, 20));
}

main();
