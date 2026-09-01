/**
 * Conteúdo de ajuda contextual ("o que faz / como configurar / exemplo") das
 * funções do produto. Consumido pelo componente <FeatureHelp />, que abre um
 * painel lateral explicando a função.
 *
 * Chaves:
 *  - Telas do dashboard: prefixadas com 'page:' + o segmento da rota
 *    (ex.: 'page:conversations'). Abas de Configurações usam
 *    'page:settings-<aba>'.
 *  - Nós do chatbot: o próprio node_type (ex.: 'ask_question').
 *  - Automações: prefixadas — 'trigger:*', 'action:*', 'condition:*'.
 *  - Conceitos: prefixadas com 'concept:*'.
 *
 * IMPORTANTE: nunca use o nome "pelado" de uma tela como chave (ex.: 'condition'
 * já é um nó do chatbot e 'update_contact' já é um nó e uma ação). O namespace é
 * plano; o prefixo é o que evita colisão.
 *
 * A `category` e a `area` de cada entrada existem para que a página de Ajuda
 * possa montar o índice sem interpretar prefixo de chave.
 */
import type { UserRole } from '@/types/userHierarchy';

/**
 * Ordem das seções na página de Ajuda. Categoria nova entra AQUI, na posição em
 * que deve aparecer — a página não tem ordem própria.
 *
 * 'tutorial' vem primeiro e é a única categoria sem entradas em FEATURE_HELP:
 * o conteúdo dela mora em src/lib/help/tutorials.ts, porque um tutorial tem
 * forma diferente (objetivo + passos) de uma entrada de referência.
 */
export const HELP_CATEGORIES = ['tutorial', 'tela', 'chatbot', 'automacao', 'conceito'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

/** Rótulo de exibição de cada categoria. */
export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  tutorial: 'Tutoriais',
  tela: 'Telas',
  chatbot: 'Chatbot',
  automacao: 'Automações',
  conceito: 'Conceitos',
};

/** Áreas usadas pelas entradas de categoria 'tela' — espelham as seções do menu lateral. */
export const SCREEN_AREAS = ['Operação', 'Marketing', 'Configuração', 'Equipe', 'Admin'] as const;
export type ScreenArea = (typeof SCREEN_AREAS)[number];

