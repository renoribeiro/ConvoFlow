import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookHandler, WebhookEvent } from '../services/webhookHandler';
import { EvolutionApiService } from '../services/evolutionApi';
import { env } from '../lib/env';
import crypto from 'crypto';

// Configuração da API
const EVOLUTION_API_URL = env.get('EVOLUTION_API_URL') || 'http://localhost:8080';
const EVOLUTION_API_KEY = env.get('EVOLUTION_API_KEY') || '';
const EVOLUTION_WEBHOOK_SECRET = env.get('EVOLUTION_WEBHOOK_SECRET') || 'convoflow-webhook-secret-2024';
const EVOLUTION_X_API_KEY = env.get('EVOLUTION_X_API_KEY') || 'convoflow-evolution-api-key-2024';

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

// Lista de IPs permitidos (Evolution API local e Docker)
const ALLOWED_IPS = [
  '127.0.0.1',
  'localhost',
  '::1',
  '172.17.0.0/16', // Docker default network
  '172.18.0.0/16', // Docker custom networks
  '172.19.0.0/16',
  '172.20.0.0/16',
  '10.0.0.0/8',    // Private networks
  '192.168.0.0/16'
];

// Função para verificar se IP está na lista permitida
const isIpAllowed = (ip: string): boolean => {
  if (!ip) return false;
  
  // Remover prefixos IPv6 para IPv4
  const cleanIp = ip.replace(/^::ffff:/, '');
  
  // Verificar IPs exatos
  if (ALLOWED_IPS.includes(cleanIp) || cleanIp === 'localhost') {
    return true;
  }
  
  // Verificar redes CIDR (implementação básica)
  for (const allowedRange of ALLOWED_IPS) {
    if (allowedRange.includes('/')) {
      const [network, mask] = allowedRange.split('/');
      if (cleanIp.startsWith(network.split('.').slice(0, parseInt(mask) / 8).join('.'))) {
        return true;
      }
    }
  }
  
  return false;
};

// Função para validar assinatura HMAC
const validateWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature || !secret) return false;
  
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    const receivedSignature = signature.replace('sha256=', '');
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch (error) {
    console.error('[Webhook] Error validating signature:', error);
    return false;
  }
};

// Middleware para validar a origem e autenticação do webhook
const validateWebhookAuth = (req: NextApiRequest, rawBody: string): { valid: boolean; reason?: string } => {
  // 1. Verificar método HTTP
  if (req.method !== 'POST') {
    return { valid: false, reason: 'Invalid HTTP method' };
  }
  
  // 2. Verificar Content-Type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return { valid: false, reason: 'Invalid content type' };
  }
  
  // 3. Verificar IP de origem
  const clientIp = req.headers['x-forwarded-for'] as string || 
                   req.headers['x-real-ip'] as string ||
                   req.connection?.remoteAddress ||
                   req.socket?.remoteAddress;
  
  if (!isIpAllowed(clientIp)) {
    console.warn(`[Webhook] Blocked request from IP: ${clientIp}`);
    return { valid: false, reason: 'IP not allowed' };
  }
  
  // 4. Verificar API Key header
  const apiKey = req.headers['apikey'] as string;
  if (apiKey && apiKey !== EVOLUTION_X_API_KEY) {
    return { valid: false, reason: 'Invalid API key' };
  }
  
  // 5. Verificar assinatura HMAC se fornecida
  const signature = req.headers['x-hub-signature-256'] as string || 
                   req.headers['x-signature'] as string;
  
  if (signature && EVOLUTION_WEBHOOK_SECRET) {
    if (!validateWebhookSignature(rawBody, signature, EVOLUTION_WEBHOOK_SECRET)) {
      return { valid: false, reason: 'Invalid webhook signature' };
    }
  }
  
  // 6. Verificar User-Agent (opcional)
  const userAgent = req.headers['user-agent'] as string;
  if (userAgent && !userAgent.includes('Evolution') && !userAgent.includes('axios') && !userAgent.includes('node')) {
    console.warn(`[Webhook] Suspicious User-Agent: ${userAgent}`);
  }
  
  return { valid: true };
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
  const startTime = Date.now();
  let rawBody = '';
  
  try {
    // Capturar o corpo bruto para validação de assinatura
    rawBody = JSON.stringify(req.body);
    
    // Validar autenticação e origem do webhook
    const authResult = validateWebhookAuth(req, rawBody);
    if (!authResult.valid) {
      console.warn(`[Webhook] Authentication failed: ${authResult.reason}`);
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Webhook authentication failed',
        reason: authResult.reason
      });
    }

    // Extrair dados do evento
    const event: WebhookEvent = req.body;

    // Validar estrutura do evento
    if (!event || typeof event !== 'object') {
      return res.status(400).json({ 
        error: 'Bad request',
        message: 'Invalid webhook payload'
      });
    }
    
    if (!event.event || !event.instance) {
      return res.status(400).json({ 
        error: 'Bad request',
        message: 'Missing required fields: event, instance'
      });
    }
    
    if (!event.data) {
      console.warn(`[Webhook] Event ${event.event} has no data field`);
      event.data = {};
    }

    // Log da requisição (apenas em desenvolvimento)
    if (env.isDevelopment() || env.isDebugEnabled()) {
      logWebhookRequest(req, event);
    }

    // Inicializar e processar o evento
    const handler = initializeWebhookHandler();
    await handler.processWebhookEvent(event);

    const processingTime = Date.now() - startTime;
    
    // Resposta de sucesso
    res.status(200).json({ 
      success: true,
      message: 'Webhook event processed successfully',
      event: event.event,
      instance: event.instance,
      timestamp: new Date().toISOString(),
      processingTime: `${processingTime}ms`
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error('[Webhook] Error processing event:', {
      error: error.message,
      stack: error.stack,
      processingTime: `${processingTime}ms`,
      body: rawBody.substring(0, 500) // Limitar log do body
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'Failed to process webhook event',
      details: env.isDevelopment() ? error.message : 'Internal error',
      processingTime: `${processingTime}ms`
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