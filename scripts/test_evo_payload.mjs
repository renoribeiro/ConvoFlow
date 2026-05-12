import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
const instanceName = 'yuri17';
const remoteJid = '558587486425@s.whatsapp.net';

async function testApiCall() {
  const body = {
    where: {
      key: { remoteJid }
    },
    limit: 20
  };
  
  const msgsResponse = await fetch(`${apiUrl}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
    body: JSON.stringify(body)
  });
  
  const responseData = await msgsResponse.json();
  const messages = Array.isArray(responseData) 
    ? responseData 
    : (responseData?.messages?.records || responseData?.messages || responseData || []);
    
  console.log(`Found ${messages.length} messages using exact Evo payload.`);
}

testApiCall();
