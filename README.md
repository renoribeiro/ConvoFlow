# ConvoFlow 🚀

Uma plataforma completa de automação e gerenciamento de conversas para WhatsApp Business e outros canais de comunicação.

## 📋 Visão Geral

O ConvoFlow é uma solução abrangente que permite às empresas automatizar, monitorar e otimizar suas comunicações com clientes através de múltiplos canais. Com uma interface moderna e intuitiva, oferece ferramentas poderosas para análise, automação e gerenciamento de conversas.

## ✨ Funcionalidades Principais

### 🏠 Dashboard Principal
- **Visão geral em tempo real** do sistema
- **Métricas principais** (mensagens, usuários, conversões, tempo de resposta)
- **Gráficos interativos** de atividade semanal e distribuição por canal
- **Ações rápidas** para tarefas comuns
- **Atividade recente** e alertas do sistema
- **Status do sistema** com monitoramento de recursos

### 📊 Análise de Performance
- **Métricas de sistema** (CPU, memória, rede, conexões)
- **Análise de conversas** (volume, taxa de conversão, satisfação)
- **Engajamento de usuários** (usuários ativos, sessões, retenção)
- **Alertas de performance** automáticos
- **Relatórios exportáveis** em múltiplos formatos

### ⚙️ Configurações Avançadas
- **Configurações gerais** do sistema
- **Otimizações de performance**
- **Configurações de segurança** e autenticação
- **Gerenciamento de notificações**
- **Integração com WhatsApp Business**
- **Personalização da interface**

### 🔍 Monitoramento do Sistema
- **Monitoramento em tempo real** de recursos
- **Status de serviços** e saúde do sistema
- **Alertas automáticos** para problemas
- **Gráficos de performance** histórica
- **Métricas de disponibilidade**

### 🔗 Gerenciamento de Integrações
- **Integrações com APIs externas**
- **Templates de integração** pré-configurados
- **Monitoramento de APIs**
- **Configuração de webhooks**
- **Documentação interativa**

### 📈 Relatórios Avançados
- **Relatórios personalizáveis** com múltiplos tipos de gráfico
- **Filtros avançados** por período, canal, tipo
- **Construtor visual** de relatórios
- **Templates de relatório** pré-definidos
- **Exportação** em PDF, Excel, CSV
- **Agendamento automático** de relatórios

### 🤖 Automação de Workflows
- **Criação visual** de workflows
- **Triggers personalizáveis** (tempo, evento, condição)
- **Ações automatizadas** (envio de mensagem, atualização de dados)
- **Condições lógicas** complexas
- **Histórico de execuções**
- **Templates de workflow** prontos para uso

### 💬 Templates de Mensagens
- **Biblioteca de templates** organizados por categoria
- **Editor visual** com preview em tempo real
- **Variáveis dinâmicas** e personalização
- **Botões interativos** e mídia
- **Análise de performance** de templates
- **Versionamento** e histórico de alterações

### 🔧 Configurações de API
- **Gerenciamento de endpoints** e documentação
- **Chaves de API** com controle de acesso
- **Configuração de webhooks**
- **Métricas de uso** da API
- **Rate limiting** e segurança
- **Logs de requisições**

### 💾 Gerenciamento de Backup
- **Backups automáticos** agendados
- **Backup manual** sob demanda
- **Restauração seletiva** de dados
- **Histórico de backups**
- **Verificação de integridade**
- **Armazenamento seguro**

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 18** com TypeScript
- **Tailwind CSS** para estilização
- **Shadcn/ui** para componentes de interface
- **Recharts** para gráficos e visualizações
- **Lucide React** para ícones
- **Date-fns** para manipulação de datas
- **React Hook Form** para formulários
- **Zod** para validação de dados

### Backend & Database
- **Supabase** para backend e banco de dados
- **PostgreSQL** como banco de dados principal
- **Row Level Security (RLS)** para segurança
- **Real-time subscriptions** para atualizações em tempo real

### Ferramentas de Desenvolvimento
- **Vite** como bundler
- **ESLint** para linting
- **Prettier** para formatação de código
- **TypeScript** para tipagem estática

## 🚀 Instalação e Configuração

### Pré-requisitos
- Node.js 18+ 
- npm ou yarn
- Conta no Supabase

### Passos de Instalação

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/convoflow.git
cd convoflow
```

2. **Instale as dependências**
```bash
npm install
# ou
yarn install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env.local
```

Edite o arquivo `.env.local` com suas configurações:
```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_ANON_KEY=sua_chave_anonima_do_supabase
VITE_WHATSAPP_API_URL=sua_url_da_api_whatsapp
VITE_WHATSAPP_API_TOKEN=seu_token_da_api_whatsapp
```

4. **Inicie o servidor de desenvolvimento**
```bash
npm run dev
# ou
yarn dev
```

5. **Acesse a aplicação**
Abra [http://localhost:5173](http://localhost:5173) no seu navegador

## 📁 Estrutura do Projeto

```
convoflow/
├── src/
│   ├── components/          # Componentes React
│   │   ├── analytics/       # Componentes de análise
│   │   ├── api/            # Configurações de API
│   │   ├── automation/     # Automação de workflows
│   │   ├── backup/         # Gerenciamento de backup
│   │   ├── dashboard/      # Dashboard principal
│   │   ├── integrations/   # Gerenciamento de integrações
│   │   ├── monitoring/     # Monitoramento do sistema
│   │   ├── reports/        # Relatórios avançados
│   │   ├── settings/       # Configurações do sistema
│   │   ├── templates/      # Templates de mensagens
│   │   └── ui/            # Componentes de interface
│   ├── hooks/              # Custom hooks
│   ├── lib/               # Utilitários e configurações
│   ├── types/             # Definições de tipos TypeScript
│   └── utils/             # Funções utilitárias
├── public/                # Arquivos públicos
└── docs/                  # Documentação adicional
```

## 🔧 Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento
- `npm run build` - Gera a build de produção
- `npm run preview` - Visualiza a build de produção
- `npm run lint` - Executa o linting do código
- `npm run type-check` - Verifica os tipos TypeScript

---

**ConvoFlow** - Transformando conversas em resultados! 🚀💬
