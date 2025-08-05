
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Chatbot, ChatbotSettings, ChatbotInteraction } from '@/types/chatbot.types';
import { useToast } from '@/hooks/use-toast';

interface ChatbotContextType {
  chatbots: Chatbot[];
  settings: ChatbotSettings;
  interactions: ChatbotInteraction[];
  loading: boolean;
  
  // Chatbot CRUD
  createChatbot: (chatbot: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'analytics'>) => Promise<void>;
  updateChatbot: (id: string, updates: Partial<Chatbot>) => Promise<void>;
  deleteChatbot: (id: string) => Promise<void>;
  duplicateChatbot: (id: string) => Promise<void>;
  toggleChatbot: (id: string) => Promise<void>;
  
  // Settings
  updateSettings: (settings: Partial<ChatbotSettings>) => Promise<void>;
  
  // Testing
  testChatbot: (id: string, message: string) => Promise<string>;
  
  // Analytics
  getChatbotAnalytics: (id: string) => Promise<any>;
  
  // Export/Import
  exportChatbot: (id: string) => Promise<string>;
  importChatbot: (data: string) => Promise<void>;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export const useChatbot = () => {
  const context = useContext(ChatbotContext);
  if (!context) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
};

const defaultSettings: ChatbotSettings = {
  defaultResponseTime: 2,
  maxRetries: 3,
  enableFallback: true,
  fallbackMessage: 'Desculpe, não entendi sua mensagem. Um de nossos atendentes entrará em contato em breve.',
  businessHours: '09:00-18:00',
  timezone: 'America/Sao_Paulo',
  enableTypingIndicator: true,
  enableReadReceipts: true,
  autoTransferEnabled: true,
  transferThreshold: 3
};

export const ChatbotProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [settings, setSettings] = useState<ChatbotSettings>(defaultSettings);
  const [interactions, setInteractions] = useState<ChatbotInteraction[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load initial data
  useEffect(() => {
    loadChatbots();
    loadSettings();
    loadInteractions();
  }, []);

  const loadChatbots = async () => {
    setLoading(true);
    try {
      // Simulate API call - replace with actual API
      const mockChatbots: Chatbot[] = [
        {
          id: '1',
          name: 'Atendimento Inicial',
          description: 'Bot para primeiros contatos e apresentação da empresa',
          type: 'simple',
          isActive: true,
          triggers: [
            { id: '1', phrase: 'oi', isActive: true },
            { id: '2', phrase: 'olá', isActive: true },
            { id: '3', phrase: 'bom dia', isActive: true }
          ],
          responses: [
            { id: '1', message: 'Olá! Bem-vindo à nossa empresa. Como posso ajudá-lo?', variables: [], order: 1 }
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
          analytics: {
            totalInteractions: 89,
            successRate: 85,
            averageResponseTime: 1.2,
            topTriggers: [{ trigger: 'oi', count: 45 }],
            interactionsByDay: []
          }
        }
      ];
      setChatbots(mockChatbots);
    } catch (error) {
      toast({
        title: "Erro ao carregar chatbots",
        description: "Não foi possível carregar os chatbots.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      // Load from localStorage or API
      const savedSettings = localStorage.getItem('chatbot-settings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadInteractions = async () => {
    try {
      // Simulate loading interactions
      setInteractions([]);
    } catch (error) {
      console.error('Error loading interactions:', error);
    }
  };

  const createChatbot = async (chatbotData: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'analytics'>) => {
    try {
      const newChatbot: Chatbot = {
        ...chatbotData,
        id: Date.now().toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        analytics: {
          totalInteractions: 0,
          successRate: 0,
          averageResponseTime: 0,
          topTriggers: [],
          interactionsByDay: []
        }
      };
      
      setChatbots(prev => [...prev, newChatbot]);
      
      toast({
        title: "Chatbot criado",
        description: `${newChatbot.name} foi criado com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao criar chatbot",
        description: "Não foi possível criar o chatbot.",
        variant: "destructive",
      });
    }
  };

  const updateChatbot = async (id: string, updates: Partial<Chatbot>) => {
    try {
      setChatbots(prev => prev.map(bot => 
        bot.id === id 
          ? { ...bot, ...updates, updatedAt: new Date(), version: bot.version + 1 }
          : bot
      ));
      
      toast({
        title: "Chatbot atualizado",
        description: "As alterações foram salvas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar chatbot",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
    }
  };

  const deleteChatbot = async (id: string) => {
    try {
      setChatbots(prev => prev.filter(bot => bot.id !== id));
      
      toast({
        title: "Chatbot excluído",
        description: "O chatbot foi excluído com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir chatbot",
        description: "Não foi possível excluir o chatbot.",
        variant: "destructive",
      });
    }
  };

  const duplicateChatbot = async (id: string) => {
    try {
      const original = chatbots.find(bot => bot.id === id);
      if (!original) return;

      const duplicate: Chatbot = {
        ...original,
        id: Date.now().toString(),
        name: `${original.name} (Cópia)`,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        analytics: {
          totalInteractions: 0,
          successRate: 0,
          averageResponseTime: 0,
          topTriggers: [],
          interactionsByDay: []
        }
      };
      
      setChatbots(prev => [...prev, duplicate]);
      
      toast({
        title: "Chatbot duplicado",
        description: `${duplicate.name} foi criado com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao duplicar chatbot",
        description: "Não foi possível duplicar o chatbot.",
        variant: "destructive",
      });
    }
  };

  const toggleChatbot = async (id: string) => {
    try {
      setChatbots(prev => prev.map(bot => 
        bot.id === id 
          ? { ...bot, isActive: !bot.isActive, updatedAt: new Date() }
          : bot
      ));
      
      const chatbot = chatbots.find(bot => bot.id === id);
      toast({
        title: `Chatbot ${chatbot?.isActive ? 'desativado' : 'ativado'}`,
        description: `${chatbot?.name} foi ${chatbot?.isActive ? 'desativado' : 'ativado'} com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao alterar status",
        description: "Não foi possível alterar o status do chatbot.",
        variant: "destructive",
      });
    }
  };

  const updateSettings = async (newSettings: Partial<ChatbotSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);
      localStorage.setItem('chatbot-settings', JSON.stringify(updatedSettings));
      
      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar configurações",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
    }
  };

  const testChatbot = async (id: string, message: string): Promise<string> => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      if (!chatbot) throw new Error('Chatbot não encontrado');

      // Simple trigger matching
      const matchedTrigger = chatbot.triggers.find(trigger => 
        trigger.isActive && message.toLowerCase().includes(trigger.phrase.toLowerCase())
      );

      if (matchedTrigger && chatbot.responses.length > 0) {
        return chatbot.responses[0].message;
      }

      return settings.fallbackMessage;
    } catch (error) {
      throw new Error('Erro ao testar chatbot');
    }
  };

  const getChatbotAnalytics = async (id: string) => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      return chatbot?.analytics || null;
    } catch (error) {
      throw new Error('Erro ao carregar analytics');
    }
  };

  const exportChatbot = async (id: string): Promise<string> => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      if (!chatbot) throw new Error('Chatbot não encontrado');

      return JSON.stringify(chatbot, null, 2);
    } catch (error) {
      throw new Error('Erro ao exportar chatbot');
    }
  };

  const importChatbot = async (data: string) => {
    try {
      const chatbotData = JSON.parse(data);
      await createChatbot({
        ...chatbotData,
        name: `${chatbotData.name} (Importado)`
      });
    } catch (error) {
      throw new Error('Erro ao importar chatbot');
    }
  };

  return (
    <ChatbotContext.Provider value={{
      chatbots,
      settings,
      interactions,
      loading,
      createChatbot,
      updateChatbot,
      deleteChatbot,
      duplicateChatbot,
      toggleChatbot,
      updateSettings,
      testChatbot,
      getChatbotAnalytics,
      exportChatbot,
      importChatbot
    }}>
      {children}
    </ChatbotContext.Provider>
  );
};
