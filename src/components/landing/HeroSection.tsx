import { Button } from '@/components/ui/button';
import { HeroHighlight, Highlight } from '@/components/ui/hero-highlight';
import { motion } from 'framer-motion';
import { ArrowRight, Play, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

export const HeroSection = () => {
  return (
    <section className="pt-20 sm:pt-24 md:pt-28 lg:pt-32">
      <HeroHighlight>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-8"
            >
              <div className="inline-flex items-center bg-whatsapp-light/50 rounded-full px-6 py-2 mb-8">
                <MessageSquare className="w-4 h-4 text-whatsapp-primary mr-2" />
                <span className="text-sm font-medium text-whatsapp-primary">
                  Revolucione seu WhatsApp Business
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground mb-4 sm:mb-6 leading-tight px-4 sm:px-0">
                Automatize seu{' '}
                <Highlight className="text-white">
                  WhatsApp Business
                </Highlight>{' '}
                e multiplique suas vendas
              </h1>

              <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
                A única plataforma que você precisa para gerenciar conversas, 
                automatizar respostas e converter mais leads no WhatsApp.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 px-4 sm:px-0"
            >
              <Link to="/auth">
                <Button size="xl" variant="whatsapp" className="group w-full sm:w-auto">
                  Começar Gratuitamente
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              
              <Button size="xl" variant="outline" className="group w-full sm:w-auto">
                <Play className="mr-2 h-5 w-5" />
                Ver Demonstração
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto px-4 sm:px-0"
            >
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-whatsapp-primary/10 rounded-full mb-4">
                  <TrendingUp className="w-8 h-8 text-whatsapp-primary" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">+300%</h3>
                <p className="text-muted-foreground">Aumento em conversões</p>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-whatsapp-primary/10 rounded-full mb-4">
                  <Users className="w-8 h-8 text-whatsapp-primary" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">50k+</h3>
                <p className="text-muted-foreground">Empresas atendidas</p>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-whatsapp-primary/10 rounded-full mb-4">
                  <MessageSquare className="w-8 h-8 text-whatsapp-primary" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">1M+</h3>
                <p className="text-muted-foreground">Mensagens processadas</p>
              </div>
            </motion.div>
          </div>
        </div>
      </HeroHighlight>
    </section>
  );
};