export interface FeatureHelpEntry {
  /**
   * Módulo que a tela documentada exige — mesmo nome usado pelo `ModuleGuard`
   * em App.tsx e pelo menu lateral. Só faz sentido em `category: 'tela'`.
   * Ausente = tela sem módulo (abre para qualquer sessão).
   */
  moduleName?: string;
  /**
   * Cargo mínimo para alcançar a tela, na mesma escala do `RoleGuard`
   * (`atendente` < `gestor` < `gerente` < `superadmin`). Ausente = sem
   * restrição de cargo. Só faz sentido em `category: 'tela'`.
   *
   * Isto NÃO é uma fonte de permissão: quem barra o acesso continua sendo o
   * guard da rota. Aqui serve para a página de Ajuda não oferecer leitura sobre
   * tela que o cargo não alcança.
   */
  minRole?: UserRole;
  title: string;
  /** Frase curta: o que a função faz. */
  whatItDoes: string;
  /** Passo-a-passo de configuração. */
  howToConfigure: string[];
  /** Exemplo concreto de uso. */
  example?: string;
  /** Dicas extras (opcional). */
  tips?: string[];
  /** Grupo a que a entrada pertence. */
  category?: HelpCategory;
  /**
   * Sub-agrupamento dentro da categoria. Para 'tela' use uma ScreenArea (seção
   * do menu). Para 'chatbot' use a categoria da paleta de blocos
   * (Início/Mensagens/Interação/Ações/Finalizar). Para 'automacao' use
   * Gatilhos/Ações/Condições.
   */
  area?: string;
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
    category: 'conceito',
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
    category: 'chatbot',
    area: 'Início',
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
    category: 'chatbot',
    area: 'Mensagens',
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
    category: 'chatbot',
    area: 'Mensagens',
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
    category: 'chatbot',
    area: 'Interação',
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
    category: 'chatbot',
    area: 'Interação',
  },
  transfer_agent: {
    title: 'Transferir para Atendente',
    whatItDoes: 'Encerra a automação do bot e passa a conversa para um atendente humano.',
    howToConfigure: [
      'Opcional: escreva uma mensagem de transição ("Aguarde, vou te transferir...").',
      'Escolha atribuir a qualquer atendente ou a um usuário específico.',
    ],
    example: 'Lead pede falar com humano → Transferir para Atendente.',
    category: 'chatbot',
    area: 'Ações',
  },
  set_variable: {
    title: 'Salvar Variável',
    whatItDoes: 'Cria ou atualiza uma variável com um valor fixo ou montado a partir de outras variáveis.',
    howToConfigure: [
      'Defina o nome da variável.',
      'Defina o valor (pode conter {variaveis}).',
    ],
    example: 'Salvar {saudacao} = "Olá {first_name}".',
    category: 'chatbot',
    area: 'Ações',
  },
  update_contact: {
    title: 'Atualizar Contato',
    whatItDoes: 'Grava um valor em um campo do contato (nome, e-mail, telefone ou tag).',
    howToConfigure: [
      'Escolha o campo do contato.',
      'Defina o valor (geralmente uma {variavel} coletada antes).',
    ],
    example: 'Campo "Nome" = {nome} → o contato passa a ter o nome informado.',
    category: 'chatbot',
    area: 'Ações',
  },
  move_funnel: {
    title: 'Mover no Funil',
    whatItDoes: 'Move o contato para uma etapa específica do funil de vendas.',
    howToConfigure: ['Escolha a etapa de destino do funil.'],
    example: 'Após qualificar o lead → mover para "Em negociação".',
    category: 'chatbot',
    area: 'Ações',
  },
  end_flow: {
    title: 'Encerrar Fluxo',
    whatItDoes: 'Finaliza o fluxo do chatbot e a sessão do lead.',
    howToConfigure: ['Opcional: mensagem de despedida.', 'Opcional: encerrar silenciosamente (sem mensagem).'],
    example: '"Obrigado pelo contato! Até logo 👋"',
    category: 'chatbot',
    area: 'Finalizar',
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
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:contact_created': {
    title: 'Gatilho: Novo Contato',
    whatItDoes: 'Inicia a automação quando um novo contato é criado.',
    howToConfigure: ['Opcional: filtre pela fonte do contato (whatsapp, site, manual).'],
    example: 'Novo contato do WhatsApp → enviar mensagem de boas-vindas.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:funnel_stage_changed': {
    title: 'Gatilho: Mudança de Estágio',
    whatItDoes: 'Inicia a automação quando o contato muda de etapa no funil.',
    howToConfigure: ['Opcional: filtre o estágio de origem e/ou de destino.'],
    example: 'Mudou para "Em negociação" → agendar follow-up em 24h.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:scheduled_time': {
    title: 'Gatilho: Horário Agendado',
    whatItDoes: 'Inicia a automação em horários definidos (diário, semanal, mensal).',
    howToConfigure: ['Escolha a periodicidade.', 'Defina o horário.'],
    example: 'Todo dia às 9h → enviar lembrete.',
    category: 'automacao',
    area: 'Gatilhos',
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
    category: 'automacao',
    area: 'Gatilhos',
  },

  // -------------------------------------------------------- Automações: ações
  'action:send_message': {
    title: 'Ação: Enviar Mensagem',
    whatItDoes:
      'Envia uma mensagem de WhatsApp para o contato: ou uma resposta rápida da Loja, ou um texto escrito na própria etapa.',
    howToConfigure: [
      'Escolha uma resposta rápida da Loja — as mesmas que o atendente usa no botão de raio da conversa.',
      'Ou deixe o campo em branco e escreva a mensagem personalizada logo abaixo.',
      'Use {variavel} para personalizar (ex.: "Olá {first_name}").',
    ],
    example: '"Recebemos seus dados, {first_name}! Em breve entramos em contato."',
    tips: [
      'Preencher os dois campos não soma: a resposta rápida vence e a mensagem personalizada é ignorada.',
      'Editar a resposta rápida em Configurações muda o que esta automação envia da próxima vez — a etapa guarda a referência, não uma cópia do texto.',
      'Isto NÃO é o template aprovado na Meta. Para falar com quem está fora da janela de 24 horas em número oficial, o caminho é o template aprovado, na tela Templates.',
    ],
    category: 'automacao',
    area: 'Ações',
  },
  'action:change_funnel_stage': {
    title: 'Ação: Alterar Estágio',
    whatItDoes: 'Move o contato para outra etapa do funil.',
    howToConfigure: ['Escolha o novo estágio.'],
    example: 'Após resposta positiva → mover para "Qualificado".',
    category: 'automacao',
    area: 'Ações',
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
    category: 'automacao',
    area: 'Ações',
  },
  'action:add_tag': {
    title: 'Ação: Adicionar Tag',
    whatItDoes: 'Aplica uma etiqueta (tag) ao contato — útil para segmentar.',
    howToConfigure: ['Informe o nome da tag (pode conter {variaveis}).'],
    example: 'Adicionar tag "lead-quente".',
    category: 'automacao',
    area: 'Ações',
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
    category: 'automacao',
    area: 'Ações',
  },
  'action:delay': {
    title: 'Ação: Aguardar',
    whatItDoes: 'Adiciona uma pausa antes da próxima ação.',
    howToConfigure: ['Escolha a unidade (minutos, horas, dias) e o valor.'],
    example: 'Aguardar 2 horas antes de enviar a próxima mensagem.',
    category: 'automacao',
    area: 'Ações',
  },

  // ---------------------------------------------------- Automações: condições
  'condition:contact_has_tag': {
    title: 'Condição: Contato tem Tag',
    whatItDoes: 'Continua o fluxo apenas se o contato tiver a tag indicada.',
    howToConfigure: ['Informe o nome da tag.'],
    example: 'Só envia a oferta se o contato tiver a tag "cliente".',
    category: 'automacao',
    area: 'Condições',
  },
  'condition:contact_in_stage': {
    title: 'Condição: Contato no Estágio',
    whatItDoes: 'Continua o fluxo apenas se o contato estiver no estágio indicado do funil.',
    howToConfigure: ['Escolha o estágio.'],
    example: 'Só agenda follow-up se estiver em "Em negociação".',
    category: 'automacao',
    area: 'Condições',
  },
  'condition:message_contains': {
    title: 'Condição: Mensagem Contém',
    whatItDoes: 'Continua o fluxo apenas se a mensagem contiver as palavras indicadas.',
    howToConfigure: ['Informe as palavras-chave.', 'Opcional: marque "sensível a maiúsculas".'],
    example: 'Só responde se a mensagem contiver "orçamento".',
    category: 'automacao',
    area: 'Condições',
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
    category: 'automacao',
    area: 'Condições',
  },

  // ===========================================================================
  // Telas do dashboard
  // A ordem de declaração define a ordem do índice da página de Ajuda: mantenha
  // as áreas na mesma sequência do menu lateral (Operação → Marketing →
  // Configuração → Equipe → Admin).
  // ===========================================================================

  // ------------------------------------------------------- Telas: Operação
  'page:dashboard': {
    title: 'Dashboard',
    whatItDoes:
      'É a primeira parada do dia: mostra se o atendimento está saudável e o que precisa de ação agora. Todos os números obedecem ao período escolhido no topo — trocar de 7 para 30 dias muda cartões e gráficos de uma vez.',
    howToConfigure: [
      'Escolha o período no topo (Hoje, 7 dias, 30 dias ou uma faixa personalizada). O resto da tela segue essa escolha.',
      'Comece pelo painel "Precisa de Atenção" — é onde estão as conversas e os leads parados.',
      'Clique em um cartão de métrica para ir direto à tela correspondente (Conversas, Contatos, Funil).',
      'Abra "Análise detalhada" no fim da página para ver origem dos leads e desempenho das automações.',
    ],
    example:
      'Você abre o dia em "7 dias", vê a Taxa de Conversão cair de 12% para 7% e o painel de atenção apontando conversas sem resposta há horas. Distribuir essas conversas passa a ser a primeira tarefa.',
    tips: [
      'Em imobiliária, o Tempo Médio de Resposta é a métrica que mais move venda: o lead de portal fala com três corretores e fecha com quem responde primeiro.',
      'A tela se atualiza sozinha a cada 30 segundos — não precisa recarregar.',
      'Como Gerente ou Superadmin você troca a Conta em foco pelo seletor do topo. Como Gestor ou Atendente, você vê sempre a sua Loja.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:conversations': {
    moduleName: 'conversations',
    title: 'Conversas',
    whatItDoes:
      'É a caixa de entrada do time: onde você responde, assume e encerra atendimentos. A lista é ordenada pela última mensagem, então o que chegou por último sobe — e o que ninguém respondeu fica marcado.',
    howToConfigure: [
      'Escolha uma conversa na lista da esquerda para abrir o histórico à direita.',
      'Use a busca por nome ou número em vez de rolar a lista inteira.',
      'Para reaproveitar um trecho pronto, clique no raio ao lado do campo de mensagem — ou digite "/" com o campo vazio, que abre a mesma lista.',
      'Para guardar um trecho que você acabou de escrever, passe o mouse sobre a mensagem enviada e clique no raio que aparece nela.',
      'Use as pílulas acima da lista ("Não lidas", "Aguardando"...) para trabalhar uma fila de cada vez; o número em cada uma diz o tamanho dela.',
      'Ative a sinalização de conversas não respondidas em Configurações › Atendimento para que os atrasos apareçam marcados aqui.',
      'Se um chatbot estiver conduzindo a conversa, encerre a sessão dele antes de assumir — assim vocês não respondem o cliente ao mesmo tempo.',
    ],
    example:
      'Chega "ainda está disponível o apartamento do anúncio?". Você responde em minutos e o contato já entra na base com nome e telefone, pronto para acompanhar no Funil.',
    tips: [
      'O agrupamento por nível de atendimento é opcional e só classifica as conversas já carregadas na tela — role a lista para incluir as mais antigas.',
      'No número da pílula, "12" é o total da fila e "12+" quer dizer "pelo menos 12": as pílulas "Todas", "Não lidas" e "Arquivadas" sabem o total; "Aguardando", "Não respondidas" e "Em atendimento" contam só o que já foi carregado, e o "+" some quando você rola até o fim.',
      'A lista se atualiza sozinha a cada poucos segundos, então numa fila filtrada entram conversas que estavam fora da tela conforme você trabalha. Acompanhe o número da pílula: é ele que mostra a fila diminuindo.',
      'Dá para silenciar o aviso de atraso de uma conversa específica quando a demora é justificada, sem tirá-la da lista.',
      'Conversas é privada por Loja: mesmo o Superadmin não enxerga as conversas de uma Conta sem entrar nela pelo seletor do topo.',
      'A resposta rápida entra no campo com as variáveis já trocadas pelos dados de quem está na conversa, e só sai quando você clica em enviar — dá para ajustar antes.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:contacts': {
    moduleName: 'contacts',
    title: 'Contatos',
    whatItDoes:
      'É o cadastro por trás de toda conversa. Quem o chatbot capturou, quem veio de campanha e quem você cadastrou à mão ficam todos aqui — e é desta base que campanhas e automações escolhem para quem falar.',
    howToConfigure: [
      'Não precisa cadastrar nada para começar: o contato é criado sozinho na primeira mensagem recebida.',
      'Complete nome e e-mail e aplique tags — tag é o que você vai usar depois para segmentar campanha.',
      'Se você já tem uma base antiga, traga esses contatos antes de montar campanhas, para a segmentação nascer completa.',
    ],
    example:
      'Você marca com a tag "interesse-cobertura" quem pediu alto padrão. Quando entra um lançamento nesse perfil, a campanha vai só para essa tag em vez de ir para a base toda.',
    tips: [
      'Campos personalizados são preenchidos automaticamente pelo chatbot quando você usa "Salvar resposta como variável" — não precisa criar o campo antes.',
      'Padronize a tag em minúscula e sem acento ("lead-quente"): fica muito mais fácil de acertar na hora de segmentar.',
      'Contato sem tag nenhuma é contato que nunca vai entrar numa campanha segmentada.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:funnel': {
    moduleName: 'funnel',
    title: 'Funil de Vendas',
    whatItDoes:
      'É onde a venda tem etapa e responsável. Cada card é um lead numa etapa, e mover o card é o que registra que a negociação andou — o chatbot e as automações também movem cards sozinhos.',
    howToConfigure: [
      'Ajuste as etapas para o seu processo real antes de usar. Etapa genérica não informa nada; "Visita agendada" informa.',
      'Arraste o card do lead para a etapa nova conforme a negociação evolui.',
      'Para automatizar, use a ação "Alterar Estágio" nas Automações ou o nó "Mover no Funil" no chatbot.',
    ],
    example:
      'Etapas "Novo lead → Contato feito → Visita agendada → Proposta → Fechado". O chatbot qualifica e já joga o lead em "Contato feito"; o corretor move para "Visita agendada" quando marca a visita.',
    tips: [
      'Menos etapas funciona melhor: etapa que nunca recebe card só atrapalha a leitura.',
      'Mudar de etapa pode disparar automação — use o gatilho "Mudança de Estágio" para agendar o follow-up no instante em que o lead avança.',
      'Funil faz parte dos módulos pagos: se a assinatura da Conta vencer, esta tela deixa de abrir.',
    ],
    category: 'tela',
    area: 'Operação',
  },

  // ------------------------------------------------------- Telas: Marketing
  'page:tracking': {
    moduleName: 'tracking',
    title: 'Rastreamento de Leads',
    whatItDoes:
      'Responde de onde o lead veio. Quem clica em "Enviar mensagem" num anúncio do Facebook ou do Instagram chega já identificado: a tela mostra qual anúncio trouxe cada pessoa, sem link encurtado e sem você configurar nada.',
    howToConfigure: [
      'Não há o que configurar para anúncios: a origem chega junto com a primeira mensagem e o anúncio vira uma fonte sozinho.',
      'Abra a aba Dashboard e escolha o período — os números são só dos leads que chegaram nesse intervalo.',
      'Use a aba Fontes para ver quantos leads cada anúncio trouxe, e para cadastrar à mão uma origem que você controla por fora (link na bio, portal, indicação).',
      'A aba Análises abre os mesmos leads por dia, por fonte e por etapa do funil.',
    ],
    example:
      'Dois criativos do mesmo consultório rodando juntos. Em dois meses um trouxe 21 leads e o outro 3 — e o orçamento vai para o primeiro sem ninguém precisar contar conversa a conversa.',
    tips: [
      'A identificação automática vale para a conexão oficial da Meta. Número conectado por QR Code não recebe o dado do anúncio, e os leads dele ficam sem origem.',
      'Vale a primeira origem: se a pessoa voltar meses depois por outro anúncio, a fonte continua sendo a do primeiro contato. Origem escolhida à mão por você nunca é sobrescrita.',
      'A Meta reaproveita o mesmo código em criativos diferentes, então o nome da fonte termina com os últimos dígitos do anúncio — é o que separa dois criativos de mesmo título.',
      'A tela não sabe quanto você gastou: o valor investido não vem da Meta para cá. Ela responde "quantos leads cada anúncio trouxe", não "quanto custou cada lead".',
      'Os números são atualizados a cada 15 minutos. Um lead que acabou de chegar pode levar esse tempo para aparecer nos gráficos, mas já aparece na conversa.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:reports': {
    moduleName: 'reports',
    title: 'Relatórios',
    whatItDoes:
      'Serve para prestar contas a quem não abre o sistema — o dono da imobiliária, o diretor, o cliente da agência. Você monta o recorte uma vez em vez de remontar planilha todo mês.',
    howToConfigure: [
      'Escolha o período e o recorte: o relatório sai exatamente do que estiver selecionado.',
      'Gere uma vez e confira os números na tela.',
      'Para repassar sozinho toda semana, abra a aba Agendamentos e crie um agendamento: nome, frequência, horário e os e-mails que recebem.',
      'Acompanhe a aba Histórico depois do primeiro disparo — é lá que aparece se o envio saiu ou falhou.',
    ],
    example:
      'Relatório de segunda-feira com leads novos, conversas atendidas e negócios fechados por corretor, para o dono acompanhar a semana sem pedir print para ninguém.',
    tips: [
      'O envio agendado é por e-mail. Não há envio recorrente por WhatsApp: no agendamento você informa endereços de e-mail, não telefones.',
      'O horário é o de Brasília e o disparo acontece na janela dos 5 minutos seguintes — marcar 09:00 significa receber entre 09:00 e 09:05.',
      'O período segue a frequência: agendamento diário fala do último dia, semanal dos últimos 7 dias, mensal dos últimos 30.',
      'Antes de confiar em qualquer envio recorrente, faça um envio de teste para você mesmo.',
      'Relatório com número errado é pior que relatório nenhum: confira o recorte antes de programar o envio.',
      'Como Gerente, gere um relatório por Loja trocando a Conta em foco antes de gerar. O agendamento também é por Conta: cada Loja tem os seus.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:chatbots': {
    moduleName: 'chatbots',
    title: 'Chatbots',
    whatItDoes:
      'Aqui você administra os bots: quais existem, qual está no ar e em qual número. O desenho do fluxo é feito no construtor — esta lista é quem coloca o bot em produção.',
    howToConfigure: [
      'Crie o chatbot e escolha a instância de WhatsApp em que ele vai responder.',
      'Defina o gatilho — o que faz o bot entrar na conversa.',
      'Abra o construtor, monte o fluxo e publique. Bot salvo não é bot publicado.',
      'Se houver mais de um bot no mesmo número, ajuste a prioridade para decidir quem responde primeiro.',
    ],
    example:
      '"Triagem de plantão" atende toda primeira mensagem, pergunta o bairro de interesse e transfere para o corretor de plantão. Fica publicado no número da imobiliária, com prioridade 1.',
    tips: [
      'Publicar valida o fluxo: se faltar ligação entre blocos ou campo obrigatório, o sistema recusa e mostra o que corrigir.',
      'Para parar de atender por um período, desative o bot em vez de apagar — apagar leva o fluxo junto.',
      'Bot sem instância vinculada não responde ninguém, mesmo publicado.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:chatbot-builder': {
    // Rota /dashboard/chatbots/:id/builder — mesmo ModuleGuard dos Chatbots.
    moduleName: 'chatbots',
    title: 'Construtor de Fluxo',
    whatItDoes:
      'É a tela onde o fluxo é desenhado. Você arrasta blocos da esquerda e liga a saída de um na entrada do outro: o caminho que as setas formam é exatamente o que o cliente vai viver na conversa.',
    howToConfigure: [
      'Arraste "Início do Fluxo" primeiro — só pode existir um por chatbot.',
      'Arraste os blocos seguintes e ligue as bolinhas, saída de um na entrada do próximo. Bloco solto não executa.',
      'Clique num bloco para configurar o conteúdo dele no painel da direita.',
      'Salvar guarda o rascunho; Publicar valida o fluxo inteiro e coloca no ar.',
    ],
    example:
      'Início → Enviar Texto ("Olá! Sou o assistente da imobiliária") → Fazer Pergunta ("Qual bairro você procura?", salvando em {bairro}) → Transferir para Atendente.',
    tips: [
      'Cada bloco tem o próprio botão de ajuda no painel da direita, com o passo-a-passo daquele bloco.',
      'Ctrl+Z desfaz e Ctrl+Y refaz. Delete apaga o bloco selecionado.',
      'Para remover uma ligação, use o × sobre a seta ou arraste a ponta dela para um espaço vazio.',
      'Teste o fluxo pelo seu próprio WhatsApp antes de deixar publicado: erro de texto só aparece na conversa real.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:campaigns': {
    moduleName: 'campaigns',
    title: 'Campanhas de Disparo',
    whatItDoes:
      'É o envio ativo: você fala com muita gente de uma vez, sem esperar o cliente escrever. É também a função com mais risco de bloqueio do número, então cuidar da lista e do texto faz parte do trabalho.',
    howToConfigure: [
      'Monte primeiro a segmentação: escolha por tag ou etapa do funil em vez de mandar para a base toda.',
      'Escreva a mensagem usando {first_name} para personalizar.',
      'Faça um teste com poucos contatos antes de liberar a lista inteira.',
      'Depois do disparo, acompanhe a entrega e as respostas na própria campanha.',
    ],
    example:
      'Lançamento na zona sul: campanha só para a tag "interesse-zona-sul", com "Oi {first_name}, saiu a planta do lançamento que você me pediu".',
    tips: [
      'Mensagem idêntica para milhares de números é o caminho mais rápido para o WhatsApp bloquear a linha. Personalize e envie em lotes.',
      'Quem nunca falou com você tende a denunciar como spam — priorize contatos que já conversaram.',
      'Lista grande num número recém-conectado é pedido de bloqueio. Deixe a linha amadurecer antes do primeiro disparo grande.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  // Sem moduleName e sem minRole de propósito: a rota /dashboard/templates não
  // tem ModuleGuard nem RoleGuard. Quem tem sessão alcança a tela, então a
  // página de Ajuda também tem de oferecer a leitura para todo cargo.
  'page:templates': {
    title: 'Templates',
    whatItDoes:
      'Mostra os modelos de mensagem que a Meta já aprovou para a sua conta. É a lista do que você pode disparar para quem está fora da janela de 24 horas — sem precisar abrir o Gerenciador da Meta para conferir.',
    howToConfigure: [
      'Confira o selo de cada modelo: só o que está "Aprovado" pode ser enviado. Pendente, Rejeitado, Pausado e Desativado aparecem para você saber por que aquele nome não funciona.',
      'Leia o corpo da mensagem. Os trechos destacados como {{1}} e {{2}} são as variáveis: você preenche cada uma na hora do envio, na ordem em que aparecem.',
      'Se a sua Loja tiver mais de uma conta do WhatsApp Business, escolha a conta no seletor do topo — os modelos são de cada conta, não de cada número.',
      'Use "Atualizar" depois de aprovar um modelo na Meta. A lista é buscada na hora, mas fica alguns minutos em memória.',
    ],
    example:
      'O cliente sumiu há três dias. Você abre esta tela, vê que "retorno_orcamento" está Aprovado com duas variáveis, e usa esse modelo na conversa para reabrir o atendimento.',
    tips: [
      'Modelos são criados e enviados para aprovação no WhatsApp Manager da Meta, não aqui. Esta tela é consulta: ela não cria, não edita e não exclui.',
      'Passadas 24 horas desde a última mensagem do cliente, o WhatsApp bloqueia texto livre. Só um modelo aprovado reabre a conversa — é para isso que eles existem.',
      'O mesmo nome aparece uma vez por idioma. Aqui eles vêm agrupados: o nome aparece uma vez só, com os idiomas dentro.',
      'Modelos existem apenas na API Oficial (Meta). Número conectado por QR Code não tem modelo — nele vale texto livre dentro da janela de 24 horas.',
      'Aprovação na Meta não é definitiva: ela pode pausar ou desativar um modelo depois, por qualidade. Por isso esta tela consulta a Meta na hora, em vez de guardar uma cópia que envelhece.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:followups': {
    moduleName: 'followups',
    title: 'Follow-ups',
    whatItDoes:
      'É o que impede o lead de esfriar por esquecimento. A maioria das vendas perdidas não foi para o concorrente — simplesmente ninguém voltou a falar com o cliente.',
    howToConfigure: [
      'Comece pelo que está atrasado; depois veja os pendentes.',
      'Crie uma sequência (cadência) para não depender da memória do time: contato imediato, 1 dia, 3 dias, 7 dias.',
      'Deixe as automações agendarem por você: a ação "Agendar Follow-up" cria a tarefa no momento em que o lead avança.',
    ],
    example:
      'Lead visitou o imóvel e sumiu: follow-up em 1 dia ("o que você achou?"), em 3 dias (condições de pagamento) e em 7 dias (um imóvel parecido).',
    tips: [
      'Quando o cliente responde, o sistema já para a sequência e cancela as mensagens agendadas dele — você não precisa limpar a lista na mão. O que ele cancela é ajustável em Configurações › Follow-ups.',
      'Tarefa manual é a exceção: por padrão ela sobrevive à resposta, porque foi você quem planejou aquele passo.',
      'Follow-up sem mensagem definida é só um lembrete para o corretor; com mensagem, vira envio.',
      'Cadência curta demais irrita e cadência longa demais perde a venda. Uma semana é o intervalo em que a maioria dos leads ainda lembra de você.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:automation': {
    moduleName: 'automation',
    title: 'Automação',
    whatItDoes:
      'Automação reage a eventos; chatbot conduz conversa. Aqui você diz "quando isso acontecer, faça aquilo" — sem diálogo e sem esperar o cliente escolher opção. É o que trabalha nos bastidores.',
    howToConfigure: [
      'Escolha o gatilho: o evento que inicia tudo (mensagem recebida, novo contato, mudança de etapa, variável capturada, horário).',
      'Adicione as ações na ordem em que devem acontecer.',
      'Use condições para o fluxo parar quando não fizer sentido continuar.',
      'Ative o fluxo. Fluxo criado e desativado não roda.',
    ],
    example:
      'Gatilho "Mudança de Estágio" para "Visita agendada" → ação "Agendar Follow-up" em 24h com "Confirmando sua visita amanhã, {first_name}?" → ação "Adicionar Tag" com "visita-marcada".',
    tips: [
      'Condição que não passa PARA o fluxo — ela não desvia para um caminho alternativo. Para ter dois caminhos, use o chatbot.',
      'Cada etapa tem o próprio botão de ajuda no painel de configuração.',
      'Comece com um fluxo curto e confira as execuções antes de montar algo longo: fluxo grande errado erra em silêncio.',
    ],
    category: 'tela',
    area: 'Marketing',
  },

  // ---------------------------------------------------- Telas: Configuração
  'page:whatsapp-numbers': {
    moduleName: 'whatsapp-numbers',
    title: 'Instâncias e APIs',
    whatItDoes:
      'É a base de tudo: sem um número conectado aqui, não existe conversa, campanha nem chatbot. Cada instância é uma linha de WhatsApp ligada ao sistema.',
    howToConfigure: [
      'Crie a instância e escolha o provedor.',
      'Conecte lendo o QR Code no celular que tem o número, ou use o código de pareamento se preferir não escanear.',
      'Confirme que o status ficou "Conectado" antes de configurar chatbot ou campanha.',
      'Confira o webhook, que é o que faz as mensagens chegarem em tempo real. Na API Oficial ele é configurado uma única vez para a instalação inteira, não a cada número.',
    ],
    example:
      'A imobiliária liga o número do plantão como uma instância e o do comercial como outra. O chatbot de triagem fica publicado só no número do plantão.',
    tips: [
      'Instâncias pertencem à Conta. Como Superadmin você não tem instâncias próprias — gerencie pela Administração, entrando na Conta desejada.',
      'Linha desconectada é atendimento parado: mensagem que chega com a instância fora pode não entrar no sistema. Reconecte assim que ver "Desconectado".',
      'Usar o mesmo número no WhatsApp do celular e aqui ao mesmo tempo pode derrubar a sessão.',
      'Na API Oficial, o Verify Token que a Meta valida não é pedido no formulário: é um token único da instalação, guardado como secret no Supabase e configurado uma vez por quem opera a plataforma. Ao conectar um número, você só informa Phone Number ID, WABA ID e Access Token.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings': {
    title: 'Configurações',
    whatItDoes:
      'Reúne o que vale só para você e o que vale para a Loja inteira. A diferença importa: Perfil, Notificações e Segurança são seus; Atendimento, Follow-ups e Integrações mudam o comportamento para todo o time.',
    howToConfigure: [
      'Escolha a aba. Cada aba tem o próprio botão de ajuda com o passo-a-passo dela.',
      'Antes de salvar algo em Atendimento, Follow-ups ou Integrações, lembre que a mudança atinge o time todo.',
      'Depois de salvar, confira na tela afetada: preferência de atendimento aparece nas Conversas, webhook aparece no sistema de destino.',
    ],
    example:
      'Você ativa a sinalização de conversas não respondidas em Atendimento e, a partir daí, todo o time passa a ver o aviso de atraso na tela de Conversas.',
    tips: [
      'A aba escolhida fica na URL, então você pode salvar o link direto (ex.: /dashboard/settings?tab=integrations).',
      'Trocar senha é em Segurança. Dar ou tirar acesso de outra pessoa é em Equipe, não aqui.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-profile': {
    title: 'Configurações › Perfil',
    whatItDoes:
      'São seus dados como usuário — é o nome que o resto do time vê quando uma conversa é transferida e o que aparece nos relatórios por pessoa. Não é o nome da Loja.',
    howToConfigure: [
      'Preencha nome e sobrenome: é assim que você aparece para o time.',
      'Confira o telefone, usado para te identificar e para avisos.',
      'Salve para aplicar.',
    ],
    example:
      'A corretora preenche "Ana Ribeiro" e a foto. Nas conversas transferidas o time passa a ver quem está atendendo, em vez de um e-mail solto.',
    tips: [
      'Perfil em branco atrapalha relatório por pessoa: fica impossível saber quem atendeu o quê.',
      'Trocar senha é na aba Segurança, não aqui.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-attendance': {
    title: 'Configurações › Atendimento',
    whatItDoes:
      'Define a partir de quanto tempo uma conversa passa a contar como atrasada. É a régua de atendimento da Loja: com ela ligada, a tela de Conversas começa a marcar o que ficou sem resposta.',
    howToConfigure: [
      'Ative a sinalização — ela vem desligada de propósito.',
      'Defina o prazo aceitável para a primeira resposta.',
      'Abra as Conversas e confira: o que passou do prazo aparece marcado.',
    ],
    example:
      'Prazo de 15 minutos. O corretor que deixou um lead de portal esperando 40 minutos aparece marcado na lista antes de o cliente procurar outro anúncio.',
    tips: [
      'A configuração vale para a Loja inteira, não só para você.',
      'Vem desligada por escolha: ligue quando o time já souber que o aviso vai aparecer, para não parecer cobrança de surpresa.',
      'Dá para silenciar o aviso de uma conversa específica quando a demora é justificada.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-quick-replies': {
    title: 'Configurações › Respostas rápidas',
    whatItDoes:
      'Guarda os trechos que o time repete o dia inteiro — saudação, horário de funcionamento, dados para pagamento — para o atendente inserir com dois cliques em vez de redigitar. A biblioteca é da Loja: qualquer cargo cria, edita e apaga.',
    howToConfigure: [
      'Clique em "Nova resposta" e dê um nome curto — é por ele que você encontra o trecho na busca.',
      'Escreva a mensagem e troque o que muda de pessoa para pessoa por {first_name}, {name}, {phone} ou {date}.',
      'Abra uma conversa e teste: clique no raio ao lado do campo de mensagem, ou digite "/" com o campo vazio.',
      'Para transformar algo que você acabou de mandar em resposta rápida, passe o mouse sobre a mensagem enviada e clique no raio dela.',
    ],
    example:
      '"Horário" com o texto "Olá {first_name}! Atendemos de segunda a sexta, das 9h às 18h." Na conversa com a Camila, o campo já aparece escrito "Olá Camila!" — e você ainda pode ajustar antes de enviar.',
    tips: [
      'A escrita de variável é a mesma do chatbot e das automações: chave simples, {first_name}. O que o sistema não reconhecer fica na mensagem do jeito que você escreveu.',
      'A lista mostra quem criou e quem editou por último. Como todo cargo pode mexer, é assim que o time sabe a quem perguntar antes de mudar um texto.',
      'Apagar pede confirmação e vale para a Loja inteira — não dá para desfazer.',
      'Dois trechos não podem ter o mesmo nome na mesma Loja: numa lista onde se escolhe pelo nome, o repetido só atrapalha.',
      'As automações também usam esta lista: a ação "Enviar Mensagem" escolhe uma resposta rápida daqui.',
      'Não confunda com a tela Templates, que mostra os modelos aprovados na Meta. Aquilo é exigência da Meta para falar fora da janela de 24 horas; isto aqui é só atalho de digitação e vale para qualquer conversa aberta.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-followups': {
    title: 'Configurações › Follow-ups',
    whatItDoes:
      'Decide o que o sistema desmarca sozinho quando o cliente responde. Sem isso, quem já respondeu continua recebendo a cobrança automática marcada dias antes — e percebe que estava falando com uma agenda, não com você.',
    howToConfigure: [
      'Deixe "Cancelar mensagens agendadas" ligado: é o que evita o envio automático depois da resposta.',
      'Decida sobre "Cancelar tarefas manuais". Ligado, a resposta apaga os lembretes que o time criou; desligado, quem criou decide o que fazer.',
      'Salve e teste com um contato real: responda de outro celular e confira se o follow-up agendado saiu da lista.',
    ],
    example:
      'A corretora agenda "posso mandar as condições?" para sexta. O cliente responde na quarta. Com a opção ligada, o envio de sexta é cancelado e a conversa segue no tom que o cliente começou.',
    tips: [
      'As duas opções valem para a Loja inteira, não só para você.',
      'Tarefa manual é trabalho que uma pessoa planejou — por isso o padrão é NÃO apagar. Ligue só se o seu time preferir a lista sempre limpa.',
      'Sequências não obedecem a esta tela: cada sequência tem a própria trava, em Follow-ups › Sequências.',
      'Uma tarefa que fazia parte de uma sequência interrompida é encerrada junto, independente das opções aqui — ela ficou sem cadência a que servir.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-subscription': {
    // Quem responde pela cobranca e a CONTA, e a Conta e do Gerente. A aba
    // exige a capacidade billing.view, verdadeira so para gerente/superadmin
    // (ver src/pages/Settings.tsx). Gestor e Atendente nao a enxergam.
    minRole: 'gerente',
    title: 'Configurações › Assinatura',
    whatItDoes:
      'É onde você vê e resolve o pagamento da Conta. Quem assina é a Conta, nunca a Loja: um único plano paga a Conta inteira, e todas as Lojas dela funcionam por causa dele. É a explicação mais comum para "o sistema não abre".',
    howToConfigure: [
      'Confira o plano atual e a situação do pagamento.',
      'Para assinar ou atualizar a forma de pagamento, siga para o checkout.',
      'Depois de pagar, recarregue a página e confirme que o sistema abriu.',
    ],
    example:
      'A Conta fica sem pagamento e todo mundo — você inclusive — passa a ver a tela "Acesso bloqueado" no lugar do sistema. Regularizado o pagamento da Conta, todas as Lojas voltam juntas: não é preciso liberar uma por uma.',
    tips: [
      'Você também é bloqueado quando a Conta não está paga. Mas a tela de bloqueio traz o preço e o botão de assinar — dá para resolver de lá, sem precisar chegar até esta aba e sem depender de ninguém.',
      'Na tela de bloqueio há um "Já paguei — reconferir acesso": use depois de pagar em outra aba ou quando o suporte liberar seu acesso na mão, em vez de sair e entrar de novo.',
      'A Loja não tem assinatura própria: ela herda o acesso da Conta. Se uma Loja está bloqueada, o que resolve é o pagamento da Conta.',
      'Liberação manual concedida pelo Superadmin também abre o sistema, sem assinatura ativa — e vale para a Conta inteira.',
      'Esta aba é só do Gerente: quem assina é a Conta, e Gestor e Atendente pertencem a uma Loja, que não contrata nada. Bloqueados, eles veem a tela sem preço e sem botão, com o recado de falar com você — não adianta pedir que "assinem por lá".',
      'Lojas adicionais são contratadas aqui, e o jeito muda conforme o momento: antes de assinar elas entram junto no checkout; depois de assinar, elas são somadas à assinatura que já existe e a diferença cai na próxima fatura, proporcional ao que falta do mês.',
      'Não dá para reduzir as Lojas abaixo do que você já usa. Exclua a Loja primeiro, depois reduza a vaga.',
      'Se o sistema não abre para todo o time ao mesmo tempo, o problema é aqui — não é permissão de usuário.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-notifications': {
    title: 'Configurações › Notificações',
    whatItDoes:
      'Escolhe sobre o que o sistema te avisa. É preferência sua, por usuário: desligar aqui não desliga para o resto do time.',
    howToConfigure: [
      'Ligue ou desligue por tipo: novas mensagens, follow-ups, campanhas.',
      'Salve.',
      'Os avisos passam a aparecer no sino do topo e na tela de Notificações.',
    ],
    example:
      'O corretor desliga aviso de campanha e mantém novas mensagens: assim só é interrompido quando um cliente realmente escreve.',
    tips: [
      'É por usuário: cada pessoa do time configura o seu.',
      'Desligar tudo é tentador e custa venda — mantenha ao menos o aviso de novas mensagens.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-security': {
    title: 'Configurações › Segurança',
    whatItDoes:
      'Troca a senha da sua conta de acesso. Só isso: quem vê o quê é definido pelo cargo, em Equipe.',
    howToConfigure: [
      'Informe a senha atual.',
      'Escreva a nova senha duas vezes.',
      'Salve para aplicar.',
    ],
    example:
      'Você compartilhou a senha para alguém resolver algo no sistema. Troque logo depois, em vez de deixar o acesso circulando.',
    tips: [
      'Senha longa protege mais que senha complicada.',
      'Para remover o acesso de quem saiu do time, vá em Equipe — trocar a sua senha não afeta o login das outras pessoas.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-integrations': {
    title: 'Configurações › Integrações',
    whatItDoes:
      'Manda os eventos do ConvoFlow para fora — seu ERP, uma planilha, o n8n. Em vez de alguém copiar lead na mão, o sistema avisa o outro sistema no instante em que o evento acontece.',
    howToConfigure: [
      'Cadastre o webhook com um nome e a URL que vai receber as chamadas.',
      'Escolha só os eventos que interessam. Marcar todos gera ruído no destino.',
      'Defina um secret — é ele que permite ao outro lado confirmar que a chamada veio mesmo daqui.',
      'Ative e provoque o evento uma vez para conferir que chegou.',
    ],
    example:
      'O evento de novo contato vai para o n8n, que cadastra o lead no sistema da construtora e avisa o corretor de plantão por e-mail.',
    tips: [
      'Sem secret, qualquer um que descobrir a URL pode se passar pelo ConvoFlow. Use secret sempre que o destino aceitar.',
      'URL que responde erro é tentada de novo por um tempo; URL errada só acumula tentativa.',
      'Isto é saída de dados. Receber mensagem do WhatsApp é a outra ponta, em Instâncias e APIs.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:notifications': {
    title: 'Notificações',
    whatItDoes:
      'É a lista completa dos avisos, não só os últimos que aparecem no sino. Serve para recuperar o que passou enquanto você estava em outra coisa.',
    howToConfigure: [
      'Clique no aviso para ir direto ao que o originou.',
      'Use "Marcar todas como lidas" quando a lista virar ruído.',
      'Para receber menos, ajuste os tipos em Configurações › Notificações.',
    ],
    example:
      'Você volta do almoço com 12 avisos, marca todos como lidos e vai direto às Conversas, que é onde o cliente está esperando.',
    tips: [
      'Os avisos são seus: marcar como lido não muda nada para o resto do time.',
      'Aviso lido não resolve o atendimento — a conversa sem resposta continua na tela de Conversas.',
    ],
    category: 'tela',
    area: 'Configuração',
  },

  // ---------------------------------------------------------- Telas: Equipe
  'page:team': {
    // 'gestor', nao 'gerente': desde 2026-08-18 a rota /dashboard/team tambem
    // abre para o Gestor, que administra a equipe da propria Loja.
    minRole: 'gestor',
    title: 'Equipe',
    whatItDoes:
      'É onde a Conta ganha Lojas e as Lojas ganham gente. Como Gerente, você cria a Loja aqui e convida quem vai trabalhar nela; como Gestor, você convida os Atendentes da sua Loja. Convidar por aqui é o único jeito de alguém entrar no ConvoFlow — não existe cadastro público.',
    howToConfigure: [
      'Como Gerente, crie a Loja em "Nova Loja" antes de convidar: Gestor e Atendente sempre pertencem a uma.',
      'Confira o contador ao lado do botão ("2 de 5 lojas") — é quanto do seu plano já foi usado.',
      'Use "Abrir" na lista de Lojas para colocar uma delas em foco e trabalhar dentro dela.',
      'Convide a pessoa pelo e-mail dela.',
      'Escolha o cargo: ele define o que a pessoa vê e o que pode fazer.',
      'Quem sai do time deve ter o acesso removido no mesmo dia.',
    ],
    example:
      'Você abre a segunda unidade: cria a Loja "Filial Norte", convida um Gestor para ela e depois os corretores como Atendentes — cada um com o login próprio, em vez de todos usarem o mesmo acesso.',
    tips: [
      'Os cargos vão de Atendente (atende) a Gestor (administra a Loja) e Gerente (administra várias Lojas).',
      'Loja nova já nasce com acesso: ela herda o da sua Conta. Quem você convidar entra direto, sem precisar de liberação separada para cada Loja.',
      'A coluna "Loja" diz onde cada pessoa trabalha, e "Ver detalhes" no menu de Ações abre o resto: telefone, último acesso e o que o cargo dela alcança.',
      'O link do convite vale por um acesso só. Quem perdeu o prazo, ou esqueceu a senha, resolve sozinho pelo "Esqueci minha senha" da tela de login — você também pode disparar pelo "Redefinir senha" no menu de Ações.',
      'O plano Gerente inclui 5 Lojas. Quando elas acabam, "Nova Loja" fica cinza e o motivo aparece ao passar o mouse — Lojas adicionais são contratadas em Configurações › Assinatura.',
      'Cada Loja aceita no máximo 1 Gestor e até 5 Atendentes.',
      'Como Gerente esta tela mostra as Lojas da sua Conta e as pessoas delas; como Gestor, mostra as pessoas da sua Loja e o convite já entra nela — você não escolhe Loja, porque só tem a sua.',
      'Login compartilhado quebra relatório por pessoa e apaga o histórico de quem atendeu o quê.',
    ],
    category: 'tela',
    area: 'Equipe',
  },
  'page:store-comparison': {
    minRole: 'gerente',
    title: 'Comparar Lojas',
    whatItDoes:
      'Coloca as Lojas da sua Conta na mesma tabela para você achar a que está fora da curva. É a tela de quem responde por mais de uma operação e precisa decidir onde entrar primeiro.',
    howToConfigure: [
      'Leia a coluna que importa no seu momento: contatos (entrada), conversas (atendimento) ou mensagens (volume).',
      'Procure a loja com muitos contatos e poucas conversas — é onde tem lead entrando e ninguém atendendo.',
      'Entre nessa loja pelo seletor de Conta do topo para investigar o caso.',
    ],
    example:
      'Duas lojas com 300 contatos no mês: a primeira teve 280 conversas e a segunda 90. O problema da segunda é atendimento, não geração de lead.',
    tips: [
      'Muitas mensagens com poucas conversas costuma ser campanha disparando sem ninguém responder as respostas.',
      'A tela é do Gerente. Gestor e Atendente enxergam apenas a própria Loja.',
    ],
    category: 'tela',
    area: 'Equipe',
  },

  // ----------------------------------------------------------- Telas: Admin
  'page:admin': {
    minRole: 'superadmin',
    title: 'Administração',
    whatItDoes:
      'É a visão global do ConvoFlow: todas as Contas, quem está pagando e quem está liberado na mão. É o único lugar onde se abre acesso sem passar pelo pagamento.',
    howToConfigure: [
      'Ache a Conta pela busca.',
      'Confira a situação de acesso antes de mexer: assinatura paga e liberação manual são coisas diferentes.',
      'Para liberar sem pagamento, use a liberação manual — ela fica registrada com data e autor.',
    ],
    example:
      'O cliente fecha contrato na sexta e o pagamento só cai na terça. Você libera manualmente para ele começar a usar e revoga se o pagamento não vier.',
    tips: [
      'Liberação manual é auditada: fica gravado quem liberou e quando.',
      'Superadmin não tem Loja própria. Para ver Conversas ou Funil de um cliente, troque a Conta em foco no seletor do topo.',
      'Revogar acesso fecha o sistema na hora para todo o time daquela Conta — o Gerente incluído. Ele não fica de fora do bloqueio: vê a tela de "Acesso bloqueado" com o botão de assinar, e resolve sozinho pelo cartão se quiser.',
      'O bloqueio não alcança o superadmin. Você continua entrando em qualquer Conta, inclusive nas que acabou de revogar.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-users': {
    minRole: 'superadmin',
    title: 'Gestão de Usuários',
    whatItDoes:
      'É a lista de todo mundo no sistema, de todas as Contas — não só do seu time. Serve para achar um usuário quando você só tem o e-mail e não sabe de qual Loja ele é.',
    howToConfigure: [
      'Busque pelo e-mail ou pelo nome.',
      'Confira o cargo e a Conta a que a pessoa pertence antes de mudar qualquer coisa.',
      'Para convidar alguém, use o convite indicando o cargo e a Conta.',
    ],
    example:
      'Chega um "não consigo entrar". Você busca o e-mail e vê que a Conta da pessoa está com acesso vencido: o problema é cobrança, não senha.',
    tips: [
      'Cargo errado é a causa mais comum de "essa tela não abre para mim". Confira aqui antes de investigar permissão.',
      'Convite é a única porta de entrada: não existe auto-cadastro no ConvoFlow.',
      'Mudar o cargo de alguém muda o que ela vê na hora — avise a pessoa antes.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-usage-limits': {
    minRole: 'superadmin',
    title: 'Limites de uso por nível',
    whatItDoes:
      'Define o teto de uso de cada nível da hierarquia — quantas instâncias, contatos ou disparos cada cargo pode ter. É prevenção: evita que uma Conta consuma a estrutura das outras.',
    howToConfigure: [
      'Escolha o nível da hierarquia que quer limitar.',
      'Preencha o limite. Campo vazio significa sem limite, não zero.',
      'Salve e confira com uma Conta real antes de considerar a regra aplicada.',
    ],
    example:
      'Gestor limitado a 2 instâncias de WhatsApp e Gerente a 10: a loja não liga números novos sem falar com você, e a agência ainda consegue atender o grupo dela.',
    tips: [
      'Vazio é ilimitado — apagar o campo libera em vez de bloquear. É o erro mais comum nesta tela.',
      'Para o usuário, limite atingido aparece como erro na hora de criar. Avise o time antes de reduzir um limite.',
    ],
    category: 'tela',
    area: 'Admin',
  },
};

/** Retorna o conteúdo de ajuda de uma chave, ou null se não houver. */
export function getFeatureHelp(key: string | null | undefined): FeatureHelpEntry | null {
  if (!key) return null;
  return FEATURE_HELP[key] ?? null;
}

/**
 * Achata o texto para busca: sem acento, sem caixa, sem espaço nas pontas.
 * O conteúdo é todo em pt-BR, então quem digita "automacao" tem de achar
 * "Automação".
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Motor de busca da ajuda: os pedaços de texto casam com a consulta?
 *
 * Ignora acento e caixa, e exige TODOS os termos (busca por "campanha tag" acha
 * quem fala das duas coisas). Busca vazia casa com tudo. Valores vazios ou
 * ausentes são descartados.
 *
 * É o único lugar que implementa a busca — as entradas de ajuda e os tutoriais
 * (src/lib/help/tutorials.ts) passam por aqui, cada um informando os próprios
 * campos pesquisáveis.
 */
export function matchesSearchTerms(
  parts: Array<string | null | undefined>,
  query: string,
): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(parts.filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

/** A entrada de ajuda casa com a busca? */
export function helpEntryMatches(entry: FeatureHelpEntry, query: string): boolean {
  return matchesSearchTerms(
    [
      entry.title,
      entry.whatItDoes,
      ...entry.howToConfigure,
      entry.example,
      ...(entry.tips ?? []),
    ],
    query,
  );
}

/** Uma entrada acompanhada da própria chave. */
export interface FeatureHelpItem extends FeatureHelpEntry {
  key: string;
}

/** Entradas de uma categoria agrupadas por `area`. */
export interface FeatureHelpGroup {
  /** `area` das entradas, ou null quando elas não têm área definida. */
  area: string | null;
  entries: FeatureHelpItem[];
}

/** Todas as entradas, na ordem de declaração, já com a chave embutida. */
export function getHelpEntries(): FeatureHelpItem[] {
  return Object.entries(FEATURE_HELP).map(([key, entry]) => ({ key, ...entry }));
}

/** Todas as chaves existentes. */
export function getAllHelpKeys(): string[] {
  return Object.keys(FEATURE_HELP);
}

/**
 * Entradas de uma categoria, agrupadas por `area` e prontas para renderizar.
 *
 * A ordem dos grupos e das entradas dentro de cada grupo segue a ordem de
 * declaração em FEATURE_HELP — para as telas isso significa a ordem do menu
 * lateral. Quem consome não precisa interpretar prefixo de chave.
 */
export function getHelpByCategory(category: HelpCategory): FeatureHelpGroup[] {
  const groups: FeatureHelpGroup[] = [];
  const byArea = new Map<string | null, FeatureHelpGroup>();

  for (const item of getHelpEntries()) {
    if (item.category !== category) continue;
    const area = item.area ?? null;
    let group = byArea.get(area);
    if (!group) {
      group = { area, entries: [] };
      byArea.set(area, group);
      groups.push(group);
    }
    group.entries.push(item);
  }

  return groups;
}
