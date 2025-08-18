# Documento de Requisitos de Produto - ConvoFlow

## 1. Visão Geral do Produto

O ConvoFlow é uma plataforma completa de automação e gestão de conversas do WhatsApp Business, projetada para empresas que utilizam o WhatsApp como principal canal de vendas e atendimento ao cliente. A plataforma oferece ferramentas avançadas de automação, chatbots inteligentes, campanhas de marketing, gestão de funil de vendas e analytics detalhados.

O produto resolve os principais problemas de empresas que dependem do WhatsApp: gestão manual de conversas, falta de automação, dificuldade em escalar atendimento, ausência de métricas e analytics, e integração limitada com outros sistemas de vendas.

O ConvoFlow visa se tornar a solução líder no mercado brasileiro de automação para WhatsApp Business, com potencial de expansão para outros mercados da América Latina.

## 2. Funcionalidades Principais

### 2.1 Papéis de Usuário

| Papel           | Método de Registro                  | Permissões Principais                                               |
| --------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Super Admin     | Criação manual pelo sistema         | Acesso completo a todos os tenants, configurações globais           |
| Admin do Tenant | Convite por Super Admin             | Gestão completa do tenant, usuários, configurações                  |
| Gerente         | Convite por Admin                   | Acesso a relatórios, campanhas, automações, configurações limitadas |
| Operador        | Convite por Admin/Gerente           | Gestão de conversas, contatos, execução de campanhas                |
| Visualizador    | Convite por qualquer papel superior | Acesso somente leitura a dashboards e relatórios                    |

### 2.2 Módulos Funcionais

Nossa plataforma ConvoFlow consiste nas seguintes páginas principais:

1. **Dashboard Principal**: métricas em tempo real, gráficos de performance, alertas do sistema, ações rápidas
2. **Gestão de Conversas**: lista de conversas ativas, chat window integrado, filtros avançados, busca por conteúdo
3. **Campanhas de Disparo**: wizard de criação, segmentação de público, agendamento, relatórios de performance
4. **Automação e Workflows**: builder visual de fluxos, triggers configuráveis, ações condicionais, integração com funil
5. **Chatbots Inteligentes**: criação de bots, treinamento, testes, analytics de interações
6. **Gestão de Contatos**: CRM integrado, segmentação, tags, histórico de interações
7. **Funil de Vendas**: estágios configuráveis, movimentação automática, relatórios de conversão
8. **Analytics e Relatórios**: dashboards customizáveis, exportação de dados, métricas de ROI
9. **Integrações**: WhatsApp Business API, CRMs externos, e-commerce, ferramentas de marketing
10. **Configurações**: instâncias WhatsApp, usuários, permissões, webhooks, API keys

### 2.3 Detalhes das Páginas

| Página              | Módulo                   | Descrição da Funcionalidade                                                                          |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Dashboard Principal | Métricas em Tempo Real   | Exibir KPIs principais: mensagens enviadas/recebidas, conversões, tempo de resposta, usuários ativos |
| Dashboard Principal | Gráficos de Performance  | Visualizar tendências de uso, picos de atividade, comparativos mensais usando Recharts               |
| Dashboard Principal | Alertas do Sistema       | Notificar problemas de conectividade, limites atingidos, falhas de automação                         |
| Dashboard Principal | Ações Rápidas            | Criar nova campanha, iniciar automação, adicionar contato, gerar relatório                           |
| Gestão de Conversas | Lista de Conversas       | Listar conversas ativas/arquivadas com filtros por status, data, operador, tags                      |
| Gestão de Conversas | Chat Window              | Interface de chat em tempo real com suporte a texto, mídia, emojis, templates                        |
| Gestão de Conversas | Busca Avançada           | Pesquisar por conteúdo de mensagens, contatos, período, tipo de mídia                                |
| Gestão de Conversas | Transferência            | Transferir conversas entre operadores, departamentos, com histórico                                  |
| Campanhas           | Wizard de Criação        | Processo guiado: definir público, criar mensagem, agendar envio, revisar configurações               |
| Campanhas           | Segmentação              | Filtrar contatos por estágio do funil, tags, fonte, comportamento, dados customizados                |
| Campanhas           | Templates                | Biblioteca de templates de mensagem com variáveis dinâmicas, prévia em tempo real                    |
| Campanhas           | Agendamento              | Definir data/hora de envio, fuso horário, horário comercial, intervalos entre envios                 |
| Campanhas           | Relatórios               | Métricas de entrega, abertura, resposta, conversão, ROI, comparativos                                |
| Automação           | Builder Visual           | Interface drag-and-drop para criar fluxos com triggers, condições, ações, delays                     |
| Automação           | Triggers                 | Configurar gatilhos: nova mensagem, palavra-chave, horário, mudança de estágio, webhook              |
| Automação           | Ações                    | Definir respostas: enviar mensagem, alterar estágio, adicionar tag, criar tarefa, notificar equipe   |
| Automação           | Testes                   | Simular fluxos com dados de teste, debug de condições, logs de execução                              |
| Chatbots            | Criação de Bots          | Definir personalidade, contexto, respostas padrão, fallbacks, escalação humana                       |
| Chatbots            | Treinamento              | Adicionar perguntas/respostas, importar FAQs, machine learning básico                                |
| Chatbots            | Analytics                | Métricas de satisfação, taxa de resolução, tópicos mais perguntados, melhorias sugeridas             |
| Contatos            | CRM Integrado            | Perfil completo: dados pessoais, histórico, interações, notas, tarefas                               |
| Contatos            | Segmentação              | Criar grupos dinâmicos baseados em comportamento, dados, engajamento                                 |
| Contatos            | Importação/Exportação    | Importar de CSV/Excel, integrar com CRMs, exportar relatórios                                        |
| Funil de Vendas     | Configuração de Estágios | Definir etapas do processo de vendas, cores, critérios de movimentação                               |
| Funil de Vendas     | Movimentação             | Arrastar contatos entre estágios, automação baseada em ações, histórico                              |
| Funil de Vendas     | Relatórios               | Taxa de conversão por estágio, tempo médio, gargalos, previsão de vendas                             |
| Analytics           | Dashboards               | Painéis customizáveis com widgets configuráveis, filtros de período, comparativos                    |
| Analytics           | Relatórios Avançados     | Relatórios detalhados de performance, ROI, eficiência de operadores, tendências                      |
| Analytics           | Exportação               | Exportar dados em CSV, PDF, Excel, integração com BI tools                                           |
| Integrações         | WhatsApp Business        | Configurar múltiplas instâncias, QR codes, webhooks, status de conexão                               |
| Integrações         | APIs Externas            | Conectar com CRMs, e-commerce, ERPs, ferramentas de marketing                                        |
| Integrações         | Webhooks                 | Configurar endpoints para eventos, autenticação, retry policies                                      |
| Configurações       | Gestão de Usuários       | Adicionar/remover usuários, definir permissões, grupos de acesso                                     |
| Configurações       | Configurações Gerais     | Fuso horário, idioma, horário comercial, limites de envio                                            |
| Configurações       | Backup e Segurança       | Backup automático, logs de auditoria, autenticação 2FA                                               |

## 3. Fluxos Principais

### 3.1 Fluxo do Administrador

1. **Setup Inicial**:

   * Login na plataforma

   * Configurar instância WhatsApp (QR Code)

   * Criar usuários e definir permissões

   * Configurar estágios do funil de vendas

   * Importar contatos iniciais

2. **Gestão Operacional**:

   * Monitorar dashboard de métricas

   * Criar campanhas de marketing

   * Configurar automações

   * Analisar relatórios

