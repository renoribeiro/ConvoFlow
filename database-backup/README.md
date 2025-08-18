# ConvoFlow - Backup do Banco de Dados

Este diretório contém backups completos do banco de dados Supabase do ConvoFlow.

## 📁 Estrutura dos Backups

### Backup de Dados
- **backup-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Backup completo dos dados de todas as tabelas
- **backup-summary-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Resumo do backup com estatísticas

### Schema do Banco
- **../database-schema/schema-export-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Exportação completa do schema
- **../database-schema/schema-ddl-YYYY-MM-DDTHH-mm-ss-sssZ.sql**: DDL SQL com todas as migrações
- **../database-schema/schema-summary-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Resumo do schema

## 🗃️ Tabelas Incluídas no Backup

### Tabelas Principais
- `profiles` - Perfis de usuários
- `whatsapp_instances` - Instâncias do WhatsApp
- `conversations` - Conversas
- `messages` - Mensagens
- `contacts` - Contatos
- `campaigns` - Campanhas de marketing
- `chatbots` - Configurações de chatbots
- `followups` - Follow-ups automatizados

### Tabelas de Automação
- `automation_flows` - Fluxos de automação
- `message_templates` - Templates de mensagens
- `notifications` - Notificações do sistema

### Tabelas de Integração
- `stripe_config` - Configurações do Stripe
- `stripe_transactions` - Transações do Stripe

### Tabelas de Tracking e Analytics
- `tracking_events` - Eventos de rastreamento
- `tracking_sessions` - Sessões de rastreamento
- `tracking_conversions` - Conversões rastreadas
- `reports_data` - Dados de relatórios
- `system_metrics` - Métricas do sistema

## 🔧 Scripts de Backup

### Backup de Dados
```bash
node backup-database.js
```

### Exportação de Schema
```bash
node export-database-schema.js
```

## 📊 Último Backup

**Data**: 2025-08-18T17:26:32.227Z
**Total de Tabelas**: 18
**Total de Registros**: 3
**Status**: ✅ Concluído com sucesso

### Detalhes do Último Backup
- Profiles: 1 registro
- WhatsApp Instances: 0 registros
- Conversations: 0 registros
- Messages: 0 registros
- Contacts: 0 registros
- Campaigns: 0 registros
- Chatbots: 2 registros
- Followups: 0 registros
- Automation Flows: 0 registros
- Message Templates: 0 registros
- Notifications: 0 registros
- Stripe Config: 0 registros
- Stripe Transactions: 0 registros
- Tracking Events: 0 registros
- System Metrics: 0 registros

## 🔄 Restauração

Para restaurar o banco de dados a partir de um backup:

1. **Restaurar Schema**:
   ```sql
   -- Execute o arquivo schema-ddl-*.sql no seu banco Supabase
   ```

2. **Restaurar Dados**:
   ```javascript
   // Use o arquivo backup-*.json para restaurar os dados
   // Implemente um script de restauração conforme necessário
   ```

## 🛡️ Segurança

- ⚠️ **IMPORTANTE**: Estes backups podem conter dados sensíveis
- 🔒 Mantenha os backups em local seguro
- 🚫 Não compartilhe backups publicamente
- 🔑 Use variáveis de ambiente para credenciais

## 📝 Notas

- Os backups são gerados automaticamente com timestamp
- Algumas tabelas podem não existir ainda no schema (normal para desenvolvimento)
- Os arquivos JSON são formatados para facilitar a leitura
- O schema inclui todas as migrações do Supabase

## 🔗 Links Úteis

- [Documentação do Supabase](https://supabase.com/docs)
- [Guia de Backup do Supabase](https://supabase.com/docs/guides/platform/backups)
- [ConvoFlow Repository](https://github.com/renoribeiro/ConvoFlow)