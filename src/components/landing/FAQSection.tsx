
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export const FAQSection = () => {
  const faqs = [
    {
      question: 'Como funciona a integração com o WhatsApp Business?',
      answer: 'O ConvoFlow se conecta diretamente à API oficial do WhatsApp Business, garantindo máxima confiabilidade e conformidade. Você mantém seu número atual e todas as conversas ficam centralizadas em nossa plataforma.'
    },
    {
      question: 'Posso testar antes de assinar?',
      answer: 'Sim! Oferecemos 14 dias de teste gratuito com acesso completo a todas as funcionalidades. Não pedimos cartão de crédito para começar.'
    },
    {
      question: 'É possível integrar com meu CRM/ERP atual?',
      answer: 'Absolutamente! Temos integração nativa com os principais CRMs do mercado (Pipedrive, RD Station, HubSpot, etc.) e também oferecemos API para integrações customizadas.'
    },
    {
      question: 'Os chatbots funcionam em português?',
      answer: 'Sim, nossos chatbots são otimizados para português brasileiro e incluem processamento de linguagem natural avançado para entender diferentes formas de expressão.'
    },
    {
      question: 'Quantas mensagens posso enviar por mês?',
      answer: 'Não há limite de mensagens! Você paga apenas pelos usuários da plataforma. Todas as mensagens enviadas e recebidas são ilimitadas em todos os planos.'
    },
    {
      question: 'Meus dados ficam seguros?',
      answer: 'Sim, utilizamos criptografia ponta-a-ponta e seguimos todas as normas da LGPD. Seus dados são armazenados em servidores seguros no Brasil e nunca são compartilhados com terceiros.'
    },
    {
      question: 'Como funciona o suporte técnico?',
      answer: 'Oferecemos suporte técnico prioritário via WhatsApp, email e chat. Nossa equipe responde em até 2 horas úteis e inclui treinamento completo para sua equipe.'
    },
    {
      question: 'Posso cancelar a qualquer momento?',
      answer: 'Sim, não há fidelidade. Você pode cancelar sua assinatura a qualquer momento e ainda oferecemos garantia de 30 dias para reembolso total.'
    }
  ];

  return (
    <section id="faq" className="py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Perguntas{' '}
            <span className="text-whatsapp-primary">Frequentes</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Tire suas dúvidas sobre o ConvoFlow
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left hover:text-whatsapp-primary transition-colors">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};
