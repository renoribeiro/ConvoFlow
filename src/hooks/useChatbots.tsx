import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Chatbot {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_phrases: string[] | null;
  response_message: string;
  response_type: string | null;
  media_url: string | null;
  whatsapp_instance_id: string | null;
  is_active: boolean | null;
  priority: number | null;
  variables: any;
  conditions: any;
  created_at: string;
  updated_at: string;
  whatsapp_instance?: {
    name: string;
    status: string;
  };
}

export function useChatbots() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchChatbots = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chatbots')
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(name, status)
        `)
        .order('priority', { ascending: false, nullsFirst: false });

      if (error) throw error;

      setChatbots(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar chatbots',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createChatbot = async (chatbotData: {
    name: string;
    response_message: string;
    tenant_id: string;
    description?: string;
    trigger_type?: string;
    trigger_phrases?: string[];
    response_type?: string;
    media_url?: string;
    whatsapp_instance_id?: string;
    is_active?: boolean;
    priority?: number;
  }) => {
    try {
      const { data, error } = await supabase
        .from('chatbots')
        .insert([chatbotData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Chatbot criado com sucesso',
        description: `${chatbotData.name} foi criado.`
      });

      await fetchChatbots();
      return data;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar chatbot',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const updateChatbot = async (id: string, chatbotData: Partial<Chatbot>) => {
    try {
      const { error } = await supabase
        .from('chatbots')
        .update(chatbotData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Chatbot atualizado',
        description: 'As alterações foram salvas.'
      });

      await fetchChatbots();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar chatbot',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const deleteChatbot = async (id: string) => {
    try {
      const { error } = await supabase
        .from('chatbots')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Chatbot removido',
        description: 'O chatbot foi removido com sucesso.'
      });

      await fetchChatbots();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover chatbot',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const toggleChatbot = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('chatbots')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: isActive ? 'Chatbot ativado' : 'Chatbot desativado',
        description: `O chatbot foi ${isActive ? 'ativado' : 'desativado'} com sucesso.`
      });

      await fetchChatbots();
    } catch (error: any) {
      toast({
        title: 'Erro ao alterar chatbot',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchChatbots();
  }, []);

  return {
    chatbots,
    loading,
    fetchChatbots,
    createChatbot,
    updateChatbot,
    deleteChatbot,
    toggleChatbot
  };
}