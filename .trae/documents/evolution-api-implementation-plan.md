# Plano de Implementação Técnica - Evolution API v2

## 1. Especificações Técnicas Detalhadas

### 1.1 Correção do Tratamento de Mensagens

#### Arquivo: `src/services/webhookHandler.ts`

**Problema Atual**: A função `extractMessageText` não trata adequadamente os diferentes tipos de mensagem da Evolution API v2.

**Solução Implementada**:

```typescript
/**
 * Extrai texto de diferentes tipos de mensagem da Evolution API v2
 * Baseado na documentação oficial: https://doc.evolution-api.com/v2/
 */
private extractMessageText(message: any): string {
  // Tipo 1: Mensagem simples (conversation)
  if (message.conversation) {
    return message.conversation;
  }
  
  // Tipo 2: Mensagem estendida (extendedTextMessage)
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  
  // Tipo 3: Mensagem de imagem com legenda
  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  
  // Tipo 4: Mensagem de vídeo com legenda
  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }
  
  // Tipo 5: Mensagem de documento com legenda
  if (message.documentMessage?.caption) {
    return message.documentMessage.caption;
  }
  
  // Tipo 6: Mensagem de áudio (retorna indicador)
  if (message.audioMessage) {
    return '[Áudio]';
  }
  
  // Tipo 7: Mensagem de localização
  if (message.locationMessage) {
    return `[Localização: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]`;
  }
  
  // Tipo 8: Mensagem de contato
  if (message.contactMessage) {
    return `[Contato: ${message.contactMessage.displayName}]`;
  }
  
  // Tipo 9: Mensagem de reação
  if (message.reactionMessage) {
    return `[Reação: ${message.reactionMessage.text}]`;
  }
  
  return '';
}

/**
 * Determina o tipo de mensagem baseado na estrutura
 */
private getMessageType(message: any): string {
  if (message.conversation) return 'conversation';
  if (message.extendedTextMessage) return 'extendedTextMessage';
  if (message.imageMessage) return 'imageMessage';
  if (message.videoMessage) return 'videoMessage';
  if (message.audioMessage) return 'audioMessage';
  if (message.documentMessage) return 'documentMessage';
  if (message.locationMessage) return 'locationMessage';
  if (message.contactMessage) return 'contactMessage';
  if (message.reactionMessage) return 'reactionMessage';
  return 'unknown';
}
```

### 1.2 Implementação de Validação de Webhook

#### Arquivo: `src/api/webhook.ts`

**Problema Atual**: Endpoint aceita qualquer requisição sem validação de origem.

**Solução Implementada**:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { WebhookHandler, WebhookEvent } from '../services/webhookHandler';
import { EvolutionApiService } from '../services/evolutionApi';
import { logger } from '../lib/logger';
import crypto from 'crypto';

// Configuração da API
const EVOLUTION_API_URL = process.env.VITE_EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.VITE_EVOLUTION_API_KEY || '';
const WEBHOOK_SECRET = process.env.VITE_EVOLUTION_WEBHOOK_SECRET || '';

/**
 * Valida a origem do webhook usando assinatura HMAC
 */
function validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret || !signature) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Valida a origem do webhook por IP (opcional)
 */
function validateWebhookOrigin(req: NextApiRequest): boolean {
  const allowedIPs = process.env.EVOLUTION_ALLOWED_IPS?.split(',') || [];
  
  if (allowedIPs.length === 0) {
    return true; // Se não há IPs configurados, permite todos
  }
  
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  return allowedIPs.includes(clientIP as string);
}

/**
 * Valida o token de webhook
 */
function validateWebhookToken(req: NextApiRequest): boolean {
  const expectedToken = process.env.VITE_EVOLUTION_WEBHOOK_SECRET;
  const receivedToken = req.headers['x-webhook-token'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!expectedToken) {
    logger.warn('Webhook secret not configured');
    return true; // Em desenvolvimento, permite sem token
  }
  
  return expectedToken === receivedToken;
}

