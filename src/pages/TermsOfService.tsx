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
            <Link to="/register" className="inline-flex items-center text-whatsapp-primary hover:text-whatsapp-secondary transition-colors mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para o registro
            </Link>
            
            <div className="flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-whatsapp-primary mr-3" />
              <span className="text-2xl font-bold text-foreground">ConvoFlow</span>
            </div>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl text-center">Termos de Uso</CardTitle>
              <p className="text-center text-muted-foreground">
                Última atualização: Janeiro de 2025
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <div className="space-y-8">
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
                    <li>Integração com WhatsApp Business API</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">3. Cadastro e Conta do Usuário</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Para usar nossos serviços, você deve criar uma conta fornecendo informações precisas e completas. 
                    Você é responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorrem 
                    em sua conta.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">4. Uso Permitido e Proibido</h2>
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

                <section>
                  <h2 className="text-xl font-semibold mb-4">5. Propriedade Intelectual</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Todos os direitos de propriedade intelectual relacionados à plataforma ConvoFlow são de nossa propriedade 
                    ou de nossos licenciadores. Você recebe uma licença limitada e revogável para usar nossos serviços 
                    conforme estes termos.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">6. Privacidade e Proteção de Dados</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    O tratamento de dados pessoais segue nossa Política de Privacidade e está em conformidade com a 
                    Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018). Ao usar nossos serviços, você concorda 
                    com o tratamento de seus dados conforme descrito em nossa política.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">7. Limitação de Responsabilidade</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    A ConvoFlow não será responsável por danos indiretos, incidentais, especiais ou consequenciais 
                    decorrentes do uso de nossos serviços. Nossa responsabilidade total está limitada ao valor pago 
                    pelos serviços nos últimos 12 meses.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">8. Modificações nos Termos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações serão 
                    comunicadas através da plataforma e entrarão em vigor 30 dias após a notificação.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">9. Rescisão</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Qualquer uma das partes pode rescindir este acordo a qualquer momento. Após a rescisão, 
                    seu acesso aos serviços será interrompido e seus dados podem ser excluídos conforme nossa 
                    política de retenção.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">10. Lei Aplicável e Foro</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Estes termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa 
                    será resolvida no foro da comarca de São Paulo, SP, com renúncia expressa a qualquer outro 
                    foro, por mais privilegiado que seja.
                  </p>
                </section>

                <section className="bg-muted/50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Contato</h2>
                  <p className="text-muted-foreground">
                    Para questões relacionadas a estes termos, entre em contato conosco através do e-mail: 
                    <span className="font-medium"> legal@convoflow.com</span>
                  </p>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}