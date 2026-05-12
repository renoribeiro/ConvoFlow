import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';

async function testChats() {
  const chatsResponse = await fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify({})
  });
  
  const chats = await chatsResponse.json();
  console.log(`findChats returned ${chats.length} chats.`);
}

testChats();
