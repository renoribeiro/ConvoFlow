import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { useSupabaseQuery } from './useSupabaseQuery';
import { 
  getMockReportTemplates, 
  getMockReportSchedules, 
  getMockReportExecutions,
  addMockReportTemplate,
  addMockReportSchedule,
  updateMockReportSchedule,
  removeMockReportSchedule,
  type MockReportTemplate,
  type MockReportSchedule,
  type MockReportExecution
} from '@/data/mockReportsData';

// Interfaces para tipos de dados
export interface ReportTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  category?: string;
  type: 'chart' | 'table' | 'metric' | 'dashboard';
  config: any;
  is_public: boolean;
  created_by?: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportData {
  id: string;
  tenant_id: string;
  template_id?: string;
  name: string;
  data: any;
  metadata?: any;
  generated_at: string;
  expires_at?: string;
}

export interface MetricsCache {
  id: string;
  tenant_id: string;
  metric_key: string;
  metric_value: any;
  time_range?: string;
  cached_at: string;
  expires_at?: string;
}

export interface ReportSchedule {
  id: string;
  tenant_id: string;
  template_id: string;
  name: string;
  description?: string;
  cron_expression: string;
  recipients: string[];
  parameters?: any;
  is_active: boolean;
  last_run?: string;
  next_run?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportExecution {
  id: string;
  tenant_id: string;
  template_id: string;
  schedule_id?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  execution_time?: number;
  error_message?: string;
  output_data?: any;
  created_at: string;
}

// Hook para buscar templates de relatórios com fallback para dados mockados
export function useReportTemplates(options?: {
  category?: string;
  type?: string;
  includePublic?: boolean;
}) {
  const { tenant, loading: tenantLoading } = useTenant();
  
  return useQuery({
    queryKey: ['report-templates', options, tenant?.id],
    queryFn: async () => {
      try {
        // Verificar se há uma sessão autenticada
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user || !tenant?.id) {
          // Se não há sessão ou tenant, usar dados mockados
          const mockData = getMockReportTemplates({
            type: options?.type,
          });
          return mockData;
        }
        
        // Fazer consulta com usuário autenticado
        let query = supabase
          .from('report_templates')
          .select('*');
        
        // Aplicar filtros
        if (options?.includePublic) {
          query = query.or(`tenant_id.eq.${tenant.id},is_public.eq.true`);
        } else {
          query = query.eq('tenant_id', tenant.id);
        }
        
        if (options?.category) {
          query = query.eq('category', options.category);
        }
        
        if (options?.type) {
          query = query.eq('type', options.type);
        }
        
        const { data, error } = await query.order('usage_count', { ascending: false });
        
        if (error) {
          console.error('Erro ao buscar templates:', error);
          // Fallback para dados mockados em caso de erro
          const mockData = getMockReportTemplates({
            type: options?.type,
          });
          return mockData;
        }
        
        return data || [];
      } catch (error) {
        console.error('Erro não tratado ao buscar templates:', error);
        // Fallback final para dados mockados
        const mockData = getMockReportTemplates({
          type: options?.type,
        });
        return mockData;
      }
    },
    enabled: !tenantLoading, // Só executa quando o tenant não está carregando
    staleTime: 5 * 60 * 1000,
  });
}

// Hook para buscar um template específico
export function useReportTemplate(id: string) {
  return useSupabaseQuery({
    table: 'report_templates',
    queryKey: ['report-template', id],
    select: '*',
    filters: [{ column: 'id', operator: 'eq', value: id }],
    enabled: !!id,
  });
}

