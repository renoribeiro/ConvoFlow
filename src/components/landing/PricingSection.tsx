import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight, Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

export const PricingSection = () => {
  const [userCount, setUserCount] = useState(1);
  const navigate = useNavigate();

  const basePrice = 299;
  const additionalUserPrice = 89;
  const totalPrice = basePrice + (userCount > 1 ? (userCount - 1) * additionalUserPrice : 0);

  const features = [
    'WhatsApp Business API integrado',
    'Chatbots inteligentes ilimitados',
    'Multi-atendimento em tempo real',
    'Analytics e relatórios avançados',
    'Automação de fluxos completa',
    'Templates de mensagem profissionais',
    'Segmentação avançada de contatos',
    'Integração com CRM/ERP',
    'Suporte técnico prioritário',
    'Treinamento completo da equipe'
  ];

  const handleSubscribe = () => {
    // Navigate to auth page to create account before subscribing
    navigate('/auth');
  };

  return (
    <section id="pricing" className="py-12 sm:py-16 md:py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <Badge className="mb-4" variant="outline">
            <Crown className="w-4 h-4 mr-2" />
            Plano Profissional
          </Badge>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 px-4 sm:px-0">
            Preço simples e{' '}
            <span className="text-whatsapp-primary">transparente</span>
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground px-4 sm:px-0">
            Sem pegadinhas, sem taxas ocultas. Pague apenas pelo que usar.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="bg-card rounded-2xl border-2 border-whatsapp-primary/20 p-6 sm:p-8 md:p-12 relative overflow-hidden"
        >
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-whatsapp-primary/5 to-transparent" />

          <div className="relative z-10">
            {/* Price Calculator */}
            <div className="text-center mb-8">
              <div className="mb-6">
                <label className="block text-sm font-medium text-muted-foreground mb-3">
                  Quantos usuários você precisa?
                </label>
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserCount(Math.max(1, userCount - 1))}
                    disabled={userCount <= 1}
                  >
                    -
                  </Button>
                  <span className="text-2xl font-bold text-foreground min-w-[60px]">
                    {userCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserCount(userCount + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="mb-6">
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-2">
                  R$ {totalPrice}
                  <span className="text-xl sm:text-2xl text-muted-foreground font-normal">/mês</span>
                </div>
                <div className="text-sm sm:text-base text-muted-foreground px-4 sm:px-0">
                  {userCount === 1 ? (
                    'Plano base para 1 usuário'
                  ) : (
                    <>
                      R$ {basePrice} (base) + R$ {additionalUserPrice} × {userCount - 1} usuários adicionais
                    </>
                  )}
                </div>
              </div>

              <Button
                size="xl"
                variant="whatsapp"
                onClick={handleSubscribe}
                className="group mb-6 sm:mb-8 w-full sm:w-auto"
              >
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>

              <p className="text-sm text-muted-foreground px-4 sm:px-0">
                Teste grátis por 14 dias • Cancele quando quiser
              </p>
            </div>

            {/* Features List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  viewport={{ once: true }}
                  className="flex items-center"
                >
                  <div className="w-5 h-5 rounded-full bg-whatsapp-primary flex items-center justify-center mr-3 flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm sm:text-base text-foreground">{feature}</span>
                </motion.div>
              ))}
            </div>

            {/* Money Back Guarantee */}
            <div className="mt-6 sm:mt-8 p-4 bg-muted rounded-lg text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                💰 <strong>Garantia de 30 dias</strong> - Se não ficar satisfeito, devolvemos 100% do seu dinheiro
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
