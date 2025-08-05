# Guia de Segurança - ConvoFlow

## Visão Geral

Este documento descreve as medidas de segurança implementadas no projeto ConvoFlow para garantir a proteção de dados sensíveis e a integridade do sistema.

## Melhorias de Segurança Implementadas

### 1. Gerenciamento Seguro de Variáveis de Ambiente

#### Problema Resolvido
- **Crítico**: Chaves sensíveis (Supabase URL e API Key) expostas no código

#### Solução Implementada
- Criação do sistema `EnvironmentManager` (`src/lib/env.ts`)
- Arquivo `.env.example` com todas as variáveis necessárias
- Atualização do `.gitignore` para proteger arquivos sensíveis
- Migração do cliente Supabase para usar variáveis de ambiente

#### Como Usar
```bash
# 1. Copie o arquivo de exemplo
cp .env.example .env

# 2. Configure suas variáveis de ambiente
# Edite o arquivo .env com suas chaves reais
```

### 2. Sistema de Logging Seguro

#### Problema Resolvido
- **Moderado**: Logs de debug em produção expondo dados sensíveis
- **Moderado**: Uso direto de console.log sem sanitização

#### Solução Implementada
- Sistema de logging centralizado (`src/lib/logger.ts`)
- Sanitização automática de dados sensíveis
- Logs estruturados com contexto
- Diferentes níveis de log (debug, info, warn, error)

#### Exemplo de Uso
```typescript
import { logger } from '@/lib/logger';

// Logs são automaticamente sanitizados
logger.info('User authenticated', {
  userId: user.id,
  apiKey: 'secret-key' // Será mascarado como '***'
});
```

### 3. Validação e Sanitização de Entrada

#### Problema Resolvido
- **Moderado**: Validação de entrada insuficiente
- **Moderado**: Possível injeção de código

#### Solução Implementada
- Sistema de validação centralizado (`src/lib/validation.ts`)
- Esquemas Zod para validação tipada
- Sanitização de URLs, HTML e SQL
- Validação de números de telefone, emails e senhas

#### Exemplo de Uso
```typescript
import { ValidationSchemas, validateInput } from '@/lib/validation';

const result = validateInput(ValidationSchemas.url, userInput);
if (result.success) {
  // Usar result.data (validado e sanitizado)
} else {
  // Tratar result.error
}
```

### 4. Segurança nas Funções Edge do Supabase

#### Problema Resolvido
- **Crítico**: Verificação JWT desabilitada nas funções Edge
- **Moderado**: Falta de validação em webhooks

#### Solução Implementada
- Habilitação da verificação JWT (`supabase/config.toml`)
- Sistema de validação para funções Edge (`supabase/functions/_shared/validation.ts`)
- Logging seguro para funções Edge (`supabase/functions/_shared/logger.ts`)
- Validação rigorosa de dados de webhook
- Tratamento de erros estruturado

### 5. Melhorias no Serviço Evolution API

#### Problema Resolvido
- **Moderado**: Falta de validação em requisições API
- **Moderado**: Logs inseguros de requisições

#### Solução Implementada
- Validação de URLs e chaves API no construtor
- Sanitização de URLs
- Logging seguro de requisições (sem dados sensíveis)
- Tratamento melhorado de erros de rede

## Configuração de Segurança

### Variáveis de Ambiente Obrigatórias

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Evolution API Configuration
VITE_EVOLUTION_API_URL=your_evolution_api_url
VITE_EVOLUTION_API_KEY=your_evolution_api_key

# Application Configuration
VITE_APP_NAME=ConvoFlow
VITE_APP_VERSION=1.0.0
VITE_APP_ENVIRONMENT=production

# Security Configuration
VITE_ENABLE_DEBUG_LOGS=false
VITE_ENABLE_CONSOLE_LOGS=false
```

### Configuração do Supabase

1. **Funções Edge**: JWT habilitado por padrão
2. **RLS (Row Level Security)**: Verificar se está habilitado em todas as tabelas
3. **Políticas de Acesso**: Revisar regularmente

## Monitoramento e Auditoria

### Logs de Segurança

Todos os eventos de segurança são logados:
- Tentativas de autenticação
- Validações falhadas
- Erros de API
- Acessos não autorizados

### Alertas Recomendados

1. **Múltiplas tentativas de validação falhadas**
2. **Erros de autenticação JWT**
3. **Tentativas de acesso a recursos não autorizados**
4. **Padrões suspeitos em logs**

## Boas Práticas de Desenvolvimento

### 1. Nunca Commitar Segredos
```bash
# Verificar antes de commit
git diff --cached | grep -E "(password|secret|key|token)"
```

### 2. Usar Validação em Todas as Entradas
```typescript
// ❌ Não fazer
const result = await api.call(userInput);

// ✅ Fazer
const validation = validateInput(schema, userInput);
if (validation.success) {
  const result = await api.call(validation.data);
}
```

### 3. Logging Seguro
```typescript
// ❌ Não fazer
console.log('User data:', { password: user.password });

// ✅ Fazer
logger.info('User authenticated', { userId: user.id });
```

### 4. Tratamento de Erros
```typescript
// ❌ Não fazer
catch (error) {
  throw new Error(error.message); // Pode vazar informações
}

// ✅ Fazer
catch (error) {
  logger.error('Operation failed', { operation: 'user_auth' }, error);
  throw new SecureError('Authentication failed', 'AUTH_ERROR');
}
```

## Checklist de Segurança

### Antes de Deploy

- [ ] Todas as variáveis de ambiente estão configuradas
- [ ] Arquivo `.env` não está no repositório
- [ ] JWT está habilitado nas funções Edge
- [ ] Logs de debug estão desabilitados em produção
- [ ] Todas as entradas são validadas
- [ ] Dados sensíveis são sanitizados nos logs

### Manutenção Regular

- [ ] Revisar logs de segurança semanalmente
- [ ] Atualizar dependências mensalmente
- [ ] Auditar políticas RLS trimestralmente
- [ ] Revisar acessos e permissões semestralmente

## Contato de Segurança

Para reportar vulnerabilidades de segurança:
- Email: security@convoflow.com
- Criar issue privada no repositório
- Seguir o processo de divulgação responsável

## Recursos Adicionais

- [Supabase Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [TypeScript Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)