// Hook para gerar relatório
export function useGenerateReport() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ templateId, config }: { templateId: string; config: any }) => {
      const { data, error } = await supabase
        .from('report_executions')
        .insert({
          template_id: templateId,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Relatório gerado',
        description: 'O relatório foi gerado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-executions'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao gerar relatório',
        description: 'Ocorreu um erro ao gerar o relatório.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para deletar template
export function useDeleteReportTemplate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from('report_templates')
        .delete()
        .eq('id', templateId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Template excluído',
        description: 'O template foi excluído com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir template',
        description: 'Ocorreu um erro ao excluir o template.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para criar template de relatório
export function useCreateReportTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (templateData: Omit<ReportTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'created_by'>) => {
      // Tentar usar Supabase primeiro
      try {
        const { data, error } = await supabase
          .from('report_templates')
          .insert({
            ...templateData,
            tenant_id: tenant?.id,
            usage_count: 0
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } catch (error) {
        console.log('Usando dados mockados para criar template:', error);
        // Fallback para dados mockados
        return addMockReportTemplate({
          ...templateData,
          tenant_id: tenant?.id || 'tenant-1',
          template_type: 'custom'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
      toast({
        title: 'Sucesso',
        description: 'Template de relatório criado com sucesso',
      });
    },
    onError: (error) => {
      console.error('Erro ao criar template:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao criar template de relatório',
        variant: 'destructive',
      });
    },
  });
}

// Hook para buscar agendamentos
export function useReportSchedules(templateId?: string) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['report-schedules', templateId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        return getMockReportSchedules({ templateId });
      }
      
      try {
        let query = supabase
          .from('report_schedules')
          .select('*, report_templates(name, type)')
          .eq('tenant_id', tenant.id);
        
        if (templateId) {
          query = query.eq('template_id', templateId);
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
          console.warn('Erro ao buscar agendamentos, usando dados mockados:', error);
          return getMockReportSchedules({ templateId });
        }
        
        return data || [];
      } catch (error) {
        console.warn('Erro na consulta de agendamentos, usando dados mockados:', error);
        return getMockReportSchedules({ templateId });
      }
    },
    enabled: true,
  });
}

// Hook para criar agendamento
export function useCreateReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (scheduleData: Partial<ReportSchedule>) => {
      if (!tenant?.id) {
        const mockSchedule = addMockReportSchedule({
          ...scheduleData,
          tenant_id: 'mock-tenant',
          id: `mock-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as MockReportSchedule);
        return mockSchedule;
      }
      
      const { data, error } = await supabase
        .from('report_schedules')
        .insert({
          ...scheduleData,
          tenant_id: tenant.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento criado',
        description: 'O agendamento foi criado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar agendamento',
        description: 'Ocorreu um erro ao criar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para atualizar agendamento
export function useUpdateReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ReportSchedule> & { id: string }) => {
      if (!tenant?.id) {
        return updateMockReportSchedule(id, updates);
      }
      
      const { data, error } = await supabase
        .from('report_schedules')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento atualizado',
        description: 'O agendamento foi atualizado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar agendamento',
        description: 'Ocorreu um erro ao atualizar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para deletar agendamento
export function useDeleteReportSchedule() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) {
        removeMockReportSchedule(id);
        return;
      }
      
      const { error } = await supabase
        .from('report_schedules')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Agendamento excluído',
        description: 'O agendamento foi excluído com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir agendamento',
        description: 'Ocorreu um erro ao excluir o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

// Hook para alternar status de agendamento
export function useToggleReportSchedule() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!tenant?.id) {
        // Para dados mockados, usar a função de atualização mock
        const updatedSchedule = updateMockReportSchedule(id, { is_active: isActive });
        if (!updatedSchedule) {
          throw new Error('Agendamento não encontrado');
        }
        return updatedSchedule;
      }

      const { data, error } = await supabase
        .from('report_schedules')
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) {
        console.error('Erro ao atualizar status do agendamento:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['report-schedules'] });
      toast({
        title: "Sucesso",
        description: `Agendamento ${data.is_active ? 'ativado' : 'desativado'} com sucesso.`,
      });
    },
    onError: (error) => {
      console.error('Erro ao alterar status do agendamento:', error);
      toast({
        title: "Erro",
        description: "Erro ao alterar status do agendamento.",
        variant: "destructive",
      });
    },
  });
}

// Hook para buscar execuções
export function useReportExecutions(templateId?: string) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['report-executions', templateId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        return getMockReportExecutions({ templateId });
      }
      
      try {
        let query = supabase
          .from('report_executions')
          .select('*, report_templates(name, type)')
          .eq('tenant_id', tenant.id);
        
        if (templateId) {
          query = query.eq('template_id', templateId);
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
          console.warn('Erro ao buscar execuções, usando dados mockados:', error);
          return getMockReportExecutions({ templateId });
        }
        
        return data || [];
      } catch (error) {
        console.warn('Erro na consulta de execuções, usando dados mockados:', error);
        return getMockReportExecutions({ templateId });
      }
    },
    enabled: true,
  });
}