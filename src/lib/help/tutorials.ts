/**
 * Tutoriais passo-a-passo — o caminho guiado do produto.
 *
 * A diferença em relação a src/lib/help/featureHelp.ts: a ajuda contextual
 * explica UMA tela; um tutorial cumpre um OBJETIVO, e objetivo atravessa várias
 * telas. Por isso cada passo pode apontar para a rota (`screen`) e para a
 * documentação daquele ponto (`helpKey`).
 *
 * Regra de conteúdo: todo passo é uma AÇÃO que a pessoa executa. Se um passo não
 * tem verbo, ele é documentação — o lugar dele é numa entrada do featureHelp.
 *
 * O conteúdo aqui foi conferido contra o código (labels de botão, campos de
 * formulário e ordem real do fluxo). Ao mexer em qualquer um desses fluxos,
 * atualize o tutorial correspondente — ver CLAUDE.md.
 *
 * Acesso: `moduleName` e `minRole` seguem exatamente o mesmo padrão declarado
 * nas entradas de tela do featureHelp.ts e são consumidos pelo MESMO
 * useHelpVisibility. Não existe segunda fonte de permissão.
 */
import type { UserRole } from '@/types/userHierarchy';
import { matchesSearchTerms } from './featureHelp';

export interface TutorialStep {
  title: string;
  body: string;
  /** Rota do dashboard onde este passo acontece (renderizada como link). */
  screen?: string;
  /** Entrada de documentação relacionada, em FEATURE_HELP. */
  helpKey?: string;
  /** Ressalva ou pegadinha deste passo específico. */
  note?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  /** Uma frase: o que estará pronto no fim. */
  goal: string;
  /** Para quem o tutorial foi escrito, em pt-BR simples. */
  forWhom: string;
  steps: TutorialStep[];
  /** Cargo mínimo, mesma escala do RoleGuard. */
  minRole?: UserRole;
  /** Módulo exigido, mesmo nome do ModuleGuard. */
  moduleName?: string;
}

/** Prefixo das chaves de deep link (/dashboard/help#tutorial:conectar-whatsapp). */
export const TUTORIAL_KEY_PREFIX = 'tutorial:';

/** Chave de deep link de um tutorial. */
export const tutorialKey = (id: string) => `${TUTORIAL_KEY_PREFIX}${id}`;

/**
 * Ordem = ordem recomendada de leitura, não alfabética. Conectar o WhatsApp vem
 * primeiro porque nada funciona antes disso.
 */
