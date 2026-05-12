import fetch from 'node-fetch';

const apiUrl = 'https://evo.agenciare9.com.br';
const apiKey = '42af05165d6d0815c88ec59f34a1f545';
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
    console.log(`${method} ${endpoint} => ${res.status}`);
    if (res.status === 200 || res.status === 201) {
      try {
        const json = await res.json();
        console.log('SUCCESS JSON Output:', JSON.stringify(json).substring(0, 300));
      } catch {
        const text = await res.text();
        console.log('SUCCESS Text Output:', text.substring(0, 300));
      }
    } else {
      const text = await res.text();
      console.log('Error Output:', text.substring(0, 300));
    }
  } catch (err) {
    console.log(`${method} ${endpoint} => error`, err.message);
  }
}

async function testEvoApi() {
  console.log('--- Testing API ---');
  // Usually, getting chats is POST /chat/findChats
  await testEndpoint('POST', `/chat/findChats/${instanceName}`, {});
  
  // Or GET /chat/findChats
  await testEndpoint('GET', `/chat/findChats/${instanceName}`);
  
  // Test webhook config
  await testEndpoint('GET', `/webhook/find/${instanceName}`);
}

testEvoApi();
