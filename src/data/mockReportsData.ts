// Mock data for reports functionality when RLS policies block access

export interface MockReportTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  type: 'chart' | 'table' | 'metric' | 'dashboard';
  template_type: 'standard' | 'custom';
  config: any;
  is_public: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
  tenant_id: string;
}

export interface MockReportSchedule {
  id: string;
  template_id: string;
  name: string;
  description?: string | null;
  cron_expression: string;
  recipients: string[];
  parameters?: any;
  is_active: boolean;
  last_run?: string | null;
  next_run?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  report_templates?: {
    name: string;
    type: string;
  };
}

export interface MockReportExecution {
  id: string;
  template_id: string;
  schedule_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  execution_time: number | null;
  error_message: string | null;
  output_data: any;
  created_at: string;
  tenant_id: string;
  template?: MockReportTemplate;
}

// Mock Report Templates
export const mockReportTemplates: MockReportTemplate[] = [
  {
    id: '1',
    name: 'Relatório de Vendas Mensais',
    description: 'Relatório detalhado das vendas realizadas no mês',
    category: 'financial',
    type: 'table',
    template_type: 'standard',
    config: {
      fields: ['date', 'product', 'quantity', 'revenue'],
      filters: ['month', 'category'],
      charts: ['line', 'bar']
    },
    is_public: true,
    usage_count: 45,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T14:30:00Z',
    tenant_id: 'tenant-1'
  },
  {
    id: '2',
    name: 'Análise de Performance de Campanhas',
    description: 'Métricas de performance das campanhas de marketing',
    category: 'marketing',
    type: 'chart',
    template_type: 'custom',
    config: {
      fields: ['campaign_name', 'impressions', 'clicks', 'conversions', 'ctr', 'conversion_rate'],
      filters: ['date_range', 'campaign_type'],
      charts: ['pie', 'funnel']
    },
    is_public: false,
    usage_count: 23,
    created_at: '2024-01-10T09:15:00Z',
    updated_at: '2024-01-18T16:45:00Z',
    tenant_id: 'tenant-1'
  },
  {
    id: '3',
    name: 'Dashboard Executivo',
    description: 'Visão geral dos principais KPIs da empresa',
    category: 'performance',
    type: 'dashboard',
    template_type: 'standard',
    config: {
      fields: ['revenue', 'profit', 'customers', 'orders'],
      filters: ['period'],
      charts: ['gauge', 'trend']
    },
    is_public: true,
    usage_count: 67,
    created_at: '2024-01-05T08:00:00Z',
    updated_at: '2024-01-22T11:20:00Z',
    tenant_id: 'tenant-1'
  }
];

// Mock Report Schedules
export const mockReportSchedules: MockReportSchedule[] = [
  {
    id: 'schedule-1',
    template_id: '1',
    name: 'Vendas Mensais - Automático',
    description: 'Envio automático do relatório de vendas todo dia 1º do mês',
    cron_expression: '0 9 1 * *', // Todo dia 1º às 09:00
    recipients: ['gerencia@empresa.com', 'vendas@empresa.com'],
    parameters: {
      deliveryMethods: ['email'],
      frequency: 'monthly',
      dayOfMonth: 1,
      time: '09:00',
      timezone: 'America/Sao_Paulo',
      format: 'pdf'
    },
    is_active: true,
    last_run: '2024-01-01T09:00:00Z',
    next_run: '2024-02-01T09:00:00Z',
    created_by: 'user-1',
    created_at: '2023-12-15T14:00:00Z',
    updated_at: '2024-01-01T09:05:00Z',
    tenant_id: 'tenant-1',
    report_templates: {
      name: 'Relatório de Vendas Mensais',
      type: 'standard'
    }
  },
  {
    id: 'schedule-2',
    template_id: '2',
    name: 'Performance Semanal',
    description: 'Relatório semanal de performance das campanhas',
    cron_expression: '0 8 * * 1', // Toda segunda-feira às 08:00
    recipients: ['marketing@empresa.com'],
    parameters: {
      deliveryMethods: ['email', 'whatsapp'],
      frequency: 'weekly',
      dayOfWeek: 'Segunda-feira',
      time: '08:00',
      timezone: 'America/Sao_Paulo',
      format: 'pdf'
    },
    is_active: true,
    last_run: '2024-01-22T08:00:00Z',
    next_run: '2024-01-29T08:00:00Z',
    created_by: 'user-1',
    created_at: '2024-01-08T10:30:00Z',
    updated_at: '2024-01-22T08:05:00Z',
    tenant_id: 'tenant-1',
    report_templates: {
      name: 'Análise de Performance de Campanhas',
      type: 'custom'
    }
  },
  {
    id: 'schedule-3',
    template_id: '3',
    name: 'Dashboard Diário',
    description: 'Dashboard executivo enviado diariamente',
    cron_expression: '30 7 * * *', // Todos os dias às 07:30
    recipients: ['ceo@empresa.com', 'diretoria@empresa.com'],
    parameters: {
      deliveryMethods: ['email', 'dashboard'],
      frequency: 'daily',
      time: '07:30',
      timezone: 'America/Sao_Paulo',
      format: 'html'
    },
    is_active: false,
    last_run: '2024-01-20T07:30:00Z',
    next_run: null,
    created_by: 'user-1',
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-21T15:45:00Z',
    tenant_id: 'tenant-1',
    report_templates: {
      name: 'Dashboard Executivo',
      type: 'standard'
    }
  }
];

