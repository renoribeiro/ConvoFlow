import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const API_URL = 'https://api.stripe.com/v1';

async function stripeRequest(endpoint) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const response = await fetch(`${API_URL}${endpoint}`, { method: 'GET', headers });
  return await response.json();
}

async function main() {
  const productId = 'prod_TSHGFWXwSIhwMn';
  console.log(`Verificando detalhes do produto: ${productId}...`);

  try {
    const product = await stripeRequest(`/products/${productId}`);
    console.log(`Nome: ${product.name}`);
    console.log(`Ativo: ${product.active}`);
    console.log(`Descrição: ${product.description}`);
  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
