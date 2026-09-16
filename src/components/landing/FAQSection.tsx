
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
      answer: 'O ConvoFlow se conecta à API oficial do WhatsApp Business, da Meta. O número é o mesmo que seus clientes já conhecem — o que muda é onde ele é atendido: as conversas passam para a plataforma e o número deixa de ser usado no aplicativo do WhatsApp no celular.'
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
      answer: 'O ConvoFlow não cobra por mensagem nem limita a quantidade: o plano é por loja, e as mensagens na plataforma são ilimitadas. O que existe é a cobrança da própria Meta pelas conversas na API oficial, feita direto no cartão do seu portfólio empresarial — os valores atuais estão em developers.facebook.com/docs/whatsapp/pricing. A Meta também aplica um limite diário de quantas pessoas você pode abordar primeiro (responder quem te escreveu não conta), e ele cresce sozinho conforme o número é bem usado.'
    },
    {
      question: 'Meus dados ficam seguros?',
      answer: 'Sim. Seus dados ficam em servidores no Brasil, com criptografia em trânsito e em repouso, e seguimos a LGPD. Eles só são compartilhados com quem precisa deles para o serviço funcionar — a Meta, que entrega as mensagens do WhatsApp, e o processador de pagamento — como descreve nossa Política de Privacidade.'
    },
    {
      question: 'Como funciona o suporte técnico?',
      answer: 'Oferecemos suporte técnico prioritário via WhatsApp, email e chat. Nossa equipe responde em até 2 horas úteis e inclui treinamento completo para sua equipe.'
    },
    {
      question: 'Posso cancelar a qualquer momento?',
      answer: 'Sim, não há fidelidade. Você pode cancelar sua assinatura a qualquer momento, e o acesso permanece ativo até o fim do ciclo já pago.'
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
            <span className="text-brand-primary">Frequentes</span>
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
                <AccordionTrigger className="text-left hover:text-brand-primary transition-colors">
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
