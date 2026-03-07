import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configurar __dirname para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente do arquivo .env na raiz
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('ERRO: STRIPE_SECRET_KEY não encontrada no arquivo .env');
  process.exit(1);
}

const API_URL = 'https://api.stripe.com/v1';

async function stripeRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = new URLSearchParams(body).toString();
  }

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Stripe API Error: ${data.error?.message || JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  try {
    console.log('Iniciando configuração do Stripe...');

    // 1. Criar Produto "Convoflow Pro"
    console.log('Criando produto "Convoflow Pro"...');
    const product = await stripeRequest('/products', 'POST', {
      name: 'Convoflow Pro',
      description: 'Acesso completo a todas as funcionalidades de automação e gestão.',
      active: 'true'
    });
    console.log(`Produto criado: ${product.id} (${product.name})`);

    // 2. Criar Preço R$ 97,00 (Recorrente Mensal)
    console.log('Criando preço de R$ 97,00...');
    const price = await stripeRequest('/prices', 'POST', {
      product: product.id,
      unit_amount: '9700',
      currency: 'brl',
      'recurring[interval]': 'month'
    });
    console.log(`Preço criado: ${price.id}`);

    // 3. Criar Link de Pagamento
    console.log('Criando link de pagamento...');
    const paymentLink = await stripeRequest('/payment_links', 'POST', {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '1',
      'after_completion[type]': 'redirect',
      'after_completion[redirect][url]': 'https://convoflow.ai/dashboard/settings?tab=subscription&success=true' // Ajustar URL conforme necessário
    });
    console.log(`Link de pagamento criado: ${paymentLink.url}`);

    // 4. Desativar preço antigo (Corretor de Bolso)
    const oldPriceId = 'price_1Sp6XhANzjaMKwMQ6Pojynoy';
    console.log(`Desativando preço antigo: ${oldPriceId}...`);
    try {
      await stripeRequest(`/prices/${oldPriceId}`, 'POST', { active: 'false' });
      console.log('Preço antigo desativado com sucesso.');
    } catch (err) {
      console.warn(`Aviso ao desativar preço antigo: ${err.message}`);
    }

    // Salvar resultados em um arquivo JSON para leitura posterior pelo agente
    const results = {
      productId: product.id,
      priceId: price.id,
      paymentLink: paymentLink.url
    };
    
    fs.writeFileSync(
      path.resolve(__dirname, 'stripe_setup_result.json'), 
      JSON.stringify(results, null, 2)
    );
    
    console.log('Configuração concluída com sucesso!');
    console.log('Resultados salvos em scripts/stripe_setup_result.json');

  } catch (error) {
    console.error('Erro fatal:', error.message);
    process.exit(1);
  }
}

main();
