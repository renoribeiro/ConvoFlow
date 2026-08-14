import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-background p-4">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-8">
            <Link to="/auth" className="inline-flex items-center text-brand-primary hover:text-brand-secondary transition-colors mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
            
            <div className="flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-brand-primary mr-3" />
              <span className="text-2xl font-bold text-foreground">ConvoFlow</span>
            </div>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl text-center">Termos de Uso</CardTitle>
              <p className="text-center text-muted-foreground">
                Última atualização: 13 de agosto de 2026
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <div className="space-y-8">
                <section className="bg-primary/5 p-6 rounded-lg border">
                  <h2 className="text-xl font-semibold mb-4">Identificação da Empresa</h2>
                  <p className="text-muted-foreground leading-relaxed mb-3">
                    O ConvoFlow é uma plataforma de automação para WhatsApp operada por:
                  </p>
                  <div className="p-4 bg-background rounded border-l-4 border-primary text-sm text-muted-foreground space-y-1">
                    <p><strong>RE9 ONLINE BRANDING LTDA</strong></p>
                    <p>CNPJ: 27.286.273/0001-09</p>
                    <p>Endereço: Rua Barbosa de Freitas, 1741, Sala 04, Aldeota, Fortaleza/CE, CEP 60.170-021</p>
                    <p>Email: administrativo@re9.online</p>
                    <p>Telefone: (85) 99176-4169</p>
                  </div>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    Para os fins destes Termos, "ConvoFlow", "nós" ou "nossa" referem-se à RE9 ONLINE BRANDING LTDA,
                    e "você", "usuário" ou "cliente" referem-se à pessoa física ou jurídica que utiliza a plataforma.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">1. Aceitação dos Termos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Ao acessar e usar a plataforma ConvoFlow, você concorda em cumprir e estar vinculado aos seguintes termos e condições de uso.
                    Se você não concordar com qualquer parte destes termos, não deve usar nossos serviços.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">2. Descrição do Serviço</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    A ConvoFlow é uma plataforma de automação para WhatsApp que oferece soluções de chatbots, gestão de campanhas, 
                    análise de conversas e ferramentas de relacionamento com clientes. Nossos serviços incluem:
                  </p>
                  <ul className="list-disc pl-6 mt-2 text-muted-foreground">
                    <li>Criação e gerenciamento de chatbots</li>
                    <li>Automação de campanhas de marketing</li>
                    <li>Análise e relatórios de conversas</li>
                    <li>Gestão de contatos e leads</li>
                    <li>Integração com a WhatsApp Business Platform (Meta Cloud API)</li>
                  </ul>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    O envio e o recebimento de mensagens ocorrem <strong>exclusivamente</strong> por meio da
                    WhatsApp Business Platform oficial da Meta (Cloud API). O ConvoFlow não utiliza, não oferece e
                    não dá suporte a métodos não oficiais de conexão ao WhatsApp.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">3. Cadastro e Conta do Usuário</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Para usar nossos serviços, você deve criar uma conta fornecendo informações precisas e completas. 
                    Você é responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorrem 
                    em sua conta.
                  </p>
                </section>

                <section className="bg-primary/5 p-6 rounded-lg border">
                  <h2 className="text-xl font-semibold mb-4">4. Planos, Pagamento e Cancelamento</h2>
                  {/*
                    TODO (produto — pendências que sustentam esta seção):
                      1. NÃO existe cancelamento self-service. `handlePortal` em
                         SubscriptionSettings.tsx apenas exibe um toast mandando o cliente
                         procurar o e-mail do Stripe; não há chamada a billing_portal.
                         Enquanto isso, o canal declarado em 4.4 é o e-mail — e ele
                         PRECISA ser efetivamente monitorado.
                      2. O reembolso do art. 49 (cláusula 4.3) é processo manual no painel
                         do Stripe; não existe rotina automatizada.

                    NÃO REINTRODUZIR sem implementar antes:
                      - Período de teste gratuito. `trial_ends_at` não é gravado por nenhum
                        código nem trigger, e `create-checkout-session` não envia
                        `trial_period_days`. A infraestrutura existe, mas o mecanismo não —
                        por isso o teste foi retirado de TODA a comunicação ao cliente
                        (landing, FAQ, CTA, Terms e tela de assinatura).
                      - Garantia de satisfação / reembolso além dos 7 dias do art. 49 do
                        CDC. Foi removida daqui e da PricingSection/FAQ. Qualquer promessa
                        desse tipo na página de vendas volta a vincular por força do
                        art. 30 do CDC e precisa constar aqui também.
                  */}

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">4.1. Planos e preços</h3>
                      <p className="text-muted-foreground mb-2">
                        O acesso à plataforma é prestado mediante assinatura do <strong>Plano Gerente</strong>, no
                        valor de <strong>R$ 499,90 (quatrocentos e noventa e nove reais e noventa centavos) por
                        mês</strong>, que inclui a operação de até 5 (cinco) lojas.
                      </p>
                      <p className="text-muted-foreground">
                        Cada loja adicional é contratada por <strong>R$ 99,90 (noventa e nove reais e noventa
                        centavos) por mês</strong>, cobrada de forma cumulativa à mensalidade do plano. Os preços
                        podem ser reajustados mediante comunicação prévia de, no mínimo, 30 (trinta) dias,
                        aplicando-se o novo valor somente aos ciclos posteriores ao aviso. O cliente que não
                        concordar com o reajuste poderá cancelar a assinatura antes de sua vigência, sem ônus.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">4.2. Contratação e renovação automática</h3>
                      <p className="text-muted-foreground">
                        A contratação é feita pela própria plataforma, por meio do <strong>Stripe</strong>, que
                        processa os pagamentos e armazena os dados do meio de pagamento — o ConvoFlow não tem
                        acesso ao número do seu cartão. A assinatura é mensal e
                        <strong> renova-se automaticamente</strong> ao fim de cada ciclo, com cobrança na mesma
                        forma de pagamento, até que haja cancelamento. A data da primeira cobrança marca o início
                        do ciclo de faturamento.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">4.3. Direito de arrependimento</h3>
                      <p className="text-muted-foreground">
                        Por se tratar de contratação realizada fora do estabelecimento comercial, você pode desistir
                        da contratação no prazo de <strong>7 (sete) dias corridos</strong>, contados da data da
                        contratação, nos termos do <strong>art. 49 do Código de Defesa do Consumidor</strong>.
                        Exercido o arrependimento nesse prazo, os valores eventualmente pagos são devolvidos
                        integralmente e de forma imediata, pelo mesmo meio de pagamento utilizado.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">4.4. Cancelamento</h3>
                      <p className="text-muted-foreground mb-2">
                        O cancelamento pode ser solicitado a qualquer momento, sem multa ou fidelidade, pelo e-mail
                        <strong> administrativo@re9.online</strong>, a partir do endereço de e-mail cadastrado na
                        Conta. O pedido é processado em até 2 (dois) dias úteis, e a confirmação é enviada por
                        e-mail.
                      </p>
                      <p className="text-muted-foreground">
                        Cancelada a assinatura, <strong>o acesso permanece ativo até o término do ciclo já
                        pago</strong>, não havendo novas cobranças a partir de então. Não há devolução proporcional
                        dos dias não utilizados do ciclo em curso, ressalvada a hipótese da cláusula 4.3.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">4.5. Inadimplência</h3>
                      <p className="text-muted-foreground">
                        Não confirmado o pagamento na data de vencimento, o acesso à plataforma poderá ser
                        <strong> suspenso</strong> após comunicação prévia ao cliente. Durante a suspensão, os dados
                        da Conta são <strong>preservados</strong>, e o cliente pode solicitar cópia deles a qualquer
                        momento para regularizar a situação. Persistindo a inadimplência, o contrato poderá ser
                        rescindido na forma da cláusula 11, e os dados tratados conforme a nossa Política de
                        Privacidade, ressalvadas as obrigações legais de guarda.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">4.6. Tributos</h3>
                      <p className="text-muted-foreground">
                        Os valores anunciados são <strong>finais e já incluem todos os tributos</strong> incidentes
                        sobre a prestação do serviço. Não há taxa de adesão, taxa de instalação ou qualquer cobrança
                        adicional além das expressamente previstas nesta seção. A nota fiscal correspondente é
                        emitida a cada ciclo de faturamento.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">5. Uso Permitido e Proibido</h2>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Uso Permitido:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Comunicação comercial legítima</li>
                        <li>Atendimento ao cliente</li>
                        <li>Marketing com consentimento dos destinatários</li>
                        <li>Automação de processos comerciais</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Uso Proibido:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Envio de spam ou mensagens não solicitadas</li>
                        <li>Disseminação de conteúdo ofensivo, ilegal ou prejudicial</li>
                        <li>Violação de direitos de terceiros</li>
                        <li>Tentativas de quebrar a segurança da plataforma</li>
                        <li>Uso para atividades fraudulentas ou enganosas</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section className="bg-green-50 dark:bg-green-950/20 p-6 rounded-lg border border-green-200 dark:border-green-900">
                  <h2 className="text-xl font-semibold mb-4">6. Uso do WhatsApp Business Platform (Meta)</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    A funcionalidade de envio e recebimento de mensagens do ConvoFlow é prestada por meio da
                    integração com a <strong>WhatsApp Business Platform</strong>, operada pela Meta Platforms, Inc.
                    Ao utilizar essa funcionalidade, você reconhece e concorda com as condições adicionais abaixo,
                    sem prejuízo das obrigações já previstas nestes Termos.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">6.1. Aceitação das políticas da Meta</h3>
                      <p className="text-muted-foreground">
                        Você declara que leu, compreendeu e está vinculado à{' '}
                        <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          WhatsApp Business Policy
                        </a>,
                        à{' '}
                        <a href="https://www.whatsapp.com/legal/commerce-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          WhatsApp Commerce Policy
                        </a>{' '}
                        e aos demais termos aplicáveis da Meta. O descumprimento dessas políticas pode resultar em
                        suspensão imediata do número de WhatsApp, bem como em encerramento da sua conta no ConvoFlow.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">6.2. Consentimento (opt-in) e descadastramento (opt-out)</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Você é o único responsável por obter consentimento prévio, livre, informado e expresso dos destinatários antes de enviar qualquer mensagem por WhatsApp.</li>
                        <li>O consentimento deve ser registrado de forma auditável (formulário, opt-in em site, etc.) e deve estar disponível mediante solicitação.</li>
                        <li>Pedidos de descadastramento devem ser respeitados de forma imediata, e o destinatário deve permanecer fora de comunicações até que reaceite explicitamente.</li>
                        <li>É proibido enviar mensagens em massa não solicitadas (spam), mensagens enganosas ou conteúdo que viole as políticas da Meta ou a legislação brasileira.</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">6.3. Janela de atendimento de 24 horas e Templates</h3>
                      <p className="text-muted-foreground">
                        Fora da janela de 24 horas após a última mensagem recebida do destinatário, o envio só pode ser
                        feito por meio de <strong>templates de mensagem previamente aprovados pela Meta</strong>,
                        conforme regras da Cloud API. Tentativas de burlar essa regra são vedadas e podem resultar
                        em bloqueio pela Meta.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">6.4. Limitações da WhatsApp Cloud API</h3>
                      <p className="text-muted-foreground mb-2">Você reconhece que a Cloud API da Meta possui limitações inerentes, entre elas:</p>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Indisponibilidade de histórico de mensagens anteriores à conexão do número.</li>
                        <li>Não suporte a grupos do WhatsApp.</li>
                        <li>Limites diários ("messaging tiers") definidos pela Meta com base em qualidade e volume.</li>
                        <li>Possibilidade de bloqueio ou rebaixamento de qualidade do número em caso de denúncias por destinatários.</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">6.5. Responsabilidade do cliente</h3>
                      <p className="text-muted-foreground">
                        O ConvoFlow atua como provedor de tecnologia (Tech Provider) e não se responsabiliza por
                        suspensões, bloqueios, alterações ou descontinuações de serviço impostas pela Meta em
                        decorrência de violação, por parte do cliente, das políticas da WhatsApp Business Platform
                        ou da legislação aplicável.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">7. Propriedade Intelectual</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Todos os direitos de propriedade intelectual relacionados à plataforma ConvoFlow são de nossa propriedade 
                    ou de nossos licenciadores. Você recebe uma licença limitada e revogável para usar nossos serviços 
                    conforme estes termos.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">8. Privacidade e Proteção de Dados</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    O tratamento de dados pessoais segue nossa{' '}
                    <Link to="/privacy-policy" className="text-primary underline">Política de Privacidade</Link>
                    {' '}e está em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
                    Ao usar nossos serviços, você concorda com o tratamento de seus dados conforme descrito em
                    nossa política.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    Você reconhece que, em relação aos dados dos seus próprios clientes tratados na plataforma
                    (contatos, mensagens e mídias), <strong>você é o controlador</strong> e o ConvoFlow atua como
                    <strong> operador</strong>, cabendo a você assegurar a base legal, o consentimento e o
                    atendimento às solicitações dos titulares, conforme detalhado na Política de Privacidade.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">9. Limitação de Responsabilidade</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    A ConvoFlow não será responsável por danos indiretos, incidentais, especiais ou consequenciais 
                    decorrentes do uso de nossos serviços. Nossa responsabilidade total está limitada ao valor pago 
                    pelos serviços nos últimos 12 meses.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">10. Modificações nos Termos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações serão 
                    comunicadas através da plataforma e entrarão em vigor 30 dias após a notificação.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">11. Rescisão</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Qualquer uma das partes pode rescindir este acordo a qualquer momento, observado o disposto na
                    cláusula 4.4. Após a rescisão, o acesso aos serviços é interrompido e os dados da Conta passam a
                    ser tratados conforme a nossa{' '}
                    <Link to="/privacy-policy" className="text-primary underline">Política de Privacidade</Link>,
                    {' '}podendo o cliente solicitar cópia ou a exclusão do histórico, ressalvadas as obrigações
                    legais de guarda.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">12. Lei Aplicável e Foro</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa
                    decorrente ou relacionada a estes Termos será resolvida no foro da comarca de
                    <strong> Fortaleza, Estado do Ceará</strong>, com renúncia expressa a qualquer outro foro,
                    por mais privilegiado que seja.
                  </p>
                </section>

                <section className="bg-muted/50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Contato</h2>
                  <p className="text-muted-foreground mb-2">
                    Para questões relacionadas a estes Termos, entre em contato com a RE9 ONLINE BRANDING LTDA:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Email jurídico: <span className="font-medium">juridico@convoflow.com.br</span></li>
                    <li>• Email de privacidade/LGPD: <span className="font-medium">privacidade@convoflow.com.br</span></li>
                    <li>• Email administrativo: <span className="font-medium">administrativo@re9.online</span></li>
                    <li>• Telefone: (85) 99176-4169</li>
                  </ul>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}