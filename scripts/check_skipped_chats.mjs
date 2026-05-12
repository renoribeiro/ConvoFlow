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
  let groups = 0;
  let broadcast = 0;
  let skippedOthers = 0;
  let individuals = 0;
  
  const evoIndividuals = [];
  
  for (const chat of chats) {
    const chatId = chat.id || chat.remoteJid || '';
    if (chatId.includes('@g.us')) { groups++; continue; }
    if (chatId === 'status@broadcast') { broadcast++; continue; }
    if (!chatId.endsWith('@s.whatsapp.net')) { skippedOthers++; continue; }
    individuals++;
    evoIndividuals.push(chatId);
  }
  
  console.log(`Total: ${chats.length}`);
  console.log(`Groups: ${groups}`);
  console.log(`Broadcast: ${broadcast}`);
  console.log(`Other skipped: ${skippedOthers}`);
  console.log(`Individuals valid: ${individuals}`);
}

main();
