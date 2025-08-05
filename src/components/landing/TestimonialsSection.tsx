
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export const TestimonialsSection = () => {
  const testimonials = [
    {
      name: 'Carlos Silva',
      role: 'CEO, E-commerce Plus',
      avatar: '👨‍💼',
      rating: 5,
      text: 'O ConvoFlow revolucionou nossa operação no WhatsApp. Aumentamos em 250% nossas conversões e nossa equipe consegue atender 3x mais clientes no mesmo tempo.'
    },
    {
      name: 'Ana Costa',
      role: 'Diretora de Marketing, TechCorp',
      avatar: '👩‍💼',
      rating: 5,
      text: 'Incredible! O sistema de chatbots é intuitivo e os relatórios nos ajudam a tomar decisões baseadas em dados. ROI positivo desde o primeiro mês.'
    },
    {
      name: 'Roberto Mendes',
      role: 'Gerente Comercial, Vendas Pro',
      avatar: '🧑‍💼',
      rating: 5,
      text: 'A automação do ConvoFlow nos permitiu focar no que realmente importa: fechar vendas. O atendimento 24/7 gerou leads até enquanto dormíamos!'
    },
    {
      name: 'Juliana Oliveira',
      role: 'Fundadora, Consultoria Max',
      avatar: '👩‍🎓',
      rating: 5,
      text: 'Interface super amigável e suporte excepcional. Conseguimos implementar em 1 dia e já vimos resultados na primeira semana. Recomendo 100%!'
    }
  ];

  return (
    <section id="testimonials" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            O que nossos clientes{' '}
            <span className="text-whatsapp-primary">estão dizendo</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Histórias reais de empresas que transformaram seus resultados com o ConvoFlow
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-shadow duration-300 relative"
            >
              <Quote className="absolute top-6 right-6 w-8 h-8 text-whatsapp-primary/20" />
              
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl mr-4">
                  {testimonial.avatar}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{testimonial.name}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>

              <div className="flex items-center mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-yellow-500 fill-current" />
                ))}
              </div>

              <p className="text-muted-foreground leading-relaxed">
                "{testimonial.text}"
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