// Array para armazenar novos agendamentos criados dinamicamente
let dynamicSchedules: MockReportSchedule[] = [];

// Função para adicionar novo template
let dynamicTemplates: MockReportTemplate[] = [];

export const addMockReportTemplate = (template: Omit<MockReportTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count'>) => {
  const newTemplate: MockReportTemplate = {
    ...template,
    id: `template-${Date.now()}`,
    usage_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  dynamicTemplates.push(newTemplate);
  return newTemplate;
};

// Função para adicionar novos agendamentos aos dados mockados
export const addMockReportSchedule = (schedule: MockReportSchedule) => {
  dynamicSchedules.push(schedule);
};

// Função para atualizar agendamento existente
export const updateMockReportSchedule = (id: string, updates: Partial<MockReportSchedule>) => {
  const index = dynamicSchedules.findIndex(s => s.id === id);
  if (index !== -1) {
    dynamicSchedules[index] = { ...dynamicSchedules[index], ...updates };
    return dynamicSchedules[index];
  }
  
  const staticIndex = mockReportSchedules.findIndex(s => s.id === id);
  if (staticIndex !== -1) {
    const updated = { ...mockReportSchedules[staticIndex], ...updates };
    dynamicSchedules.push(updated);
    return updated;
  }
  
  return null;
};

// Função para remover agendamento
export const removeMockReportSchedule = (id: string) => {
  dynamicSchedules = dynamicSchedules.filter(s => s.id !== id);
};

// Mock Report Executions
export const mockReportExecutions: MockReportExecution[] = [
  {
    id: 'exec-1',
    template_id: '1',
    schedule_id: 'schedule-1',
    status: 'completed',
    started_at: '2024-01-22T09:00:00Z',
    completed_at: '2024-01-22T09:02:30Z',
    execution_time: 150000, // 2.5 minutes in milliseconds
    error_message: null,
    output_data: {
      total_records: 1250,
      file_size: '2.3MB',
      download_count: 5
    },
    created_at: '2024-01-22T09:00:00Z',
    tenant_id: 'tenant-1',
    template: mockReportTemplates[0]
  },
  {
    id: 'exec-2',
    template_id: '2',
    schedule_id: 'schedule-2',
    status: 'completed',
    started_at: '2024-01-22T08:00:00Z',
    completed_at: '2024-01-22T08:01:45Z',
    execution_time: 105000, // 1.75 minutes in milliseconds
    error_message: null,
    output_data: {
      total_records: 890,
      file_size: '1.8MB',
      download_count: 3
    },
    created_at: '2024-01-22T08:00:00Z',
    tenant_id: 'tenant-1',
    template: mockReportTemplates[1]
  },
  {
    id: 'exec-3',
    template_id: '3',
    schedule_id: null,
    status: 'failed',
    started_at: '2024-01-21T15:30:00Z',
    completed_at: '2024-01-21T15:31:20Z',
    execution_time: 80000, // 1.33 minutes in milliseconds
    error_message: 'Erro ao conectar com a fonte de dados externa',
    output_data: null,
    created_at: '2024-01-21T15:30:00Z',
    tenant_id: 'tenant-1',
    template: mockReportTemplates[2]
  },
  {
    id: 'exec-4',
    template_id: '1',
    schedule_id: null,
    status: 'running',
    started_at: '2024-01-23T10:15:00Z',
    completed_at: null,
    execution_time: null,
    error_message: null,
    output_data: null,
    created_at: '2024-01-23T10:15:00Z',
    tenant_id: 'tenant-1',
    template: mockReportTemplates[0]
  },
  {
    id: 'exec-5',
    template_id: '2',
    schedule_id: null,
    status: 'pending',
    started_at: null,
    completed_at: null,
    execution_time: null,
    error_message: null,
    output_data: null,
    created_at: '2024-01-23T11:00:00Z',
    tenant_id: 'tenant-1',
    template: mockReportTemplates[1]
  }
];

// Helper functions to simulate API responses
export const getMockReportTemplates = (filters?: { search?: string; type?: string }) => {
  let filtered = [...mockReportTemplates, ...dynamicTemplates];
  
  if (filters?.search) {
    const search = filters.search.toLowerCase();
    filtered = filtered.filter(template => 
      template.name.toLowerCase().includes(search) ||
      template.description?.toLowerCase().includes(search)
    );
  }
  
  if (filters?.type && filters.type !== 'all') {
    // Filtrar por tipo do template (chart, table, metric, dashboard)
    filtered = filtered.filter(template => template.type === filters.type);
  }
  
  return filtered;
};

export const getMockReportSchedules = (filters?: { templateId?: string; active?: boolean }) => {
  // Combinar agendamentos estáticos com dinâmicos
  let filtered = [...mockReportSchedules, ...dynamicSchedules];
  
  if (filters?.templateId) {
    filtered = filtered.filter(schedule => schedule.template_id === filters.templateId);
  }
  
  if (filters?.active !== undefined) {
    filtered = filtered.filter(schedule => schedule.is_active === filters.active);
  }
  
  return filtered;
};

export const getMockReportExecutions = (filters?: { templateId?: string; status?: string }) => {
  let filtered = [...mockReportExecutions];
  
  if (filters?.templateId) {
    filtered = filtered.filter(execution => execution.template_id === filters.templateId);
  }
  
  if (filters?.status && filters.status !== 'all') {
    filtered = filtered.filter(execution => execution.status === filters.status);
  }
  
  return filtered;
};