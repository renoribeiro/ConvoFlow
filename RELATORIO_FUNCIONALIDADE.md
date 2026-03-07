# Relatório de Funcionalidades do ConvoFlow

## 1. Introdução

Este relatório fornece uma visão geral abrangente da funcionalidade do aplicativo ConvoFlow, com base em uma análise detalhada de seu código-fonte. O ConvoFlow é uma poderosa plataforma de automação de marketing projetada para se integrar ao WhatsApp por meio da API Evolution. Ele oferece um rico conjunto de recursos para rastreamento de leads, gerenciamento de campanhas, relatórios e automação, tudo construído em uma pilha de tecnologia moderna que inclui Vite, React, Supabase e TypeScript.

## 2. Arquitetura de Alto Nível

O ConvoFlow é um aplicativo full-stack com uma clara separação de responsabilidades entre o frontend, o backend e o banco de dados.

*   **Frontend**: O frontend é uma aplicação de página única (SPA) construída com Vite e React. Ele usa o Tailwind CSS para estilização e uma variedade de bibliotecas para componentes de interface do usuário, gerenciamento de estado e busca de dados.
*   **Backend**: O backend é composto por um conjunto de funções sem servidor implantadas no Supabase. Essas funções lidam com a lógica de negócios, o processamento de dados e a integração com serviços externos, como a API Evolution e o Stripe.
*   **Banco de Dados**: O banco de dados é uma instância do PostgreSQL gerenciada pelo Supabase. O esquema do banco de dados é bem projetado e inclui tabelas para rastreamento, relatórios, monitoramento e outros dados críticos para a aplicação.

## 3. Análise do Frontend

O frontend do ConvoFlow é uma interface de usuário moderna e responsiva que oferece um rico conjunto de recursos para gerenciar campanhas de marketing e automações.

### 3.1. Pilha de Tecnologia

*   **Framework**: React (SPA)
*   **Build Tool**: Vite
*   **Roteamento**: React Router Dom
*   **Linguagem**: TypeScript
*   **Estilização**: Tailwind CSS
*   **Componentes de UI**: Shadcn UI, Radix UI
*   **Gerenciamento de Estado**: Zustand
*   **Busca de Dados**: TanStack Query
*   **Formulários**: React Hook Form
*   **Validação**: Zod

### 3.2. Principais Recursos

*   **Dashboard**: O painel fornece uma visão geral de alto nível das principais métricas, incluindo rastreamento de leads, desempenho de campanhas e status do sistema.
*   **Rastreamento de Leads**: O aplicativo inclui um sistema abrangente para rastrear leads de várias fontes, incluindo parâmetros UTM.
*   **Gerenciamento de Campanhas**: Os usuários podem criar e gerenciar campanhas de marketing, incluindo a configuração de fluxos de automação e modelos de mensagens.
*   **Relatórios**: O aplicativo fornece um mecanismo de relatórios flexível que permite aos usuários criar relatórios e painéis personalizados.
*   **Automação**: O ConvoFlow inclui um poderoso mecanismo de automação que permite aos usuários criar fluxos de automação complexos com base em uma variedade de gatilhos e ações.
*   **Configurações**: A seção de configurações permite que os usuários configurem sua conta, gerenciem usuários e se conectem a serviços externos.

## 4. Análise do Backend

O backend do ConvoFlow é construído em uma arquitetura sem servidor usando as Funções do Supabase. Isso fornece uma solução escalável e econômica para lidar com a lógica de backend e o processamento de dados.

### 4.1. Pilha de Tecnologia

*   **Plataforma**: Supabase Functions
*   **Runtime**: Deno
*   **Linguagem**: TypeScript
*   **Banco de Dados**: Supabase (PostgreSQL)

### 4.2. Principais Funções

*   **`evolution-webhook`**: Esta função é o ponto de extremidade principal para receber webhooks da API Evolution. Ela processa mensagens recebidas, atualizações de status de conexão e outros eventos e, em seguida, aciona as ações apropriadas no aplicativo.
*   **`automation-processor`**: Esta função é responsável por executar os fluxos de automação. Ela é acionada por eventos no aplicativo, como a criação de um novo lead ou o recebimento de uma mensagem, e então executa as etapas no fluxo de automação correspondente.
*   **`job-worker`**: Esta função é um trabalhador de propósito geral que pode ser usado para executar uma variedade de trabalhos em segundo plano, como enviar e-mails, processar relatórios e limpar dados antigos.

## 5. Análise do Banco de Dados

O banco de dados é um componente crítico do aplicativo ConvoFlow, e está claro que muito pensamento foi dedicado ao seu design. O esquema do banco de dados é bem organizado e inclui um conjunto abrangente de tabelas para gerenciar todos os aspectos do aplicativo.

### 5.1. Tabelas Principais

*   **`traffic_sources`**: Esta tabela armazena informações sobre as fontes de tráfego para o aplicativo, incluindo parâmetros UTM.
*   **`lead_tracking`**: Esta tabela rastreia os leads à medida que eles se movem pelo funil de vendas.
*   **`report_templates`**: Esta tabela armazena modelos para relatórios personalizados.
*   **`automation_flows`**: Esta tabela armazena as definições dos fluxos de automação.
*   **`webhook_logs`**: Esta tabela registra todos os webhooks recebidos da API Evolution.

### 5.2. Segurança

O banco de dados é protegido usando uma combinação de Segurança em Nível de Linha (RLS) e verificação de JWT. O RLS é usado para garantir que os usuários só possam acessar os dados que estão autorizados a ver, e a verificação de JWT é usada para garantir que apenas usuários autenticados possam acessar o banco de dados.

## 6. Scripts e Automação

O diretório `scripts` contém um conjunto de scripts para automatizar vários aspectos do processo de desenvolvimento e implantação.

*   **`deploy-evolution.js`**: Este script automatiza a implantação da API Evolution em uma instância do Portainer.
*   **`security-check.cjs`**: Este script é um scanner de segurança que verifica vulnerabilidades e configurações incorretas comuns.
*   **`setup-security.cjs`**: Este script automatiza a configuração de arquivos e configurações relacionados à segurança.

## 7. Conclusão

O ConvoFlow é uma plataforma de automação de marketing bem projetada e bem construída, com um rico conjunto de recursos. O aplicativo é construído em uma pilha de tecnologia moderna e segue as melhores práticas de segurança, escalabilidade e manutenibilidade. O uso do Supabase para o backend e o banco de dados fornece uma plataforma poderosa e flexível para construir e implantar o aplicativo.