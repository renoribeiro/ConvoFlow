
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CTASection = () => {
  return (
    <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-r from-whatsapp-primary to-whatsapp-secondary relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30" 
           style={{
             backgroundImage: `url("data:image/svg+xml,%3csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3e%3cdefs%3e%3cpattern id='dots' width='60' height='60' patternUnits='userSpaceOnUse'%3e%3ccircle cx='30' cy='30' r='2' fill='white' fill-opacity='0.4'/%3e%3c/pattern%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23dots)'/%3e%3c/svg%3e")`
           }} />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center text-white"
        >
          <div className="inline-flex items-center bg-white/20 rounded-full px-4 sm:px-6 py-2 mb-6 sm:mb-8">
            <Zap className="w-4 h-4 mr-2" />
            <span className="text-xs sm:text-sm font-medium">
              Transforme seu WhatsApp hoje mesmo
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight px-4 sm:px-0">
            Pronto para multiplicar suas vendas no WhatsApp?
          </h2>
          
          <p className="text-lg sm:text-xl mb-6 sm:mb-8 opacity-90 max-w-2xl mx-auto px-4 sm:px-0">
            Junte-se a mais de 50.000 empresas que já revolucionaram 
            seu atendimento e vendas com o ConvoFlow
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
            <Link to="/register" className="w-full sm:w-auto">
              <Button 
                size="xl" 
                variant="secondary"
                className="bg-white text-whatsapp-primary hover:bg-white/90 group w-full sm:w-auto"
              >
                Começar Teste Gratuito
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <a 
              href="https://wa.me/5585991764169?text=Quero%20falar%20do%20ConvoFlow"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button 
                size="xl" 
                className="bg-business-dark text-white hover:bg-business-dark/90 w-full sm:w-auto"
              >
                Falar com Especialista
              </Button>
            </a>
          </div>

          <p className="text-xs sm:text-sm mt-4 sm:mt-6 opacity-75 px-4 sm:px-0">
            ⚡ Setup em 5 minutos • 🛡️ Seguro e confiável • 📞 Suporte brasileiro
          </p>
        </motion.div>
      </div>
    </section>
  );
};
