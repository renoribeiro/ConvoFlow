import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const API_URL = 'https://api.stripe.com/v1';

async function stripeRequest(endpoint, method = 'GET') {
  const headers = {
    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  const response = await fetch(`${API_URL}${endpoint}`, { method, headers });
  return await response.json();
}

async function main() {
  const productId = 'prod_TSHGFWXwSIhwMn'; // Corretor de Bolso - Plano Mensal
  console.log(`Verificando produto: ${productId}...`);

  try {
    // Listar preços
    const prices = await stripeRequest(`/prices?product=${productId}&active=true`);
    
    if (prices.data && prices.data.length > 0) {
      console.log('Preços ativos encontrados:');
      prices.data.forEach(p => {
        console.log(`- ID: ${p.id}, Valor: ${p.unit_amount/100} ${p.currency.toUpperCase()}, Intervalo: ${p.recurring?.interval}`);
      });
    } else {
      console.log('Nenhum preço ativo encontrado para este produto.');
    }

    // Listar preços inativos (para confirmar se o nosso está lá)
    const inactivePrices = await stripeRequest(`/prices?product=${productId}&active=false&limit=10`);
     if (inactivePrices.data) {
       console.log('\nPreços inativos recentes:');
       inactivePrices.data.forEach(p => {
         console.log(`- ID: ${p.id} (Criado em ${new Date(p.created * 1000).toISOString()})`);
       });
     }

  } catch (error) {
    console.error('Erro:', error);
  }
}

main();
