import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  message_template: string;
  media_url: string | null;
  status: string;
  target_tags: string[] | null;
  target_stages: string[] | null;
  delay_between_messages: number | null;
  total_recipients: number | null;
  sent_count: number | null;
  failed_count: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_instance: {
    name: string;
    status: string;
  } | null;
}

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('mass_message_campaigns')
        .select(`
          *,
          whatsapp_instance:whatsapp_instances(name, status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar campanhas',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async (campaignData: { 
    name: string; 
    message_template: string; 
    tenant_id: string; 
    whatsapp_instance_id: string;
    description?: string;
    media_url?: string;
    target_tags?: string[];
    target_stages?: string[];
    delay_between_messages?: number;
  }) => {
    try {
      const { data, error } = await supabase
        .from('mass_message_campaigns')
        .insert([campaignData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Campanha criada com sucesso',
        description: `${campaignData.name} foi criada.`
      });

      await fetchCampaigns();
      return data;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar campanha',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const updateCampaign = async (id: string, campaignData: Partial<Campaign>) => {
    try {
      const { error } = await supabase
        .from('mass_message_campaigns')
        .update(campaignData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Campanha atualizada',
        description: 'As alterações foram salvas.'
      });

      await fetchCampaigns();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar campanha',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const scheduleCampaign = async (id: string) => {
    try {
      const { error } = await supabase.rpc('schedule_campaign_messages', {
        p_campaign_id: id
      });

      if (error) throw error;

      toast({
        title: 'Campanha agendada',
        description: 'A campanha foi agendada com sucesso.'
      });

      await fetchCampaigns();
    } catch (error: any) {
      toast({
        title: 'Erro ao agendar campanha',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  const deleteCampaign = async (id: string) => {
    try {
      const { error } = await supabase
        .from('mass_message_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Campanha removida',
        description: 'A campanha foi removida com sucesso.'
      });

      await fetchCampaigns();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover campanha',
        description: error.message,
        variant: 'destructive'
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  return {
    campaigns,
    loading,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    scheduleCampaign,
    deleteCampaign
  };
}