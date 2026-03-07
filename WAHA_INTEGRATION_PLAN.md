# Plano de Integração Waha API (WhatsApp HTTP API)

Este documento detalha o plano técnico para integrar a Waha API como um provedor alternativo à Evolution API no ConvoFlow. O objetivo é tornar o sistema "Multi-Provider", permitindo que cada instância de WhatsApp escolha qual gateway utilizar.

## 1. Análise de Discrepâncias e Requisitos

| Característica | Evolution API (Atual) | Waha API (Novo) | Ação Necessária |
| :--- | :--- | :--- | :--- |
| **Autenticação** | Header `apikey` | Header `X-Api-Key` ou Query Param | Abstrair autenticação no Client HTTP. |
| **Envio de Texto** | `/message/sendText/{instance}` | `/api/send/text` | Criar Adaptador de Envio. |
| **Payload Envio** | `{ "number": "...", "text": "..." }` | `{ "chatId": "...", "text": "...", "session": "..." }` | Normalizar DTO de envio. |
| **Webhook Event** | `messages.upsert` | `message` (variável conforme config) | Criar endpoint `waha-webhook` dedicado. |
| **Formato ID** | `remoteJid` (ex: `55119999@s.whatsapp.net`) | `chatId` (ex: `55119999@c.us`) | Função de normalização de IDs (@c.us <-> @s.whatsapp.net). |

## 2. Mudanças no Banco de Dados

Precisamos alterar a tabela `whatsapp_instances` para suportar configurações dinâmicas de provedor.

### Migração SQL Proposta
```sql
-- 1. Adicionar coluna de provedor
ALTER TABLE public.whatsapp_instances 
ADD COLUMN provider TEXT DEFAULT 'evolution' CHECK (provider IN ('evolution', 'waha'));

-- 2. Adicionar coluna JSONB para configurações específicas (flexível para futuro)
ALTER TABLE public.whatsapp_instances 
ADD COLUMN connection_config JSONB DEFAULT '{}'::jsonb;

-- 3. (Opcional) Migrar dados existentes da Evolution para a nova estrutura JSONB
-- UPDATE public.whatsapp_instances 
-- SET connection_config = jsonb_build_object(
--   'baseUrl', evolution_api_url,
--   'apiKey', evolution_api_key
-- )
-- WHERE provider = 'evolution';
```

## 3. Arquitetura Backend (Supabase Edge Functions)

Implementaremos o padrão **Strategy/Adapter** para isolar a lógica de cada provedor.

### Estrutura de Arquivos Proposta
```
supabase/functions/
├── _shared/
│   ├── whatsapp-providers/
│   │   ├── base.ts         # Interface IWhatsAppProvider
│   │   ├── evolution.ts    # Implementação Evolution
│   │   └── waha.ts         # Implementação Waha
│   ├── factory.ts          # ProviderFactory (retorna a implementação correta)
│   └── types.ts            # Tipos normalizados (UnifiedMessage, etc.)
├── waha-webhook/           # NOVO: Endpoint específico para Waha
│   └── index.ts
├── evolution-webhook/      # Mantido (com ajustes menores se necessário)
└── job-worker/             # Refatorado para usar o ProviderFactory
```

### Detalhe do Adaptador (Interface)
```typescript
export interface IWhatsAppProvider {
  sendMessage(to: string, content: string, options?: any): Promise<any>;
  sendMedia(to: string, url: string, type: string, caption?: string): Promise<any>;
  // Outros métodos comuns...
}
```

## 4. Fluxo de Implementação (Passo a Passo)

### Fase 1: Base e Banco de Dados
1.  Criar arquivo de migração SQL para adicionar colunas `provider` e `connection_config`.
2.  Atualizar tipos TypeScript no frontend e backend para refletir a nova estrutura.

### Fase 2: Camada de Abstração (Shared)
1.  Criar `supabase/functions/_shared/whatsapp-providers/base.ts`.
2.  Mover a lógica atual de envio (do `job-worker`) para `evolution.ts`.
3.  Implementar `waha.ts` com a lógica de chamada da API Waha (Endpoints `/api/send/text`, etc.).
4.  Criar `factory.ts` que recebe uma instância (do DB) e retorna o Provider instanciado.

### Fase 3: Worker e Processamento
1.  Refatorar `job-worker/index.ts`:
    *   Ao processar um job, buscar a instância no DB.
    *   Usar `ProviderFactory.getProvider(instance).sendMessage(...)`.
    *   Isso elimina os `if/else` gigantes e hardcoded para Evolution.

### Fase 4: Webhook Waha
1.  Criar função `waha-webhook`.
2.  **Lógica de Normalização:** Converter o JSON da Waha para o formato que nossa função `process_incoming_message` (RPC do Postgres) espera.
    *   Mapear `payload.from` -> `phone`.
    *   Mapear `payload.body` -> `content`.
    *   Chamar a mesma procedure de banco `handle_evolution_webhook` (talvez renomear para `handle_incoming_webhook` para ser genérico) ou chamar o RPC diretamente.

### Fase 5: Testes
1.  Testar envio de mensagem via Waha (mockando a API ou usando instância real).
2.  Testar recebimento de webhook simulando payload da Waha.

## 5. Considerações de Segurança e Performance
*   **API Keys:** As chaves da Waha devem ser armazenadas encriptadas ou no `connection_config` (protegido por RLS).
*   **Idempotência:** Garantir que o `waha-webhook` trate duplicidade de mensagens (usando ID da mensagem).
*   **Timeouts:** Waha pode ter tempos de resposta diferentes; ajustar timeouts do `fetch` no adapter.

## 6. Próximos Passos Imediatos
1.  Aprovar este plano.
2.  Executar migração de banco de dados.
3.  Iniciar refatoração do `_shared`.
