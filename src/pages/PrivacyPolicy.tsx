import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft, Shield, Eye, Database, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PrivacyPolicy() {
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
              <CardTitle className="text-3xl text-center">Política de Privacidade</CardTitle>
              <p className="text-center text-muted-foreground">
                Última atualização: Janeiro de 2025 • Conforme LGPD
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <div className="space-y-8">
                <section className="bg-primary/5 p-6 rounded-lg border">
                  <div className="flex items-center mb-4">
                    <Shield className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">1. Informações Gerais</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Esta Política de Privacidade descreve como a ConvoFlow coleta, usa, armazena e protege suas informações pessoais, 
                    em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018) e demais legislações aplicáveis.
                  </p>
                  <div className="mt-4 p-4 bg-background rounded border-l-4 border-primary">
                    <p className="text-sm text-muted-foreground mb-0">
                      <strong>Controlador:</strong> ConvoFlow Ltda.<br />
                      <strong>DPO (Encarregado):</strong> privacy@convoflow.com<br />
                      <strong>Contato:</strong> Rua Exemplo, 123 - São Paulo, SP
                    </p>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Database className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">2. Dados Coletados</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Dados Fornecidos Diretamente:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Cadastro:</strong> Nome, e-mail, telefone, empresa</li>
                        <li><strong>Perfil:</strong> Informações profissionais, preferências</li>
                        <li><strong>Pagamento:</strong> Dados de faturamento (processados por terceiros seguros)</li>
                        <li><strong>Suporte:</strong> Histórico de conversas e solicitações</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-2">Dados Coletados Automaticamente:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Uso da Plataforma:</strong> Logs de acesso, funcionalidades utilizadas</li>
                        <li><strong>Técnicos:</strong> Endereço IP, tipo de dispositivo, navegador</li>
                        <li><strong>Performance:</strong> Métricas de uso para melhorias</li>
                        <li><strong>Cookies:</strong> Preferências e dados de sessão</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Dados de Terceiros (WhatsApp):</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Mensagens:</strong> Conteúdo das conversas processadas</li>
                        <li><strong>Contatos:</strong> Números e perfis de destinatários</li>
                        <li><strong>Métricas:</strong> Status de entrega e engagement</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Eye className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">3. Finalidade do Tratamento</h2>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-medium mb-2">Prestação do Serviço:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Autenticação e acesso</li>
                        <li>• Processamento de mensagens</li>
                        <li>• Geração de relatórios</li>
                        <li>• Suporte técnico</li>
                      </ul>
                    </div>
                    
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-medium mb-2">Melhorias e Marketing:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Desenvolvimento da plataforma</li>
                        <li>• Análise de uso</li>
                        <li>• Comunicações relevantes</li>
                        <li>• Segurança e prevenção</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Users className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">4. Compartilhamento de Dados</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Seus dados podem ser compartilhados nas seguintes situações:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="p-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20">
                      <strong className="text-green-700 dark:text-green-400">Parceiros Essenciais:</strong>
                      <span className="text-muted-foreground"> WhatsApp Business API, provedores de pagamento, infraestrutura cloud</span>
                    </div>
                    <div className="p-3 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                      <strong className="text-yellow-700 dark:text-yellow-400">Obrigações Legais:</strong>
                      <span className="text-muted-foreground"> Quando exigido por autoridades competentes</span>
                    </div>
                    <div className="p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                      <strong className="text-blue-700 dark:text-blue-400">Transferência de Negócio:</strong>
                      <span className="text-muted-foreground"> Em caso de fusão, aquisição ou venda (com notificação prévia)</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">5. Armazenamento e Segurança</h2>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Período de Retenção:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Dados de conta:</strong> Durante a vigência do contrato + 5 anos</li>
                        <li><strong>Dados de mensagens:</strong> Conforme configuração do usuário (máx. 2 anos)</li>
                        <li><strong>Logs de acesso:</strong> 6 meses para segurança</li>
                        <li><strong>Dados financeiros:</strong> Conforme legislação fiscal (5-10 anos)</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-2">Medidas de Segurança:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Criptografia em trânsito e em repouso</li>
                        <li>Controle de acesso baseado em funções</li>
                        <li>Monitoramento contínuo de segurança</li>
                        <li>Backups seguros e redundantes</li>
                        <li>Auditoria regular de sistemas</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section className="bg-primary/5 p-6 rounded-lg border">
                  <h2 className="text-xl font-semibold mb-4">6. Seus Direitos (LGPD)</h2>
                  <p className="text-muted-foreground mb-4">
                    Como titular de dados pessoais, você possui os seguintes direitos:
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Confirmação:</strong> Saber se tratamos seus dados</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Acesso:</strong> Obter cópia dos seus dados</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Correção:</strong> Corrigir dados incompletos ou incorretos</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Eliminação:</strong> Excluir dados desnecessários</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Portabilidade:</strong> Receber dados em formato estruturado</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Oposição:</strong> Opor-se ao tratamento</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Informação:</strong> Conhecer entidades com quem compartilhamos</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Revogação:</strong> Retirar consentimento a qualquer momento</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-background rounded border">
                    <p className="text-sm text-muted-foreground mb-0">
                      <strong>Como exercer seus direitos:</strong> Entre em contato através do e-mail privacy@convoflow.com 
                      ou pela área de configurações da plataforma. Responderemos em até 15 dias úteis.
                    </p>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">7. Cookies e Tecnologias Similares</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Utilizamos cookies essenciais para o funcionamento da plataforma, cookies de performance para melhorar 
                    a experiência e cookies de funcionalidade para personalização. Você pode gerenciar suas preferências 
                    nas configurações do navegador.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">8. Alterações na Política</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Esta política pode ser atualizada periodicamente. Notificaremos sobre mudanças significativas 
                    por e-mail e através da plataforma. Recomendamos revisar esta política regularmente.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">9. Base Legal para Tratamento</h2>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>Execução de contrato:</strong> Prestação dos serviços contratados</p>
                    <p><strong>Interesse legítimo:</strong> Melhorias, segurança e prevenção à fraude</p>
                    <p><strong>Consentimento:</strong> Marketing e comunicações opcionais</p>
                    <p><strong>Cumprimento legal:</strong> Obrigações fiscais e regulatórias</p>
                  </div>
                </section>

                <section className="bg-muted/50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Contato e Ouvidoria</h2>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p><strong>Encarregado de Dados (DPO):</strong></p>
                      <p>privacy@convoflow.com</p>
                      <p>Tel: (11) 9999-9999</p>
                    </div>
                    <div>
                      <p><strong>Autoridade Nacional (ANPD):</strong></p>
                      <p>Se não ficar satisfeito com nossa resposta, pode contactar a ANPD</p>
                      <p>www.gov.br/anpd</p>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}