
import { MessageSquare, Mail, Phone, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export const LandingFooter = () => {
  return (
    <footer className="bg-business-dark text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {/* Company Info */}
          <div className="col-span-1 sm:col-span-2 md:col-span-2">
            <div className="flex items-center mb-4">
              <MessageSquare className="w-6 sm:w-8 h-6 sm:h-8 text-whatsapp-primary mr-3" />
              <span className="text-xl sm:text-2xl font-bold">ConvoFlow</span>
            </div>
            <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6 max-w-md">
              A plataforma mais completa para automatizar e gerenciar seu WhatsApp Business. 
              Transforme conversas em vendas.
            </p>
            <div className="space-y-2">
              <div className="flex items-center text-gray-300 text-sm sm:text-base">
                <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>contato@convoflow.com.br</span>
              </div>
              <div className="flex items-center text-gray-300 text-sm sm:text-base">
                <Phone className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>(11) 99999-9999</span>
              </div>
              <div className="flex items-center text-gray-300 text-sm sm:text-base">
                <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>São Paulo, SP - Brasil</span>
              </div>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Produto</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Funcionalidades</a></li>
              <li><a href="#pricing" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Preços</a></li>
              <li><Link to="/dashboard" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Dashboard</Link></li>
              <li><a href="#" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">API</a></li>
              <li><a href="#" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Integrações</a></li>
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Suporte</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Central de Ajuda</a></li>
              <li><a href="#" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Documentação</a></li>
              <li><a href="#" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Status</a></li>
              <li><Link to="/login" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Login</Link></li>
              <li><Link to="/register" className="text-sm sm:text-base text-gray-300 hover:text-whatsapp-primary transition-colors">Cadastro</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-6 sm:mt-8 pt-6 sm:pt-8 text-center text-gray-400">
          <p className="text-xs sm:text-sm">&copy; 2024 ConvoFlow. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};
