import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
  score: number;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  revenue?: number;
  cost?: number;
  tags: string[];
  notes: string[];
  customFields: Record<string, any>;
  activities: LeadActivity[];
  assignedTo?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
}

interface LeadActivity {
  id: string;
  type: 'email' | 'call' | 'meeting' | 'note' | 'status_change' | 'conversion';
  description: string;
  createdAt: string;
  createdBy: string;
  metadata?: Record<string, any>;
}

interface LeadFilters {
  sources?: string[];
  statuses?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  scoreRange?: {
    min: number;
    max: number;
  };
  tags?: string[];
  assignedTo?: string[];
  search?: string;
}

interface LeadSortOptions {
  field: 'createdAt' | 'updatedAt' | 'score' | 'name' | 'revenue';
  direction: 'asc' | 'desc';
}

interface UseLeadTrackingOptions {
  filters?: LeadFilters;
  sort?: LeadSortOptions;
  pagination?: {
    page: number;
    limit: number;
  };
  realTime?: boolean;
}

// Simulação de API
const fetchLeads = async (options: UseLeadTrackingOptions): Promise<{
  leads: Lead[];
  total: number;
  page: number;
  totalPages: number;
}> => {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const sources = ['Google Ads', 'Facebook Ads', 'Organic Search', 'Direct', 'Email', 'LinkedIn', 'Referral'];
  const statuses: Lead['status'][] = ['new', 'contacted', 'qualified', 'converted', 'lost'];
  const users = ['user1', 'user2', 'user3'];
  
  // Gerar leads simulados
  const allLeads: Lead[] = [];
  
  for (let i = 0; i < 500; i++) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30));
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const isConverted = status === 'converted';
    
    const lead: Lead = {
      id: `lead-${i}`,
      name: `Lead ${i + 1}`,
      email: `lead${i + 1}@example.com`,
      phone: Math.random() > 0.3 ? `+55 11 9${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}` : undefined,
      source,
      status,
      score: Math.floor(Math.random() * 100),
      createdAt: createdAt.toISOString(),
      updatedAt: new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      convertedAt: isConverted ? new Date(createdAt.getTime() + Math.random() * 14 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      revenue: isConverted ? Math.floor(Math.random() * 10000) + 500 : undefined,
      cost: Math.floor(Math.random() * 200) + 20,
      tags: ['tag1', 'tag2', 'tag3'].slice(0, Math.floor(Math.random() * 4)),
      notes: [
        'Primeiro contato realizado',
        'Interessado no produto premium',
        'Solicitou proposta'
      ].slice(0, Math.floor(Math.random() * 4)),
      customFields: {
        company: `Company ${i + 1}`,
        position: ['Manager', 'Director', 'CEO', 'Analyst'][Math.floor(Math.random() * 4)],
        budget: Math.floor(Math.random() * 50000) + 5000
      },
      activities: [
        {
          id: `activity-${i}-1`,
          type: 'email',
          description: 'Email de boas-vindas enviado',
          createdAt: createdAt.toISOString(),
          createdBy: 'system'
        },
        {
          id: `activity-${i}-2`,
          type: 'call',
          description: 'Primeira ligação realizada',
          createdAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          createdBy: users[Math.floor(Math.random() * users.length)]
        }
      ],
      assignedTo: Math.random() > 0.2 ? users[Math.floor(Math.random() * users.length)] : undefined,
      lastContactAt: Math.random() > 0.3 ? new Date(createdAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      nextFollowUpAt: Math.random() > 0.5 ? new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString() : undefined
    };
    
    allLeads.push(lead);
  }
  
  // Aplicar filtros
  let filteredLeads = allLeads;
  
  if (options.filters) {
    const { sources, statuses, dateRange, scoreRange, tags, assignedTo, search } = options.filters;
    
    if (sources?.length) {
      filteredLeads = filteredLeads.filter(lead => sources.includes(lead.source));
    }
    
    if (statuses?.length) {
      filteredLeads = filteredLeads.filter(lead => statuses.includes(lead.status));
    }
    
    if (dateRange) {
      filteredLeads = filteredLeads.filter(lead => {
        const leadDate = new Date(lead.createdAt);
        return leadDate >= dateRange.start && leadDate <= dateRange.end;
      });
    }
    
    if (scoreRange) {
      filteredLeads = filteredLeads.filter(lead => 
        lead.score >= scoreRange.min && lead.score <= scoreRange.max
      );
    }
    
    if (tags?.length) {
      filteredLeads = filteredLeads.filter(lead => 
        tags.some(tag => lead.tags.includes(tag))
      );
    }
    
    if (assignedTo?.length) {
      filteredLeads = filteredLeads.filter(lead => 
        lead.assignedTo && assignedTo.includes(lead.assignedTo)
      );
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLeads = filteredLeads.filter(lead => 
        lead.name.toLowerCase().includes(searchLower) ||
        lead.email.toLowerCase().includes(searchLower) ||
        lead.source.toLowerCase().includes(searchLower)
      );
    }
  }
  
  // Aplicar ordenação
  if (options.sort) {
    const { field, direction } = options.sort;
    filteredLeads.sort((a, b) => {
      let aValue: any = a[field];
      let bValue: any = b[field];
      
      if (field === 'createdAt' || field === 'updatedAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }
      
      if (direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }
  
  // Aplicar paginação
  const page = options.pagination?.page || 1;
  const limit = options.pagination?.limit || 20;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  const paginatedLeads = filteredLeads.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredLeads.length / limit);
  
  return {
    leads: paginatedLeads,
    total: filteredLeads.length,
    page,
    totalPages
  };
};

const updateLeadStatus = async (leadId: string, status: Lead['status']): Promise<Lead> => {
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Simular atualização
  return {
    id: leadId,
    status,
    updatedAt: new Date().toISOString()
  } as Lead;
};

const addLeadNote = async (leadId: string, note: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 200));
};

const assignLead = async (leadId: string, userId: string): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 200));
};