// Instância global do webhook handler
let webhookHandler: WebhookHandler | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validações de segurança
    if (!validateWebhookOrigin(req)) {
      logger.warn('Webhook rejected: invalid origin', {
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
      });
      return res.status(403).json({ error: 'Forbidden: Invalid origin' });
    }

    if (!validateWebhookToken(req)) {
      logger.warn('Webhook rejected: invalid token');
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Inicializar webhook handler se necessário
    if (!webhookHandler) {
      const evolutionService = new EvolutionApiService(EVOLUTION_API_URL, EVOLUTION_API_KEY);
      webhookHandler = new WebhookHandler(evolutionService);
    }

    // Processar evento
    const event: WebhookEvent = req.body;
    
    // Validar estrutura do evento
    if (!event || !event.event) {
      logger.warn('Webhook rejected: invalid event structure', { event });
      return res.status(400).json({ error: 'Invalid event structure' });
    }

    // Log do evento recebido
    logger.info('Webhook event received', {
      event: event.event,
      instance: event.instance,
      timestamp: new Date().toISOString()
    });

    // Processar evento
    await webhookHandler.processEvent(event);

    // Resposta de sucesso
    res.status(200).json({ 
      success: true, 
      message: 'Event processed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('Webhook processing failed', {
      error: error.message,
      stack: error.stack,
      event: req.body
    });

    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

// Configuração do bodyParser
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
```

### 1.3 Melhoria do Serviço Evolution API

#### Arquivo: `src/services/evolutionApi.ts`

**Adições Necessárias**:

```typescript
/**
 * Implementação de retry logic para requisições
 */
private async makeRequestWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      
      logger.warn(`Request attempt ${attempt} failed`, {
        url: url.replace(this.apiKey, '***'),
        error: lastError.message,
        attempt,
        maxRetries
      });
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Validação de eventos de webhook suportados
 */
private validateWebhookEvents(events: string[]): string[] {
  const supportedEvents = [
    'APPLICATION_STARTUP',
    'QRCODE_UPDATED',
    'CONNECTION_UPDATE',
    'MESSAGES_SET',
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'MESSAGES_DELETE',
    'SEND_MESSAGE',
    'CONTACTS_SET',
    'CONTACTS_UPSERT',
    'CONTACTS_UPDATE',
    'PRESENCE_UPDATE',
    'CHATS_SET',
    'CHATS_UPDATE',
    'CHATS_UPSERT',
    'CHATS_DELETE',
    'GROUPS_UPSERT',
    'GROUPS_UPDATE',
    'GROUP_PARTICIPANTS_UPDATE',
    'NEW_TOKEN'
  ];
  
  const validEvents = events.filter(event => supportedEvents.includes(event));
  const invalidEvents = events.filter(event => !supportedEvents.includes(event));
  
  if (invalidEvents.length > 0) {
    logger.warn('Invalid webhook events detected', { invalidEvents });
  }
  
  return validEvents;
}

/**
 * Configuração otimizada de webhook para produção
 */
async setOptimizedWebhook(instanceName: string, webhookUrl: string): Promise<any> {
  const recommendedEvents = [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE', 
    'CONNECTION_UPDATE',
    'QRCODE_UPDATED'
  ];
  
  const webhookConfig = {
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: false,
    events: this.validateWebhookEvents(recommendedEvents)
  };
  
  return this.setWebhook(instanceName, webhookConfig);
}
```

### 1.4 Configuração Docker Otimizada

#### Arquivo: `docker-compose.evolution.yml`

**Melhorias Necessárias**:

```yaml
version: '3.8'

services:
  evolution-api:
    image: atendai/evolution-api:v2.1.1
    container_name: evolution-api
    restart: unless-stopped
    ports:
      - "${EVOLUTION_PORT:-8080}:8080"
    environment:
      # Server Configuration
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      - SERVER_URL=${EVOLUTION_SERVER_URL:-http://localhost:8080}
      
      # CORS Configuration
      - CORS_ORIGIN=${CORS_ORIGIN:-*}
      - CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
      - CORS_CREDENTIALS=true
      
      # Database Configuration
      - DATABASE_ENABLED=true
      - DATABASE_CONNECTION_URI=postgresql://evolution:${POSTGRES_PASSWORD:-evolution}@postgres:5432/evolution
      - DATABASE_CONNECTION_CLIENT_NAME=evolution
      
      # Redis Configuration
      - REDIS_ENABLED=true
      - REDIS_URI=redis://redis:6379
      - REDIS_PREFIX_KEY=evolution
      
      # Webhook Configuration (Otimizada)
      - WEBHOOK_GLOBAL_ENABLED=${WEBHOOK_GLOBAL_ENABLED:-true}
      - WEBHOOK_GLOBAL_URL=${WEBHOOK_URL:-http://host.docker.internal:3000/api/webhooks/evolution}
      - WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
      
      # Eventos Recomendados para Produção
      - WEBHOOK_EVENTS_MESSAGES_UPSERT=true
      - WEBHOOK_EVENTS_MESSAGES_UPDATE=true
      - WEBHOOK_EVENTS_CONNECTION_UPDATE=true
      - WEBHOOK_EVENTS_QRCODE_UPDATED=true
      - WEBHOOK_EVENTS_SEND_MESSAGE=false  # Evitar duplicação
      - WEBHOOK_EVENTS_CONTACTS_SET=false   # Reduzir carga
      - WEBHOOK_EVENTS_CHATS_SET=false      # Reduzir carga
      
      # Authentication
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY:-convoflow-evolution-api-key-2024}
      - AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true
      
      # Instance Configuration
      - CONFIG_SESSION_PHONE_CLIENT=${APP_NAME:-ConvoFlow}
      - CONFIG_SESSION_PHONE_NAME=${APP_NAME:-ConvoFlow} Bot
      
      # QR Code Configuration
      - QRCODE_LIMIT=10
      - QRCODE_COLOR=#198754
      
      # Language
      - LANGUAGE=pt-BR
      
      # Logs (Otimizado para produção)
      - LOG_LEVEL=${LOG_LEVEL:-WARN}
      - LOG_COLOR=true
      - LOG_BAILEYS=error
      
      # Store Configuration (Otimizado)
      - STORE_MESSAGES=true
      - STORE_MESSAGE_UP=true
      - STORE_CONTACTS=true
      - STORE_CHATS=true
      
      # Clean Store (Configuração para produção)
      - CLEAN_STORE_CLEANING_INTERVAL=${CLEAN_INTERVAL:-3600}  # 1 hora
      - CLEAN_STORE_MESSAGES=true
      - CLEAN_STORE_MESSAGE_UP=true
      - CLEAN_STORE_CONTACTS=false  # Manter contatos
      - CLEAN_STORE_CHATS=false     # Manter chats
      
      # Security
      - DEL_INSTANCE=false
      
      # Integrations (Desabilitadas por padrão)
      - TYPEBOT_ENABLED=false
      - CHATWOOT_ENABLED=false
      - OPENAI_ENABLED=false
      - DIFY_ENABLED=false
      - S3_ENABLED=false
      - MINIO_ENABLED=false
      - WEBSOCKET_ENABLED=false
    
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    
    networks:
      - evolution-network
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/manager/instance/fetchInstances"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:15-alpine
    container_name: evolution-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=evolution
      - POSTGRES_USER=evolution
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-evolution}
      - PGDATA=/var/lib/postgresql/data/pgdata
    
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
    networks:
      - evolution-network
    
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution -d evolution"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: evolution-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --replica-read-only no --maxmemory 256mb --maxmemory-policy allkeys-lru
    
    volumes:
      - redis_data:/data
    
    networks:
      - evolution-network
    
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  evolution_instances:
    driver: local
  evolution_store:
    driver: local
  postgres_data:
    driver: local
  redis_data:
    driver: local

networks:
  evolution-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### 1.5 Arquivo de Ambiente Atualizado

#### Arquivo: `.env.example`

**Adições Necessárias**:

```env
# ConvoFlow Environment Variables
# Copy this file to .env and fill in your actual values

# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Evolution API Configuration
VITE_EVOLUTION_API_URL=http://localhost:8080
VITE_EVOLUTION_API_KEY=convoflow-evolution-api-key-2024
VITE_EVOLUTION_WEBHOOK_URL=http://localhost:3000/api/webhooks/evolution
VITE_EVOLUTION_WEBHOOK_SECRET=webhook-secret-super-seguro-aqui
VITE_EVOLUTION_WEBSOCKET_URL=ws://localhost:8080/ws

# Evolution Docker Configuration
EVOLUTION_PORT=8080
EVOLUTION_SERVER_URL=http://localhost:8080
WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks/evolution
WEBHOOK_GLOBAL_ENABLED=true
EVOLUTION_API_KEY=convoflow-evolution-api-key-2024
POSTGRES_PASSWORD=evolution-secure-password
CLEAN_INTERVAL=3600
LOG_LEVEL=WARN

# Security Configuration
EVOLUTION_ALLOWED_IPS=127.0.0.1,::1  # IPs permitidos para webhook (opcional)
CORS_ORIGIN=http://localhost:3000,https://sua-app.com

# Application Configuration
VITE_APP_NAME=ConvoFlow
VITE_APP_VERSION=1.0.0
VITE_ENVIRONMENT=development

# Debug Configuration
VITE_ENABLE_DEBUG_LOGS=false
VITE_ENABLE_CONSOLE_LOGS=false

# Tracking Configuration
VITE_TRACKING_DOMAIN=track.convoflow.com
```

## 2. Scripts de Validação

### 2.1 Script de Teste de Integração

#### Arquivo: `scripts/test-evolution-integration.js`

```javascript
#!/usr/bin/env node

/**
 * Script de teste para validar integração com Evolution API v2
 */

const https = require('https');
const http = require('http');

class EvolutionTester {
  constructor(config) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    this.testInstanceName = 'test-instance-' + Date.now();
  }

  async runTests() {
    console.log('🚀 Iniciando testes de integração Evolution API v2\n');
    
    try {
      await this.testApiConnection();
      await this.testInstanceCreation();
      await this.testWebhookConfiguration();
      await this.testMessageSending();
      await this.cleanup();
      
      console.log('\n✅ Todos os testes passaram com sucesso!');
    } catch (error) {
      console.error('\n❌ Teste falhou:', error.message);
      process.exit(1);
    }
  }

  async testApiConnection() {
    console.log('📡 Testando conexão com API...');
    
    const response = await this.makeRequest('GET', '/manager/instance/fetchInstances');
    
    if (response.status === 200) {
      console.log('✅ Conexão com API estabelecida');
    } else {
      throw new Error(`Falha na conexão: ${response.status}`);
    }
  }

  async testInstanceCreation() {
    console.log('🔧 Testando criação de instância...');
    
    const payload = {
      instanceName: this.testInstanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS'
    };
    
    const response = await this.makeRequest('POST', '/instance/create', payload);
    
    if (response.status === 201) {
      console.log('✅ Instância criada com sucesso');
    } else {
      throw new Error(`Falha na criação da instância: ${response.status}`);
    }
  }

  async testWebhookConfiguration() {
    console.log('🔗 Testando configuração de webhook...');
    
    const webhookConfig = {
      url: 'http://localhost:3000/api/webhooks/evolution',
      webhook_by_events: false,
      webhook_base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
    };
    
    const response = await this.makeRequest(
      'POST', 
      `/webhook/instance/${this.testInstanceName}`, 
      webhookConfig
    );
    
    if (response.status === 200) {
      console.log('✅ Webhook configurado com sucesso');
    } else {
      throw new Error(`Falha na configuração do webhook: ${response.status}`);
    }
  }

  async testMessageSending() {
    console.log('💬 Testando envio de mensagem...');
    
    // Nota: Este teste requer uma instância conectada
    console.log('⚠️  Teste de envio de mensagem requer instância conectada (pulando)');
  }

  async cleanup() {
    console.log('🧹 Limpando recursos de teste...');
    
    try {
      await this.makeRequest('DELETE', `/instance/delete/${this.testInstanceName}`);
      console.log('✅ Instância de teste removida');
    } catch (error) {
      console.log('⚠️  Falha na limpeza (pode ser ignorado):', error.message);
    }
  }

  async makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiUrl + path);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.apiKey
        }
      };

      const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }
}

// Configuração
const config = {
  apiUrl: process.env.VITE_EVOLUTION_API_URL || 'http://localhost:8080',
  apiKey: process.env.VITE_EVOLUTION_API_KEY || 'convoflow-evolution-api-key-2024'
};

// Executar testes
const tester = new EvolutionTester(config);
tester.runTests();
```

## 3. Monitoramento e Métricas

### 3.1 Sistema de Métricas

#### Arquivo: `src/lib/metrics.ts`

```typescript
/**
 * Sistema de métricas para Evolution API
 */

interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

class MetricsCollector {
  private metrics: Metric[] = [];
  private readonly maxMetrics = 1000;

  // Métricas de mensagens
  recordMessageSent(instanceName: string, success: boolean) {
    this.addMetric('messages_sent_total', 1, {
      instance: instanceName,
      status: success ? 'success' : 'error'
    });
  }

  recordMessageReceived(instanceName: string) {
    this.addMetric('messages_received_total', 1, {
      instance: instanceName
    });
  }

  // Métricas de webhook
  recordWebhookEvent(event: string, processingTime: number) {
    this.addMetric('webhook_events_total', 1, { event });
    this.addMetric('webhook_processing_time_ms', processingTime, { event });
  }

  // Métricas de conexão
  recordConnectionStatus(instanceName: string, status: string) {
    this.addMetric('connection_status', 1, {
      instance: instanceName,
      status
    });
  }

  private addMetric(name: string, value: number, tags?: Record<string, string>) {
    this.metrics.push({
      name,
      value,
      timestamp: new Date(),
      tags
    });

    // Limitar número de métricas em memória
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const metric of this.metrics) {
      if (!summary[metric.name]) {
        summary[metric.name] = {
          count: 0,
          sum: 0,
          avg: 0,
          min: Infinity,
          max: -Infinity
        };
      }
      
      const s = summary[metric.name];
      s.count++;
      s.sum += metric.value;
      s.avg = s.sum / s.count;
      s.min = Math.min(s.min, metric.value);
      s.max = Math.max(s.max, metric.value);
    }
    
    return summary;
  }
}

export const metrics = new MetricsCollector();
```

## 4. Cronograma de Implementação Detalhado

### Fase 1: Correções Críticas (3-5 dias)

**Dia 1-2: Segurança e Validação**
- [ ] Implementar validação de webhook em `src/api/webhook.ts`
- [ ] Adicionar variáveis de ambiente de segurança
- [ ] Testar validação com diferentes cenários

**Dia 3-4: Tratamento de Mensagens**
- [ ] Atualizar `extractMessageText` em `src/services/webhookHandler.ts`
- [ ] Implementar `getMessageType` para melhor classificação
- [ ] Testar com diferentes tipos de mensagem

**Dia 5: Configuração Docker**
- [ ] Atualizar `docker-compose.evolution.yml`
- [ ] Atualizar `.env.example`
- [ ] Testar configuração completa

### Fase 2: Melhorias de Robustez (3-4 dias)

**Dia 6-7: Retry Logic**
- [ ] Implementar `makeRequestWithRetry` em `src/services/evolutionApi.ts`
- [ ] Adicionar configurações de retry
- [ ] Testar cenários de falha

**Dia 8-9: Validação e Otimização**
- [ ] Implementar `validateWebhookEvents`
- [ ] Adicionar `setOptimizedWebhook`
- [ ] Otimizar configurações para produção

### Fase 3: Monitoramento e Testes (2-3 dias)

**Dia 10-11: Sistema de Métricas**
- [ ] Implementar `src/lib/metrics.ts`
- [ ] Integrar métricas nos serviços
- [ ] Criar dashboard básico

**Dia 12: Testes Finais**
- [ ] Executar script de teste de integração
- [ ] Validar todos os cenários
- [ ] Documentar resultados

## 5. Checklist de Deploy

### Pré-Deploy
- [ ] Todas as correções implementadas
- [ ] Testes de integração passando
- [ ] Configurações de produção validadas
- [ ] Backup do banco de dados
- [ ] Variáveis de ambiente configuradas

### Deploy
- [ ] Deploy da aplicação
- [ ] Deploy do Docker Compose
- [ ] Verificação de saúde dos serviços
- [ ] Teste de conectividade

### Pós-Deploy
- [ ] Monitoramento ativo por 24h
- [ ] Verificação de logs
- [ ] Teste de funcionalidades críticas
- [ ] Documentação de problemas encontrados

---

**Documento técnico gerado para implementação das melhorias identificadas na análise da Evolution API v2.**