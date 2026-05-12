import fetch from 'node-fetch';

const apiUrl = process.env.VITE_EVOLUTION_API_URL || 'http://localhost:8080';
const apiKey = process.env.VITE_EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024';
const instanceName = 'yuri17';

async function testEvoApi() {
  console.log(`Testing Evo API for instance: ${instanceName}`);
  
  // 1. Test getChats
  try {
    const chatsResponse = await fetch(`${apiUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({})
    });
    
    const text = await chatsResponse.text();
    console.log('\n--- findChats response ---');
    console.log(`Status: ${chatsResponse.status}`);
    console.log(text.substring(0, 1000));
    
  } catch (err) {
    console.error('Error:', err);
  }
}

testEvoApi();