export const useLeadTracking = (options: UseLeadTrackingOptions = {}) => {
  const queryClient = useQueryClient();
  
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['leads', options],
    queryFn: () => fetchLeads(options),
    refetchInterval: options.realTime ? 10000 : false,
    staleTime: 5000
  });

  // Mutation para atualizar status do lead
  const updateStatusMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: Lead['status'] }) => 
      updateLeadStatus(leadId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  // Mutation para adicionar nota
  const addNoteMutation = useMutation({
    mutationFn: ({ leadId, note }: { leadId: string; note: string }) => 
      addLeadNote(leadId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  // Mutation para atribuir lead
  const assignMutation = useMutation({
    mutationFn: ({ leadId, userId }: { leadId: string; userId: string }) => 
      assignLead(leadId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });

  // Funções de conveniência
  const updateLeadStatus = useCallback((leadId: string, status: Lead['status']) => {
    return updateStatusMutation.mutateAsync({ leadId, status });
  }, [updateStatusMutation]);

  const addNote = useCallback((leadId: string, note: string) => {
    return addNoteMutation.mutateAsync({ leadId, note });
  }, [addNoteMutation]);

  const assignLead = useCallback((leadId: string, userId: string) => {
    return assignMutation.mutateAsync({ leadId, userId });
  }, [assignMutation]);

  // Estatísticas dos leads
  const stats = useMemo(() => {
    if (!data?.leads) return null;

    const leads = data.leads;
    const statusCounts = leads.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sourceCounts = leads.reduce((acc, lead) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageScore = leads.length > 0 
      ? leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length 
      : 0;

    const conversionRate = leads.length > 0 
      ? (statusCounts.converted || 0) / leads.length * 100 
      : 0;

    const totalRevenue = leads
      .filter(lead => lead.status === 'converted')
      .reduce((sum, lead) => sum + (lead.revenue || 0), 0);

    return {
      statusCounts,
      sourceCounts,
      averageScore,
      conversionRate,
      totalRevenue,
      totalLeads: leads.length
    };
  }, [data?.leads]);

  return {
    leads: data?.leads || [],
    total: data?.total || 0,
    page: data?.page || 1,
    totalPages: data?.totalPages || 1,
    stats,
    isLoading,
    error,
    refetch,
    updateLeadStatus,
    addNote,
    assignLead,
    isUpdating: updateStatusMutation.isPending || addNoteMutation.isPending || assignMutation.isPending
  };
};

// Hook para lead individual
export const useLead = (leadId: string) => {
  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      // Simular busca de lead individual
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const leads = await fetchLeads({});
      return leads.leads.find(lead => lead.id === leadId) || null;
    },
    enabled: !!leadId
  });
};

// Hook para atividades do lead
export const useLeadActivities = (leadId: string) => {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Simular atividades do lead
      const activities: LeadActivity[] = [
        {
          id: 'activity-1',
          type: 'email',
          description: 'Email de boas-vindas enviado',
          createdAt: new Date().toISOString(),
          createdBy: 'system'
        },
        {
          id: 'activity-2',
          type: 'call',
          description: 'Primeira ligação realizada',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          createdBy: 'user1'
        },
        {
          id: 'activity-3',
          type: 'note',
          description: 'Lead demonstrou interesse no produto premium',
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          createdBy: 'user1'
        }
      ];
      
      return activities;
    },
    enabled: !!leadId
  });
};

// Hook para métricas de performance do usuário
export const useUserPerformance = (userId: string, dateRange: { start: Date; end: Date }) => {
  return useQuery({
    queryKey: ['user-performance', userId, dateRange],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Simular métricas de performance
      return {
        leadsAssigned: Math.floor(Math.random() * 50) + 10,
        leadsContacted: Math.floor(Math.random() * 40) + 8,
        leadsConverted: Math.floor(Math.random() * 10) + 2,
        totalRevenue: Math.floor(Math.random() * 50000) + 10000,
        averageResponseTime: Math.floor(Math.random() * 120) + 30, // minutos
        conversionRate: Math.random() * 20 + 5, // porcentagem
        activitiesCount: Math.floor(Math.random() * 100) + 20
      };
    },
    enabled: !!userId
  });
};