import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';

async function testMessages() {
  const msgsResponse = await fetch(`${apiUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': apiKey
    },
    body: JSON.stringify({
      page: 1,
      limit: 10,
      where: { key: { remoteJid: "558585083963@s.whatsapp.net" } } // No @s.whatsapp.net but I'll try with it
    })
  });
  
  const text = await msgsResponse.text();
  console.log(`Status: ${msgsResponse.status}`);
  console.log('--- findMessages response ---');
  if (text.length > 1000) {
    console.log(text.substring(0, 1000) + '...');
  } else {
    console.log(text);
  }
}

testMessages();
