/**
 * Conteúdo de ajuda contextual ("o que faz / como configurar / exemplo") para as
 * funções do Chatbot e do módulo de Automações. Consumido pelo componente
 * <FeatureHelp />, que abre um painel lateral explicando a função.
 *
 * Chaves:
 *  - Nós do chatbot: o próprio node_type (ex.: 'ask_question').
 *  - Automações: prefixadas — 'trigger:*', 'action:*', 'condition:*'.
 *  - Conceitos: prefixadas com 'concept:*'.
 */

export interface FeatureHelpEntry {
  title: string;
  /** Frase curta: o que a função faz. */
  whatItDoes: string;
  /** Passo-a-passo de configuração. */
  howToConfigure: string[];
  /** Exemplo concreto de uso. */
  example?: string;
  /** Dicas extras (opcional). */
  tips?: string[];
}

export const FEATURE_HELP: Record<string, FeatureHelpEntry> = {
  // ----------------------------------------------------------------- Conceito
  'concept:variables': {
    title: 'Variáveis',
    whatItDoes:
      'Variáveis guardam dados do contato durante a conversa (ex.: o nome que o lead digitou). Você as referencia escrevendo {nome} em qualquer texto.',
    howToConfigure: [
      'No chatbot, use o nó "Fazer Pergunta" e defina "Salvar na variável" (ex.: nome).',
      'O valor digitado pelo lead é salvo na variável e também gravado no contato (campo personalizado), ficando disponível depois.',
      'Em mensagens, use {nome}, {first_name}, {phone}, {email} e suas variáveis personalizadas.',
      'Nas Automações, use o gatilho "Variável Capturada", a ação "Atualizar Contato" e a condição "Variável".',
    ],
    example:
      'O bot pergunta "Qual seu nome?" e salva em {nome}. Uma automação com gatilho "Variável Capturada = nome" atualiza o Nome do contato com {nome} automaticamente.',
    tips: [
      'Variáveis de sistema sempre existem: {name}, {first_name}, {phone}, {email}, {date}, {time}, {datetime}.',
      'Tokens desconhecidos ficam como estão — se escrever {xyz} sem essa variável, o texto sai literal.',
    ],
  },

  // -------------------------------------------------------------- Nós chatbot
  start: {
    title: 'Início do Fluxo',
    whatItDoes: 'Ponto de partida do chatbot. Todo fluxo começa aqui (apenas 1 por chatbot).',
    howToConfigure: [
      'Conecte a saída do Início ao primeiro nó (geralmente "Enviar Texto").',
      'Não precisa de configuração própria.',
    ],
    example: 'Início → Enviar Texto ("Olá! Bem-vindo 👋").',
  },
  send_text: {
    title: 'Enviar Texto',
    whatItDoes: 'Envia uma mensagem de texto para o lead.',
    howToConfigure: [
      'Escreva a mensagem no campo de texto.',
      'Use {variavel} para personalizar (ex.: "Olá {first_name}!").',
      'Opcional: defina um atraso (em segundos) antes de enviar.',
    ],
    example: '"Oi {first_name}! Como posso te ajudar hoje?"',
  },
  ask_question: {
    title: 'Fazer Pergunta',
    whatItDoes: 'Faz uma pergunta e aguarda a resposta do lead, salvando-a em uma variável.',
    howToConfigure: [
      'Escreva a pergunta.',
      'Defina "Salvar na variável" (ex.: nome, email) — comece por letra, use só letras/números/_.',
      'Opcional: escolha uma validação (e-mail, telefone, número) para rejeitar respostas inválidas.',
    ],
    example: 'Pergunta "Qual seu e-mail?" com validação "e-mail" e salva em {email}.',
    tips: ['A resposta salva fica disponível em todos os nós seguintes e também é gravada no contato.'],
  },
  show_options: {
    title: 'Menu de Opções',
    whatItDoes: 'Apresenta um menu numerado e ramifica o fluxo conforme a opção escolhida.',
    howToConfigure: [
      'Escreva a mensagem do menu.',
      'Adicione as opções (cada uma vira uma saída do nó).',
      'Conecte cada saída ao próximo nó correspondente.',
    ],
    example: '"1) Vendas  2) Suporte" → cada opção leva a um caminho diferente.',
  },
  condition: {
    title: 'Condição (Se/Senão)',
    whatItDoes: 'Desvia o fluxo com base no valor de uma variável.',
    howToConfigure: [
      'Escolha a variável a avaliar.',
      'Escolha o operador (contém, é igual, está preenchida, está vazia).',
      'Conecte a saída "Verdadeiro" e a saída "Falso" aos próximos nós.',
    ],
    example: 'Se {interesse} contém "imóvel" → caminho A; senão → caminho B.',
  },
  transfer_agent: {
    title: 'Transferir para Atendente',
    whatItDoes: 'Encerra a automação do bot e passa a conversa para um atendente humano.',
    howToConfigure: [
      'Opcional: escreva uma mensagem de transição ("Aguarde, vou te transferir...").',
      'Escolha atribuir a qualquer atendente ou a um usuário específico.',
    ],
    example: 'Lead pede falar com humano → Transferir para Atendente.',
  },
  set_variable: {
    title: 'Salvar Variável',
    whatItDoes: 'Cria ou atualiza uma variável com um valor fixo ou montado a partir de outras variáveis.',
    howToConfigure: [
      'Defina o nome da variável.',
      'Defina o valor (pode conter {variaveis}).',
    ],
    example: 'Salvar {saudacao} = "Olá {first_name}".',
  },
  update_contact: {
    title: 'Atualizar Contato',
    whatItDoes: 'Grava um valor em um campo do contato (nome, e-mail, telefone ou tag).',
    howToConfigure: [
      'Escolha o campo do contato.',
      'Defina o valor (geralmente uma {variavel} coletada antes).',
    ],
    example: 'Campo "Nome" = {nome} → o contato passa a ter o nome informado.',
  },
  move_funnel: {
    title: 'Mover no Funil',
    whatItDoes: 'Move o contato para uma etapa específica do funil de vendas.',
    howToConfigure: ['Escolha a etapa de destino do funil.'],
    example: 'Após qualificar o lead → mover para "Em negociação".',
  },
  end_flow: {
    title: 'Encerrar Fluxo',
    whatItDoes: 'Finaliza o fluxo do chatbot e a sessão do lead.',
    howToConfigure: ['Opcional: mensagem de despedida.', 'Opcional: encerrar silenciosamente (sem mensagem).'],
    example: '"Obrigado pelo contato! Até logo 👋"',
  },

  // ------------------------------------------------------ Automações: gatilhos
  'trigger:message_received': {
    title: 'Gatilho: Mensagem Recebida',
    whatItDoes: 'Inicia a automação quando o contato envia uma mensagem (opcionalmente filtrando por palavras-chave).',
    howToConfigure: [
      'Opcional: informe palavras-chave (separadas por vírgula).',
      'Opcional: marque "correspondência exata" para casar a mensagem inteira.',
    ],
    example: 'Palavra-chave "preço" → dispara uma resposta automática com a tabela de preços.',
  },
  'trigger:contact_created': {
    title: 'Gatilho: Novo Contato',
    whatItDoes: 'Inicia a automação quando um novo contato é criado.',
    howToConfigure: ['Opcional: filtre pela fonte do contato (whatsapp, site, manual).'],
    example: 'Novo contato do WhatsApp → enviar mensagem de boas-vindas.',
  },
  'trigger:funnel_stage_changed': {
    title: 'Gatilho: Mudança de Estágio',
    whatItDoes: 'Inicia a automação quando o contato muda de etapa no funil.',
    howToConfigure: ['Opcional: filtre o estágio de origem e/ou de destino.'],
    example: 'Mudou para "Em negociação" → agendar follow-up em 24h.',
  },
  'trigger:scheduled_time': {
    title: 'Gatilho: Horário Agendado',
    whatItDoes: 'Inicia a automação em horários definidos (diário, semanal, mensal).',
    howToConfigure: ['Escolha a periodicidade.', 'Defina o horário.'],
    example: 'Todo dia às 9h → enviar lembrete.',
  },
  'trigger:variable_captured': {
    title: 'Gatilho: Variável Capturada',
    whatItDoes:
      'Inicia a automação em tempo real assim que o chatbot captura ou atualiza uma variável (ex.: o nome do lead). Esse é o gatilho para reagir ao que o bot coletou.',
    howToConfigure: [
      'Escolha a variável que dispara (ex.: nome).',
      'Opcional: adicione uma condição de valor (ex.: "é igual a" / "contém") para só disparar em certos casos.',
      'Monte as ações abaixo (ex.: "Atualizar Contato").',
    ],
    example:
      'Bot coleta {nome} → gatilho "Variável Capturada = nome" → ação "Atualizar Contato: Nome = {nome}". O contato é atualizado na hora.',
    tips: ['Deixe a condição em branco para disparar sempre que a variável for capturada/alterada.'],
  },

  // -------------------------------------------------------- Automações: ações
  'action:send_message': {
    title: 'Ação: Enviar Mensagem',
    whatItDoes: 'Envia uma mensagem via WhatsApp para o contato.',
    howToConfigure: [
      'Escolha um template aprovado ou escreva uma mensagem personalizada.',
      'Use {variavel} para personalizar (ex.: "Olá {first_name}").',
    ],
    example: '"Recebemos seus dados, {nome}! Em breve entramos em contato."',
  },
  'action:change_funnel_stage': {
    title: 'Ação: Alterar Estágio',
    whatItDoes: 'Move o contato para outra etapa do funil.',
    howToConfigure: ['Escolha o novo estágio.'],
    example: 'Após resposta positiva → mover para "Qualificado".',
  },
  'action:schedule_followup': {
    title: 'Ação: Agendar Follow-up',
    whatItDoes: 'Cria um follow-up automático (tarefa ou envio agendado) para o contato.',
    howToConfigure: [
      'Defina o atraso em horas.',
      'Escolha o tipo (whatsapp, ligação, e-mail).',
      'Opcional: escreva a mensagem (com {variaveis}).',
    ],
    example: 'Em 24h, enviar "Oi {first_name}, conseguiu ver nossa proposta?"',
  },
  'action:add_tag': {
    title: 'Ação: Adicionar Tag',
    whatItDoes: 'Aplica uma etiqueta (tag) ao contato — útil para segmentar.',
    howToConfigure: ['Informe o nome da tag (pode conter {variaveis}).'],
    example: 'Adicionar tag "lead-quente".',
  },
  'action:update_contact': {
    title: 'Ação: Atualizar Contato',
    whatItDoes:
      'Grava o valor de uma variável em um campo do contato (nome, e-mail, telefone, tag ou um campo personalizado) — em tempo real.',
    howToConfigure: [
      'Escolha o campo: Nome, E-mail, Telefone, Tag ou "Campo personalizado".',
      'Se escolher "Campo personalizado", informe o nome do campo.',
      'Defina o valor — normalmente uma {variavel} coletada pelo chatbot.',
    ],
    example:
      'Campo "Nome" = {nome}: quando o bot captura o nome do lead, esta ação atualiza o contato automaticamente.',
    tips: ['Combine com o gatilho "Variável Capturada" para atualizar o contato no instante em que o dado é coletado.'],
  },
  'action:delay': {
    title: 'Ação: Aguardar',
    whatItDoes: 'Adiciona uma pausa antes da próxima ação.',
    howToConfigure: ['Escolha a unidade (minutos, horas, dias) e o valor.'],
    example: 'Aguardar 2 horas antes de enviar a próxima mensagem.',
  },

  // ---------------------------------------------------- Automações: condições
  'condition:contact_has_tag': {
    title: 'Condição: Contato tem Tag',
    whatItDoes: 'Continua o fluxo apenas se o contato tiver a tag indicada.',
    howToConfigure: ['Informe o nome da tag.'],
    example: 'Só envia a oferta se o contato tiver a tag "cliente".',
  },
  'condition:contact_in_stage': {
    title: 'Condição: Contato no Estágio',
    whatItDoes: 'Continua o fluxo apenas se o contato estiver no estágio indicado do funil.',
    howToConfigure: ['Escolha o estágio.'],
    example: 'Só agenda follow-up se estiver em "Em negociação".',
  },
  'condition:message_contains': {
    title: 'Condição: Mensagem Contém',
    whatItDoes: 'Continua o fluxo apenas se a mensagem contiver as palavras indicadas.',
    howToConfigure: ['Informe as palavras-chave.', 'Opcional: marque "sensível a maiúsculas".'],
    example: 'Só responde se a mensagem contiver "orçamento".',
  },
  'condition:variable_condition': {
    title: 'Condição: Variável',
    whatItDoes: 'Continua o fluxo apenas se a variável satisfizer a condição. Caso contrário, o fluxo para.',
    howToConfigure: [
      'Escolha a variável.',
      'Escolha o operador (é igual a, contém, está preenchida, está vazia).',
      'Se usar "é igual a" / "contém", informe o valor de comparação.',
    ],
    example: 'Só atualiza o contato se {email} estiver preenchida.',
  },
};

/** Retorna o conteúdo de ajuda de uma chave, ou null se não houver. */
export function getFeatureHelp(key: string | null | undefined): FeatureHelpEntry | null {
  if (!key) return null;
  return FEATURE_HELP[key] ?? null;
}
