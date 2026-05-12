import fetch from 'node-fetch';

const apiUrl = process.env.VITE_EVOLUTION_API_URL || 'http://localhost:8080';
const apiKey = process.env.VITE_EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024';
const instanceName = 'yuri17';

async function testEndpoint(method, endpoint, body) {
  const url = `${apiUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    console.log(`${method} ${endpoint} => ${res.status}`);
    if (res.status === 200 || res.status === 201) {
      console.log('SUCCESS! Snippet:', text.substring(0, 200));
    }
  } catch (err) {
    console.log(`${method} ${endpoint} => error`);
  }
}

async function testEvoApi() {
  await testEndpoint('GET', `/chat/findChats/${instanceName}`);
  await testEndpoint('POST', `/chat/findChats/${instanceName}`, {});
  await testEndpoint('GET', `/chat/fetchChats/${instanceName}`);
  await testEndpoint('POST', `/chat/fetchChats/${instanceName}`, {});
  await testEndpoint('GET', `/chat/chats/${instanceName}`);
}

testEvoApi();