export const TUTORIALS: Tutorial[] = [
  // ------------------------------------------------------------------ 1
  {
    id: 'conectar-whatsapp',
    title: 'Conectar seu WhatsApp',
    goal:
      'No fim, seu número estará conectado pela API Oficial da Meta, recebendo e enviando mensagens dentro do ConvoFlow.',
    forWhom: 'Gerente ou Gestor — quem cuida da configuração da Loja.',
    moduleName: 'whatsapp-numbers',
    steps: [
      {
        title: 'Separe os dados do seu app na Meta',
        body:
          'Abra o Meta for Developers, vá no seu app com WhatsApp Business habilitado e copie três informações: o Phone Number ID, o WhatsApp Business Account ID (WABA) e um Access Token permanente.',
        note:
          'Use um token de System User. Token de usuário comum expira em poucas horas e a conexão cai junto.',
      },
      {
        title: 'Abra Instâncias e APIs e clique em "Nova Instância"',
        body:
          'Cada instância é uma linha de WhatsApp ligada ao sistema. Sem nenhuma conectada, não existe conversa, chatbot nem campanha.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
      {
        title: 'Escolha "API Oficial do WhatsApp" e clique em "Continuar"',
        body:
          'São três opções de provedor. Escolha a primeira, "API Oficial do WhatsApp / Meta Cloud API" — é a que a produção usa e a única que permite disparo em massa dentro das regras da Meta.',
        note:
          'Se o botão "Conectar com a Meta" aparecer ativo no topo do formulário, ele faz a conexão automática e você pode pular o preenchimento manual. Quando ele está cinza, a integração automática ainda não foi configurada nesta instalação — siga pelos campos.',
      },
      {
        title: 'Preencha os campos da instância',
        body:
          'Dê um nome que identifique a linha (ex.: "WhatsApp Vendas Oficial") e cole o Phone Number ID, o WhatsApp Business Account ID e o Access Token. O campo Webhook Verify Token já vem preenchido com um valor gerado.',
        note:
          'O Access Token é guardado cifrado no Supabase Vault, não em texto puro.',
      },
      {
        title: 'Aponte o webhook da Meta para o ConvoFlow',
        body:
          'No painel da Meta, em Webhooks › WhatsApp Business Account, use como Callback URL o endereço que o próprio formulário mostra (termina em /functions/v1/meta-webhook) e assine os campos "messages" e "message_template_status_update". Sem isso, você envia mensagem mas não recebe resposta.',
        note:
          'O token que valida esse handshake é único da instalação do ConvoFlow (secret META_GLOBAL_VERIFY_TOKEN), configurado uma vez por quem opera a plataforma — não é o valor do campo Webhook Verify Token da tela. Se o webhook já foi validado antes, não há nada a fazer aqui.',
      },
      {
        title: 'Clique em "Validar e conectar"',
        body:
          'O ConvoFlow chama a Meta para conferir o token e o Phone Number ID antes de salvar. Se as credenciais estiverem erradas, nada é gravado e você pode corrigir e tentar de novo sem duplicar instância.',
      },
      {
        title: 'Confirme o status e faça um teste real',
        body:
          'Veja a instância aparecer na lista com o número identificado. Depois mande uma mensagem de outro celular para esse número e confirme que ela chega em Conversas. Enquanto a mensagem não aparecer ali, a conexão não está completa.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
    ],
  },

  // ------------------------------------------------------------------ 2
  {
    id: 'configurar-equipe',
    title: 'Configurar sua equipe',
    goal:
      'No fim, cada pessoa da operação terá o próprio acesso, com o cargo certo e vinculada à Loja onde trabalha.',
    forWhom:
      'Gerente, que administra as Lojas da Conta. O Superadmin faz o mesmo pela Administração.',
    minRole: 'gerente',
    steps: [
      {
        title: 'Decida o cargo de cada pessoa antes de convidar',
        body:
          'São quatro níveis: Atendente atende conversas dentro de uma Loja; Gestor administra uma Loja inteira; Gerente administra várias Lojas; Superadmin opera a plataforma. Como Gerente, você convida Gestor e Atendente.',
        helpKey: 'page:team',
      },
      {
        title: 'Coloque em foco a Loja onde a pessoa vai trabalhar',
        body:
          'Use o seletor de Conta no topo da tela para entrar na Loja de destino. O convite usa a Loja que está em foco, então trocar antes evita convidar para o lugar errado.',
        note:
          'A Loja precisa existir antes do convite. A criação de Loja não é feita por esta tela hoje — se a Loja ainda não existe, fale com quem opera a plataforma.',
      },
      {
        title: 'Abra Equipe e clique em "Convidar"',
        body:
          'A tela lista quem já tem acesso. Convidar por aqui é a única forma de alguém entrar no ConvoFlow: não existe cadastro público.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
      },
      {
        title: 'Preencha nome, sobrenome e e-mail',
        body:
          'O e-mail é o login da pessoa. O telefone é opcional. Preencha o nome de verdade: é ele que o time vê quando uma conversa é transferida e é por ele que os relatórios separam quem atendeu o quê.',
      },
      {
        title: 'Escolha a Função e confira o cartão que aparece embaixo',
        body:
          'Ao trocar a Função, o cartão logo abaixo lista o que aquele cargo pode e o que não pode fazer. Leia antes de enviar — é mais rápido que descobrir depois pelo suporte.',
        note:
          'Cada Loja aceita no máximo 1 Gestor e até 5 Atendentes.',
      },
      {
        title: 'Confira o campo de vínculo e clique em "Enviar convite"',
        body:
          'Para Gestor e Atendente aparece um campo de identificação da Loja, já preenchido com a Loja que você colocou em foco. O servidor recusa o convite se a Loja não pertencer à sua Conta, então um valor trocado por engano não passa.',
      },
      {
        title: 'Confirme que a pessoa conseguiu entrar',
        body:
          'Ela recebe um e-mail de convite e define a própria senha no primeiro acesso. Volte em Equipe e veja se o nome aparece na lista. Login compartilhado quebra relatório por pessoa — cada um usa o seu.',
        screen: '/dashboard/team',
      },
      {
        title: 'Remova o acesso de quem sair do time no mesmo dia',
        body:
          'Ainda em Equipe, retire o acesso de quem saiu. Enquanto o acesso existe, a pessoa continua vendo as conversas e os contatos da Loja.',
        screen: '/dashboard/team',
      },
    ],
  },

  // ------------------------------------------------------------------ 3
  {
    id: 'montar-funil',
    title: 'Montar seu funil de vendas',
    goal:
      'No fim, seu funil terá as etapas do seu processo real e você saberá onde cada lead está parado.',
    forWhom: 'Quem define o processo comercial da Loja — normalmente o Gestor.',
    moduleName: 'funnel',
    steps: [
      {
        title: 'Escreva as etapas do seu processo antes de abrir o sistema',
        body:
          'Liste, na ordem, o que acontece de verdade entre o primeiro contato e a venda. Quatro a seis etapas costumam bastar. Nome específico funciona melhor: "Visita agendada" informa, "Em andamento" não.',
      },
      {
        title: 'Abra o Funil de Vendas e clique em "Configurar Estágios"',
        body:
          'A janela mostra duas partes: "Estágios Atuais", com o que já existe, e "Adicionar Novo Estágio", para criar.',
        screen: '/dashboard/funnel',
        helpKey: 'page:funnel',
      },
      {
        title: 'Ajuste ou remova as etapas que não servem para você',
        body:
          'Em "Estágios Atuais", use o ícone de edição para renomear e o de lixeira para excluir. Faça essa limpeza antes de criar as novas, para não ficar com dois conjuntos de etapas ao mesmo tempo.',
      },
      {
        title: 'Crie cada etapa em "Adicionar Novo Estágio"',
        body:
          'Digite o nome em "Nome do Estágio" e escolha uma cor. Use as cores como semáforo do processo: frio no começo, quente perto do fechamento. Repita para cada etapa da sua lista.',
      },
      {
        title: 'Arraste as etapas para a ordem do seu processo',
        body:
          'Em "Estágios Atuais", arraste cada etapa para a posição certa. A ordem aqui é a ordem das colunas no quadro, e é ela que faz a leitura do funil ter sentido.',
      },
      {
        title: 'Feche a configuração e mova um lead de verdade',
        body:
          'Na aba "Kanban Board", arraste um card de uma coluna para outra. Mover o card é o que registra que a negociação andou — é assim que o time todo passa a ver a mesma situação.',
        screen: '/dashboard/funnel',
      },
      {
        title: 'Cadastre um lead pelo botão "Novo Lead" para testar',
        body:
          'Crie um lead de teste e acompanhe ele entrando na primeira etapa. Depois apague. Serve para você ver o fluxo completo antes de colocar o time para usar.',
        screen: '/dashboard/funnel',
      },
      {
        title: 'Ligue o funil às automações',
        body:
          'Com as etapas prontas, use o gatilho "Mudança de Estágio" para disparar ação no momento em que o lead avança — agendar follow-up ao entrar em "Visita agendada", por exemplo.',
        screen: '/dashboard/automation',
        helpKey: 'trigger:funnel_stage_changed',
      },
    ],
  },

  // ------------------------------------------------------------------ 4
  {
    id: 'primeiro-chatbot',
    title: 'Criar seu primeiro chatbot',
    goal:
      'No fim, um chatbot publicado vai atender o primeiro contato, perguntar o que o lead procura e passar a conversa para um atendente.',
    forWhom: 'Gestor ou Gerente. É o fluxo mínimo que funciona, não um tour por todos os blocos.',
    moduleName: 'chatbots',
    steps: [
      {
        title: 'Abra Chatbots e clique em "Novo Chatbot"',
        body:
          'Esta tela administra os bots: quais existem, qual está publicado e em qual número. O desenho do fluxo vem na tela seguinte.',
        screen: '/dashboard/chatbots',
        helpKey: 'page:chatbots',
      },
      {
        title: 'Dê um nome e escolha a instância de WhatsApp',
        body:
          'Preencha o Nome. Em "Instância WhatsApp", escolha o número em que o bot responde — deixar em "Todas as instâncias" faz ele valer para qualquer linha conectada. A Prioridade só importa se houver mais de um bot no mesmo número.',
      },
      {
        title: 'Marque o gatilho "Primeiro contato"',
        body:
          'Em "Gatilhos", marque "Primeiro contato": o bot entra quando alguém fala com você pela primeira vez. É o gatilho com maior retorno, porque é onde o lead de anúncio chega.',
        note:
          'Se escolher "Palavra-chave", você precisa cadastrar pelo menos uma palavra, senão o formulário não salva.',
      },
      {
        title: 'Salve — o construtor do fluxo abre sozinho',
        body:
          'Ao salvar, o ConvoFlow leva você direto para o construtor daquele bot. À esquerda ficam os blocos, no meio a área de desenho, e à direita o painel de configuração do bloco selecionado.',
        helpKey: 'page:chatbot-builder',
      },
      {
        title: 'Arraste "Início do Fluxo" e ligue nele um "Enviar Texto"',
        body:
          'Arraste "Início do Fluxo" para a área de desenho (só pode existir um) e depois "Enviar Texto". Ligue a bolinha de saída do Início na entrada do Enviar Texto e escreva a saudação no painel da direita.',
        note: 'Bloco solto não executa. Se não houver seta ligando, aquele trecho nunca roda.',
      },
      {
        title: 'Adicione "Fazer Pergunta" e salve a resposta numa variável',
        body:
          'Ligue um bloco "Fazer Pergunta" depois da saudação. Escreva a pergunta (ex.: "Qual bairro você procura?") e preencha "Salvar resposta como variável" com um nome simples, como bairro. Esse valor fica disponível nos blocos seguintes e no contato.',
        helpKey: 'concept:variables',
      },
      {
        title: 'Feche o fluxo com "Transferir para Atendente"',
        body:
          'Ligue um bloco "Transferir para Atendente" no fim. Ele encerra a parte automática e entrega a conversa para uma pessoa, já com o bairro coletado. Fluxo que só fala e não entrega deixa o lead sem resposta.',
        helpKey: 'transfer_agent',
      },
      {
        title: 'Clique em "Publicar" e corrija o que a validação apontar',
        body:
          'Salvar guarda o rascunho; Publicar é o que coloca no ar. Ao publicar, o sistema valida o fluxo inteiro e, se houver bloco sem ligação ou campo obrigatório vazio, mostra a lista do que corrigir em vez de publicar quebrado.',
      },
      {
        title: 'Mande uma mensagem para o número e confirme a resposta',
        body:
          'Use outro celular, escreva para o número e acompanhe em Conversas. Erro de texto e pergunta confusa só aparecem na conversa real.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
    ],
  },

  // ------------------------------------------------------------------ 5
  {
    id: 'primeira-campanha',
    title: 'Disparar sua primeira campanha',
    goal:
      'No fim, você terá enviado uma campanha dentro das regras da Meta, sem colocar o número em risco.',
    forWhom:
      'Gestor e Gerente. O Atendente participa das conversas geradas, mas não dispara campanha.',
    moduleName: 'campaigns',
    steps: [
      {
        title: 'Aprove um template no Gerenciador do WhatsApp Business',
        body:
          'A aprovação do template acontece do lado da Meta, no Gerenciador do WhatsApp Business — o ConvoFlow não cria nem submete template. Cadastre lá o texto que você quer disparar e espere a aprovação antes de continuar.',
        note:
          'Guarde o nome exato do template aprovado e o idioma. É esse nome que você digita no ConvoFlow; qualquer diferença de letra faz o envio falhar.',
      },
      {
        title: 'Decida o tipo de envio a partir da janela de 24 horas',
        body:
          'Mensagem de texto livre só é entregue dentro de 24 horas após a última mensagem do contato. Fora dessa janela, só template aprovado passa. Para uma lista fria — que é o caso da maioria das campanhas — o caminho é template.',
      },
      {
        title: 'Prepare a segmentação em Contatos',
        body:
          'Aplique tags nos contatos que devem receber, em vez de mirar a base toda. Campanha segmentada tem resposta melhor e reduz muito o risco de denúncia por spam.',
        screen: '/dashboard/contacts',
        helpKey: 'page:contacts',
      },
      {
        title: 'Abra Campanhas e clique em "Nova Campanha"',
        body:
          'O assistente tem quatro passos: Conteúdo, Público, Agendamento e Revisão. Ele só libera o passo seguinte quando o atual está válido.',
        screen: '/dashboard/campaigns',
        helpKey: 'page:campaigns',
      },
      {
        title: 'No passo Conteúdo, escolha a instância e o tipo de envio',
        body:
          'Dê um nome à campanha, escolha a Instância do WhatsApp e marque "Exigir opt-in" para enviar só a quem consentiu. Com instância da API Oficial, aparece a escolha entre template e texto livre: escolha template e digite o nome exato aprovado e o idioma.',
      },
      {
        title: 'No passo Público, escolha Tags, Contatos ou CSV',
        body:
          'Selecione por Tags para usar a segmentação que você acabou de preparar. "Contatos" permite escolher um a um, e CSV serve para uma lista externa. Confira o total antes de avançar.',
      },
      {
        title: 'No passo Agendamento, escolha "Enviar imediatamente" ou "Agendar"',
        body:
          'Agendar exige data. Horário comercial responde melhor: disparo de madrugada chega com o cliente dormindo e vira bloqueio ou denúncia na manhã seguinte.',
      },
      {
        title: 'No passo Revisão, comece pequeno',
        body:
          'Confira o resumo e dispare primeiro para um punhado de contatos, não para a lista inteira. Se preferir revisar depois, use "Salvar como Rascunho". Confirmado, a campanha entra na fila de envio.',
        note:
          'Lista grande num número recém-conectado é pedido de bloqueio. Deixe a linha amadurecer antes do primeiro disparo grande.',
      },
      {
        title: 'Acompanhe a entrega pelo botão "Relatórios"',
        body:
          'Ainda em Campanhas, abra Relatórios e veja entrega e respostas. Aqui você descobre se o problema foi o texto, a lista ou o horário — e ajusta antes do próximo disparo.',
        screen: '/dashboard/campaigns',
      },
    ],
  },
];

/** Tutorial por id, ou null. */
export function getTutorial(id: string | null | undefined): Tutorial | null {
  if (!id) return null;
  return TUTORIALS.find((tutorial) => tutorial.id === id) ?? null;
}

/** Tutorial pela chave de deep link (`tutorial:<id>`), ou null. */
export function getTutorialByKey(key: string | null | undefined): Tutorial | null {
  if (!key || !key.startsWith(TUTORIAL_KEY_PREFIX)) return null;
  return getTutorial(key.slice(TUTORIAL_KEY_PREFIX.length));
}

/**
 * O tutorial casa com a busca? Usa o MESMO motor das entradas de ajuda
 * (matchesSearchTerms), então acento e caixa são ignorados do mesmo jeito.
 */
export function tutorialMatches(tutorial: Tutorial, query: string): boolean {
  return matchesSearchTerms(
    [
      tutorial.title,
      tutorial.goal,
      tutorial.forWhom,
      ...tutorial.steps.flatMap((step) => [step.title, step.body, step.note]),
    ],
    query,
  );
}
