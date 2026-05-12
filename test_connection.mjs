import fetch from 'node-fetch';

const apiUrl = "http://localhost:8080";
const apiKey = "convoflow-evolution-api-key-2024";
const instance = "yuriteste3"; // name from user's screenshot

async function test() {
  const res = await fetch(`${apiUrl}/instance/connect/${instance}`, {
    method: 'GET',
    headers: {
      'apikey': apiKey
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test();
