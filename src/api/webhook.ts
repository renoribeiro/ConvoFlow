import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookHandler, WebhookEvent } from '../services/webhookHandler';
import { EvolutionApiService } from '../services/evolutionApi';

// Configuração da API
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';

// Instância global do webhook handler
let webhookHandler: WebhookHandler | null = null;

// Inicializar o webhook handler
const initializeWebhookHandler = () => {
  if (!webhookHandler) {
    const apiService = new EvolutionApiService(EVOLUTION_API_URL, EVOLUTION_API_KEY);
    webhookHandler = new WebhookHandler(apiService);
  }
  return webhookHandler;
};

// Middleware para validar a origem do webhook
const validateWebhookOrigin = (req: NextApiRequest): boolean => {
  // Verificar se a requisição vem da Evolution API
  const userAgent = req.headers['user-agent'];
  const origin = req.headers.origin;
  
  // Adicionar validações específicas conforme necessário
  // Por exemplo, verificar IP, token de autenticação, etc.
  
  return true; // Por enquanto, aceitar todas as requisições
};

// Middleware para logging
const logWebhookRequest = (req: NextApiRequest, event: WebhookEvent) => {
  console.log(`[Webhook] Received event: ${event.event} for instance: ${event.instance}`);
  console.log(`[Webhook] Headers:`, req.headers);
  console.log(`[Webhook] Event data:`, JSON.stringify(event.data, null, 2));
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Apenas aceitar métodos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are accepted'
    });
  }

  try {
    // Validar origem do webhook
    if (!validateWebhookOrigin(req)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Invalid webhook origin'
      });
    }

    // Extrair dados do evento
    const event: WebhookEvent = req.body;

    // Validar estrutura do evento
    if (!event.event || !event.instance || !event.data) {
      return res.status(400).json({ 
        error: 'Bad request',
        message: 'Invalid webhook event structure'
      });
    }

    // Log da requisição
    logWebhookRequest(req, event);

    // Inicializar e processar o evento
    const handler = initializeWebhookHandler();
    await handler.processWebhookEvent(event);

    // Resposta de sucesso
    res.status(200).json({ 
      success: true,
      message: 'Webhook event processed successfully',
      event: event.event,
      instance: event.instance,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Webhook] Error processing event:', error);
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process webhook event',
      details: error.message
    });
  }
}

// Configuração para aceitar payloads maiores
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};