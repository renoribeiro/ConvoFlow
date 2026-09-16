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
    forWhom: 'Gerente ou Gestor — quem cuida da configuração da Loja. Atendente não conecta número.',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
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
          'São três opções de provedor. Escolha a primeira, "API Oficial do WhatsApp" (Meta Cloud API) — é a que a produção usa e a única que permite disparo em massa dentro das regras da Meta.',
        note:
          'Se o botão "Conectar com a Meta" aparecer ativo no topo do formulário, ele faz a conexão automática e você pode pular o preenchimento manual. Quando ele está cinza, a integração automática ainda não foi configurada nesta instalação — siga pelos campos.',
      },
      {
        title: 'Preencha os campos da instância',
        body:
          'Dê um nome que identifique a linha (ex.: "WhatsApp Vendas Oficial") e cole o Phone Number ID, o WhatsApp Business Account ID e o Access Token. São só esses quatro campos — nenhum token de webhook é pedido aqui.',
        note:
          'O Access Token é guardado cifrado no Supabase Vault, não em texto puro.',
      },
      {
        title: 'Confirme o webhook da Meta (uma vez por instalação)',
        body:
          'Este passo é da plataforma, não do número: vale para a instalação inteira do ConvoFlow e é feito uma única vez. Se algum número já recebe mensagens aqui, pule para o passo seguinte. Na primeira instalação, quem opera a plataforma abre o painel da Meta em Webhooks › WhatsApp Business Account, usa como Callback URL o endereço que o formulário mostra (termina em /functions/v1/meta-webhook) e assina os campos "messages" e "message_template_status_update". Sem isso, você envia mensagem mas não recebe resposta.',
        note:
          'O Verify Token do handshake é único da instalação (secret META_GLOBAL_VERIFY_TOKEN no Supabase) e por segurança não aparece na tela — quem administra a instalação lê o valor no painel do Supabase e cola no console da Meta.',
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
      'Gerente, que administra as Lojas da Conta, e Gestor, que monta a equipe da própria Loja (para o Gestor, os passos 2 e 3 não existem: a Loja já é a dele). O Superadmin faz o mesmo pela Administração.',
    minRole: 'gestor',
    steps: [
      {
        title: 'Decida o cargo de cada pessoa antes de convidar',
        body:
          'São quatro níveis: Atendente atende conversas dentro de uma Loja; Gestor administra uma Loja inteira; Gerente administra várias Lojas; Superadmin opera a plataforma. Como Gerente, você convida Gestor e Atendente; como Gestor, você convida Atendentes para a sua Loja.',
        helpKey: 'page:team',
      },
      {
        title: 'Só o Gerente: crie a Loja em "Nova Loja", se ela ainda não existe',
        body:
          'Gestor e Atendente sempre pertencem a uma Loja, então ela vem primeiro. Em Equipe, clique em "Nova Loja", dê o nome pelo qual o time reconhece a operação e confirme em "Criar Loja". A Loja nasce vazia, dentro da sua Conta. Como Gestor, pule este passo: a sua Loja já existe e você não cria outra.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
        note:
          'Seu plano inclui 5 Lojas, e o contador ao lado do botão mostra quantas já foram usadas. Quando acabam, "Nova Loja" fica cinza — aí é contratar Lojas adicionais em Configurações › Assinatura.',
      },
      {
        title: 'Só o Gerente: coloque em foco a Loja onde a pessoa vai trabalhar',
        body:
          'Use o seletor de Conta no topo da tela, ou "Abrir" na lista de Lojas, para entrar na Loja de destino. O convite usa a Loja que está em foco, então trocar antes evita convidar para o lugar errado. Como Gestor você não tem seletor: está sempre na sua Loja.',
        note:
          'Acabou de criar a Loja? O aviso de sucesso traz o atalho "Abrir a loja", que já coloca ela em foco.',
      },
      {
        title: 'Abra Equipe e clique em "Convidar"',
        body:
          'A tela lista quem já tem acesso. Convidar por aqui é a única forma de alguém entrar no ConvoFlow: não existe cadastro público.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
      },
      {
        title: 'Preencha nome, sobrenome, e-mail e a Função',
        body:
          'O e-mail é o login da pessoa. O telefone é opcional. Preencha o nome de verdade: é ele que o time vê quando uma conversa é transferida e é por ele que os relatórios separam quem atendeu o quê. Ao trocar a Função, o cartão logo abaixo lista o que aquele cargo pode e o que não pode fazer — leia antes de enviar.',
        note:
          'Cada Loja aceita no máximo 1 Gestor e até 5 Atendentes.',
      },
      {
        title: 'Escolha a Loja e clique em "Enviar convite"',
        body:
          'Para Gestor e Atendente aparece uma lista com as Lojas da sua Conta, já marcada na que você colocou em foco. Confira se é a certa antes de enviar — é ela que define quais conversas e contatos a pessoa vai enxergar.',
        note:
          'Como Gestor você não escolhe nada aqui: o convite entra na sua Loja, que é a única que você administra.',
      },
      {
        title: 'Confirme que a pessoa conseguiu entrar',
        body:
          'Ela recebe um e-mail de convite, clica no link e cai numa tela para criar a própria senha. Depois disso já entra no sistema. Volte em Equipe e veja se o nome aparece na lista. Login compartilhado quebra relatório por pessoa — cada um usa o seu.',
        screen: '/dashboard/team',
        note:
          'O link do convite vale por UM acesso só. Se ela abrir no celular e depois tentar no computador, o segundo dá "Este link expirou ou já foi usado" — nesse caso é só pedir um novo pela própria tela, ou usar "Redefinir senha" no menu de Ações. A Loja herda o acesso da sua Conta, então quem entra numa Loja nova já cai direto no sistema; se aparecer "Acesso bloqueado", o pagamento pendente é o da Conta. Se a Loja já usa o rodízio de conversas, quem acabou de entrar já recebe a própria fatia: as fatias se refazem em divisão igual no momento em que a pessoa aceita o convite.',
      },
      {
        title: 'Divida as conversas novas entre a equipe',
        body:
          'Com pelo menos 2 atendentes ativos na Loja, abra Configurações › Escala/Transferência e, no cartão "Distribuição de conversas novas", ligue "Distribuir conversas novas automaticamente". Decida se o Gestor também recebe e se a conversa ganha responsável na primeira mensagem ou só quando o chatbot terminar. Ajuste a fatia de cada pessoa até a soma dar 100 (0 tira alguém do rodízio sem tirar da Loja) e clique em "Salvar distribuição".',
        screen: '/dashboard/settings',
        helpKey: 'page:settings-visibility',
        note:
          'Com um atendente só, o cartão mostra uma linha explicando que o rodízio aparece a partir do segundo — não há com quem dividir. O rodízio nunca troca uma conversa que já tem responsável, e não toca o sino. Na mesma aba, o cartão "Transferência por tempo sem resposta" faz o oposto para quem já tem a conversa e não responde: em X minutos de funcionamento ela passa para o próximo do rodízio, com aviso no sino. Vem desligado; ligue quando o time já souber que isso vai acontecer.',
      },
      {
        title: 'Remova o acesso de quem sair do time no mesmo dia',
        body:
          'Ainda em Equipe, retire o acesso de quem saiu. Enquanto o acesso existe, a pessoa continua vendo as conversas e os contatos da Loja. Quem sai é removido do rodízio sozinho, mas FICA com as conversas que já tinha: abra Conversas, pílula "Responsável indisponível", e transfira cada uma para quem vai continuar o atendimento.',
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
          'Arraste "Início do Fluxo" para a área de desenho (só pode existir um) e depois "Enviar Texto" — no tablet ou no celular, toque em "Blocos" na barra do topo e escolha cada um. Ligue a bolinha de saída do Início na entrada do Enviar Texto e escreva a saudação no painel da direita.',
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
          'Ligue um bloco "Transferir para Atendente" no fim. Ele encerra a parte automática, já com o bairro coletado. Em "Transferir para", deixe "Qualquer atendente disponível" para a conversa seguir o rodízio da Loja — ou ficar na fila, sem responsável, se o rodízio estiver desligado. Escolha "Atendente específico" só se uma pessoa certa deve ficar com ela: aí a conversa passa a ser dessa pessoa, que recebe um aviso no sino. Fluxo que só fala e não entrega deixa o lead sem resposta.',
        note:
          '"Atendente específico" só vale para conversa que ainda não tem responsável. Se a Loja usa o rodízio em "Na primeira mensagem", a conversa já chegou com dono antes de o bot rodar e o bloco não troca — use "Quando o chatbot terminar" em Configurações › Escala/Transferência.',
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
          'Use outro celular, escreva para o número e acompanhe em Conversas: enquanto o bot conduz, a conversa mostra o selo "Bot em atendimento", que some quando o fluxo chega em "Transferir para Atendente". Erro de texto e pergunta confusa só aparecem na conversa real.',
        note:
          'Para intervir antes do fim do fluxo, abra o menu ⋮ da conversa e clique em "Encerrar sessão do bot" — o item só fica ativo enquanto há bot na conversa.',
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
    minRole: 'gestor',
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

  // ------------------------------------------------------------------ 6
  // O único tutorial de OPERAÇÃO: os cinco acima montam a Loja; este é o dia
  // a dia de quem atende nela. Vem por último porque pressupõe tudo o que os
  // outros deixam pronto — e é o único que o atendente consegue seguir inteiro.
  {
    id: 'atender-conversas',
    title: 'Atender conversas no dia a dia',
    goal:
      'No fim, você vai saber de quem é cada conversa, como assumir e passar adiante, o que o bot está fazendo, e por que uma conversa pode aparecer ou sumir da sua lista sem você tocar nela.',
    forWhom:
      'Atendente, principalmente — e o Gestor que quer saber o que a equipe vê quando liga cada chave. A Loja já está conectada e com equipe.',
    moduleName: 'conversations',
    steps: [
      {
        title: 'Abra Conversas e leia o cabeçalho: de quem é esta conversa?',
        body:
          'Ao abrir uma conversa, o cabeçalho mostra o responsável por ela. "Sem responsável" quer dizer que ninguém pegou; um nome quer dizer que a conversa é daquela pessoa. A lista tem as pílulas "Minhas" (o que está com você) e "Sem responsável" (a fila) para você separar uma coisa da outra.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
      {
        title: 'Pegue uma conversa da fila: "Sem responsável" → "Assumir"',
        body:
          'Clique em "Sem responsável" no cabeçalho e depois em "Assumir". O seu nome aparece para todo mundo da Loja e a conversa entra em "Minhas". Se duas pessoas clicarem quase ao mesmo tempo, só a primeira fica com ela — a outra vê um aviso dizendo quem pegou.',
        note:
          'Responder numa conversa não a torna sua. Se você respondeu e não assumiu, ela continua "Sem responsável" para os colegas.',
      },
      {
        title: 'Passe uma conversa a um colega: "Transferir…"',
        body:
          'Clique no responsável no cabeçalho, escolha "Transferir…" e a pessoa na lista. Ela recebe "Conversa transferida" no sino. Também dá para transferir para você mesmo uma conversa que está com outra pessoa.',
        note:
          'Se o botão "Transferir…" não aparece para você, a Loja desligou a transferência para atendentes em Configurações › Escala/Transferência: só o Gestor e o Gerente passam conversas. "Assumir" continua funcionando.',
        helpKey: 'page:settings-visibility',
      },
      {
        title: 'Reconheça o selo "Bot em atendimento" — e encerre a sessão antes de responder',
        body:
          'O selo na linha da lista e no cabeçalho quer dizer que um chatbot está conduzindo a conversa agora. Antes de escrever, abra o menu ⋮ e clique em "Encerrar sessão do bot": o bot para na hora e a conversa passa a ser sua para responder. Sem isso, você e o bot falam com o cliente ao mesmo tempo.',
        note:
          'Sem selo, não há bot e o item fica desabilitado. Encerrar a sessão não muda o responsável nem chama o rodízio — é uma ação sua, e só.',
        helpKey: 'page:conversations',
      },
      {
        title: 'Entenda o que muda se o Gestor restringir a visibilidade',
        body:
          'Por padrão você vê todas as conversas da Loja. Se o Gestor escolher "Sem responsável + as dele" ou "Só as dele" em Escala/Transferência, a sua lista encolhe: só o que está com você, o que você já respondeu, o que você passou adiante e, na opção intermediária, a fila sem dono. Uma conversa que sumiu não foi apagada — está com um colega. Os números do Dashboard continuam da Loja inteira, com a etiqueta "Toda a Loja".',
        helpKey: 'page:settings-visibility',
      },
      {
        title: 'Saiba como o rodízio entrega conversas novas',
        body:
          'Com o rodízio ligado, a conversa nova já chega com responsável, na fatia que o Gestor definiu para cada pessoa — na primeira mensagem do cliente ou só quando o chatbot terminar. Ela entra em "Minhas" sem aviso no sino; o sino toca só quando alguém entrega de propósito. Cliente que volta cai com quem já o atendia: o rodízio nunca troca um responsável que existe.',
        helpKey: 'concept:conversation-routing',
      },
      {
        title: 'Entenda por que uma conversa pode sair de "Minhas" sozinha',
        body:
          'Se a Loja ligou a transferência por tempo sem resposta, uma conversa sua em que o cliente esperou resposta de pessoa por mais minutos de funcionamento do que o limite passa para o próximo do rodízio — e quem recebe ganha "Conversa transferida para você" no sino. Resposta do bot não segura a conversa; só a sua. Quando ela chega a você por esse caminho, o relógio começa do zero.',
        note:
          'Não é punição: é a Loja garantindo que o cliente não fique sem resposta. Para não perder conversas, responda dentro do limite ou peça ao Gestor para transferir antes.',
        helpKey: 'page:conversations',
      },
      {
        title: 'Use as cores e a pílula "Não respondidas" para priorizar',
        body:
          'Com a sinalização ligada em Configurações › Atendimento, a conversa em que o cliente espera fica amarela, laranja e vermelha conforme as horas passam, e a pílula "Não respondidas" filtra só elas. Responda as vermelhas primeiro: perto de 24 horas sem resposta, um número da API Oficial só reabre com template.',
        screen: '/dashboard/conversations',
        helpKey: 'page:settings-attendance',
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
