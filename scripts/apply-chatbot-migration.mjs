// One-shot: apply the chatbot visual flow builder migration via the Supabase
// Management API (uses SUPABASE_ACCESS_TOKEN; no DB password needed).
import { readFileSync } from 'node:fs';

const REF = 'pqjkuwyshybxldzpfbbs';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN not set');
  process.exit(1);
}

const sql = readFileSync(
  new URL('../supabase/migrations/20260601000001_chatbot_visual_flow_builder.sql', import.meta.url),
  'utf8'
);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
console.log('HTTP', res.status);
console.log(text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
