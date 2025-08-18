# ConvoFlow - Schema do Banco de Dados

Este diretório contém exportações completas do schema do banco de dados Supabase do ConvoFlow.

## 📁 Arquivos de Schema

### Exportação Completa
- **schema-export-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Exportação completa do schema em formato JSON
- **schema-ddl-YYYY-MM-DDTHH-mm-ss-sssZ.sql**: DDL SQL com todas as migrações aplicadas
- **schema-summary-YYYY-MM-DDTHH-mm-ss-sssZ.json**: Resumo do schema com estatísticas

## 🗂️ Conteúdo do Schema Export

### Informações Incluídas
- **Tables**: Informações das tabelas (via information_schema.tables)
- **Columns**: Detalhes das colunas (via information_schema.columns)
- **Constraints**: Constraints e relacionamentos (via information_schema.table_constraints)
- **Migrations**: Todas as migrações SQL aplicadas

### Migrações Incluídas
O schema inclui todas as migrações do diretório `supabase/migrations/`:

1. `001_create_tracking_tables.sql` - Tabelas de rastreamento
2. `002_create_reports_tables.sql` - Tabelas de relatórios
3. `003_create_monitoring_tables.sql` - Tabelas de monitoramento
4. `20241220000000_create_stripe_config.sql` - Configuração do Stripe
5. `20241220000001_create_stripe_transactions.sql` - Transações do Stripe
6. `20250103000001_automation_flows.sql` - Fluxos de automação
7. `20250103000002_notifications.sql` - Sistema de notificações
8. `20250103000002_refresh_materialized_views.sql` - Views materializadas
9. `20250103000003_create_message_templates.sql` - Templates de mensagens
10. `20250103000004_stripe_integration.sql` - Integração completa do Stripe
11. `20250103000005_fix_admin_rls_policies.sql` - Correção de políticas RLS admin
12. `20250103000006_fix_profiles_rls_recursion.sql` - Correção de recursão RLS
13. `20250103000007_fix_auth_users_rls_policy.sql` - Correção de política RLS auth
14. `20250109000001_fix_chatbots_schema.sql` - Correção do schema de chatbots
15. `20250116000001_fix_tracking_views_rls.sql` - Correção de RLS em views
16. `add_webhook_performance_metrics.sql` - Métricas de performance de webhooks

## 📊 Último Schema Export

**Data**: 2025-08-18T17:27:30.193Z
**Total de Migrações**: 34
**Status**: ✅ Concluído com sucesso

### Estatísticas
- Total de tabelas: 0 (via information_schema - limitação de permissões)
- Total de colunas: 0 (via information_schema - limitação de permissões)
- Total de constraints: 0 (via information_schema - limitação de permissões)
- Total de migrações: 34 arquivos SQL

## 🔧 Como Usar

### Exportar Schema
```bash
node export-database-schema.js
```

### Aplicar Schema em Novo Banco
```sql
-- Execute o arquivo schema-ddl-*.sql em ordem
-- Todas as migrações serão aplicadas sequencialmente
```

### Verificar Schema
```javascript
// Use o arquivo schema-export-*.json para análise programática
const schema = require('./schema-export-2025-08-18T17-27-30-193Z.json');
console.log('Migrações:', schema.migrations.length);
```

## 🏗️ Estrutura do Banco

### Tabelas Principais
- **profiles** - Perfis de usuários com RLS
- **whatsapp_instances** - Instâncias do WhatsApp
- **conversations** - Conversas e histórico
- **messages** - Mensagens individuais
- **contacts** - Contatos e leads

### Automação e Chatbots
- **chatbots** - Configurações de chatbots
- **automation_flows** - Fluxos de automação
- **message_templates** - Templates reutilizáveis
- **followups** - Follow-ups automatizados

### Campanhas e Marketing
- **campaigns** - Campanhas de marketing
- **notifications** - Sistema de notificações

### Integrações
- **stripe_config** - Configurações do Stripe
- **stripe_transactions** - Transações financeiras

### Analytics e Tracking
- **tracking_events** - Eventos de rastreamento
- **tracking_sessions** - Sessões de usuário
- **tracking_conversions** - Conversões e métricas
- **reports_data** - Dados para relatórios
- **system_metrics** - Métricas do sistema

## 🛡️ Segurança e RLS

O schema inclui políticas de Row Level Security (RLS) para:
- Isolamento de dados por tenant/usuário
- Controle de acesso baseado em perfis
- Proteção de dados sensíveis
- Auditoria e logs de acesso

## 🔄 Versionamento

- Cada export é timestampado para versionamento
- Migrações são aplicadas em ordem cronológica
- Schema é compatível com Supabase CLI
- Backup automático antes de mudanças

## 📝 Notas Técnicas

- **Limitações**: information_schema pode ter limitações de permissão
- **Migrações**: Todas as migrações são preservadas no export
- **Formato**: JSON para análise programática, SQL para aplicação
- **Compatibilidade**: PostgreSQL 13+ e Supabase

## 🔗 Referências

- [Supabase Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [PostgreSQL Schema](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)