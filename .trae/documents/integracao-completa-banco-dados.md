# Documentação Técnica: Integração Completa das Páginas com Banco de Dados

## 1. Visão Geral do Projeto

Este documento detalha a integração completa das páginas que ainda utilizam dados mockados no ConvoFlow, transformando-as em páginas 100% funcionais conectadas ao banco de dados Supabase. O objetivo é implementar um sistema robusto de relatórios dinâmicos, tracking de leads, notificações em tempo real e melhorias de performance com padrão de excelência 10/10.

## 2. Análise das Páginas com Dados Mockados

### 2.1 Páginas Identificadas

| Página/Componente | Status Atual | Dados Mockados | Prioridade |
|-------------------|--------------|----------------|------------|
| **TrackingDashboard** | Mockado | Métricas de leads, conversões, receita | Alta |
| **AdvancedReports** | Mockado | Templates de relatórios, dados analíticos | Alta |
| **PerformanceAnalytics** | Mockado | Métricas de sistema, performance | Média |
| **SystemMonitor** | Mockado | Status de serviços, alertas | Média |
| **ApiSettings** | Mockado | Endpoints, métricas de API | Baixa |
| **MessageTemplates Analytics** | Mockado | Estatísticas de templates | Baixa |
| **ChatbotAnalytics** | Mockado | Métricas de chatbots | Baixa |

### 2.2 Impacto da Integração

- **Funcionalidade Real**: Dados em tempo real substituindo simulações
- **Performance**: Otimização de queries e cache
- **UX**: Interface responsiva com estados de loading e erro
- **Escalabilidade**: Arquitetura preparada para crescimento

## 3. Arquitetura de Banco de Dados

### 3.1 Novas Tabelas Necessárias

#### 3.1.1 Sistema de Tracking e UTMs

```sql
-- Tabela para fontes de tráfego
CREATE TABLE traffic_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('organic', 'paid', 'social', 'direct', 'referral', 'email')),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para tracking de leads
CREATE TABLE lead_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    contact_id UUID REFERENCES contacts(id),
    session_id VARCHAR(255),
    traffic_source_id UUID REFERENCES traffic_sources(id),
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),
    referrer_url TEXT,
    landing_page TEXT,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(100),
    converted BOOLEAN DEFAULT false,
    conversion_date TIMESTAMP WITH TIME ZONE,
    conversion_value DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para eventos de tracking
CREATE TABLE tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    lead_tracking_id UUID REFERENCES lead_tracking(id),
    contact_id UUID REFERENCES contacts(id),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    page_url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3.1.2 Sistema de Relatórios

```sql
-- Tabela para templates de relatórios
CREATE TABLE report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    type VARCHAR(50) CHECK (type IN ('chart', 'table', 'metric', 'dashboard')),
    config JSONB NOT NULL,
    is_public BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para dados de relatórios gerados
CREATE TABLE report_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    template_id UUID REFERENCES report_templates(id),
    name VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    metadata JSONB,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Tabela para cache de métricas
CREATE TABLE metrics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    metric_key VARCHAR(255) NOT NULL,
    metric_value JSONB NOT NULL,
    time_range VARCHAR(50),
    filters JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

#### 3.1.3 Sistema de Monitoramento

```sql
-- Tabela para métricas do sistema
CREATE TABLE system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(10,4) NOT NULL,
    unit VARCHAR(50),
    status VARCHAR(50) CHECK (status IN ('good', 'warning', 'critical')),
    threshold_value DECIMAL(10,4),
    description TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para status de serviços
CREATE TABLE service_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) CHECK (status IN ('healthy', 'warning', 'critical', 'offline')),
    uptime DECIMAL(5,2),
    response_time INTEGER,
    error_count INTEGER DEFAULT 0,
    last_check TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

-- Tabela para alertas do sistema
CREATE TABLE system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) CHECK (type IN ('info', 'warning', 'error', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    service_name VARCHAR(255),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3.1.4 Sistema de Performance de APIs

```sql
-- Tabela para endpoints de API
CREATE TABLE api_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    category VARCHAR(100),
    version VARCHAR(50),
    status VARCHAR(50) CHECK (status IN ('active', 'inactive', 'deprecated', 'beta')),
    authentication JSONB,
    rate_limit JSONB,
    headers JSONB,
    parameters JSONB,
    response_format VARCHAR(50),
    cache_ttl INTEGER,
    timeout INTEGER,
    retry_attempts INTEGER,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 100.00,
    avg_response_time INTEGER,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela para métricas de API
CREATE TABLE api_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    endpoint_id UUID REFERENCES api_endpoints(id),
    requests_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    avg_response_time INTEGER,
    peak_requests_per_minute INTEGER,
    date DATE NOT NULL,
    hour INTEGER CHECK (hour >= 0 AND hour <= 23),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.2 Índices para Performance

```sql
-- Índices para tracking
CREATE INDEX idx_lead_tracking_tenant_id ON lead_tracking(tenant_id);
CREATE INDEX idx_lead_tracking_contact_id ON lead_tracking(contact_id);
CREATE INDEX idx_lead_tracking_created_at ON lead_tracking(created_at DESC);
CREATE INDEX idx_lead_tracking_utm_campaign ON lead_tracking(utm_campaign);
CREATE INDEX idx_tracking_events_tenant_id ON tracking_events(tenant_id);
CREATE INDEX idx_tracking_events_timestamp ON tracking_events(timestamp DESC);

-- Índices para relatórios
CREATE INDEX idx_report_templates_tenant_id ON report_templates(tenant_id);
CREATE INDEX idx_report_templates_category ON report_templates(category);
CREATE INDEX idx_report_data_tenant_id ON report_data(tenant_id);
CREATE INDEX idx_report_data_generated_at ON report_data(generated_at DESC);
CREATE INDEX idx_metrics_cache_tenant_id ON metrics_cache(tenant_id);
CREATE INDEX idx_metrics_cache_key ON metrics_cache(metric_key);
CREATE INDEX idx_metrics_cache_expires_at ON metrics_cache(expires_at);

-- Índices para monitoramento
CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_service_status_name ON service_status(service_name);
CREATE INDEX idx_system_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX idx_system_alerts_resolved ON system_alerts(resolved);

-- Índices para API
CREATE INDEX idx_api_endpoints_tenant_id ON api_endpoints(tenant_id);
CREATE INDEX idx_api_metrics_tenant_id ON api_metrics(tenant_id);
CREATE INDEX idx_api_metrics_date ON api_metrics(date DESC);
CREATE INDEX idx_api_metrics_endpoint_id ON api_metrics(endpoint_id);
```

### 3.3 Views Materializadas para Performance

```sql
-- View para métricas de tracking agregadas
CREATE MATERIALIZED VIEW tracking_metrics_daily AS
SELECT 
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as total_leads,
    COUNT(*) FILTER (WHERE converted = true) as conversions,
    ROUND(COUNT(*) FILTER (WHERE converted = true) * 100.0 / COUNT(*), 2) as conversion_rate,
    SUM(conversion_value) as total_revenue,
    COUNT(DISTINCT traffic_source_id) as unique_sources
FROM lead_tracking
GROUP BY tenant_id, DATE(created_at);

-- View para performance de campanhas
CREATE MATERIALIZED VIEW campaign_performance_daily AS
SELECT 
    lt.tenant_id,
    lt.utm_campaign,
    DATE(lt.created_at) as date,
    COUNT(*) as leads,
    COUNT(*) FILTER (WHERE lt.converted = true) as conversions,
    ROUND(COUNT(*) FILTER (WHERE lt.converted = true) * 100.0 / COUNT(*), 2) as conversion_rate,
    SUM(lt.conversion_value) as revenue,
    AVG(lt.conversion_value) FILTER (WHERE lt.converted = true) as avg_order_value
FROM lead_tracking lt
WHERE lt.utm_campaign IS NOT NULL
GROUP BY lt.tenant_id, lt.utm_campaign, DATE(lt.created_at);

-- Refresh automático das views
CREATE OR REPLACE FUNCTION refresh_tracking_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tracking_metrics_daily;
    REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_performance_daily;
END;
$$ LANGUAGE plpgsql;
```

## 4. APIs e Hooks Necessários

### 4.1 Hooks para Tracking

```typescript
// hooks/useTrackingMetrics.ts
export interface TrackingMetrics {
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  trends: {
    leads: { value: number; isPositive: boolean };
    conversions: { value: number; isPositive: boolean };
    revenue: { value: number; isPositive: boolean };
    rate: { value: number; isPositive: boolean };
  };
}

export function useTrackingMetrics(dateRange?: DateRange) {
  return useEnhancedSupabaseQuery({
    table: 'tracking_metrics_daily',
    queryKey: ['tracking-metrics', dateRange],
    select: `
      date,
      total_leads,
      conversions,
      conversion_rate,
      total_revenue
    `,
    filters: dateRange ? [
      { column: 'date', operator: 'gte', value: dateRange.from },
      { column: 'date', operator: 'lte', value: dateRange.to }
    ] : [],
    order: { column: 'date', ascending: false },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

export function useTrafficSources() {
  return useEnhancedSupabaseQuery({
    table: 'traffic_sources',
    queryKey: ['traffic-sources'],
    select: `
      *,
      lead_tracking(count)
    `,
    filters: [{ column: 'is_active', operator: 'eq', value: true }],
  });
}
```

### 4.2 Hooks para Relatórios

```typescript
// hooks/useReports.ts
export function useReportTemplates() {
  return useEnhancedSupabaseQuery({
    table: 'report_templates',
    queryKey: ['report-templates'],
    select: `
      *,
      report_data(count)
    `,
    order: { column: 'usage_count', ascending: false },
  });
}

export function useGenerateReport(templateId: string, config: ReportConfig) {
  return useEnhancedSupabaseMutation({
    table: 'report_data',
    operation: 'insert',
    onSuccess: () => {
      // Invalidar cache de relatórios
      queryClient.invalidateQueries(['report-data', templateId]);
    },
  });
}

export function useMetricsCache(metricKey: string, filters?: any) {
  return useEnhancedSupabaseQuery({
    table: 'metrics_cache',
    queryKey: ['metrics-cache', metricKey, filters],
    select: 'metric_value, created_at, expires_at',
    filters: [
      { column: 'metric_key', operator: 'eq', value: metricKey },
      { column: 'expires_at', operator: 'gt', value: new Date().toISOString() }
    ],
    limit: 1,
    staleTime: 2 * 60 * 1000, // 2 minutos
  });
}
```

### 4.3 Hooks para Monitoramento

```typescript
// hooks/useSystemMonitoring.ts
export function useSystemMetrics() {
  return useEnhancedSupabaseQuery({
    table: 'system_metrics',
    queryKey: ['system-metrics'],
    select: '*',
    order: { column: 'timestamp', ascending: false },
    limit: 100,
    refetchInterval: 30 * 1000, // 30 segundos
  });
}

export function useServiceStatus() {
  return useEnhancedSupabaseQuery({
    table: 'service_status',
    queryKey: ['service-status'],
    select: '*',
    order: { column: 'last_check', ascending: false },
    refetchInterval: 60 * 1000, // 1 minuto
  });
}

export function useSystemAlerts() {
  return useEnhancedSupabaseQuery({
    table: 'system_alerts',
    queryKey: ['system-alerts'],
    select: '*',
    filters: [{ column: 'resolved', operator: 'eq', value: false }],
    order: { column: 'created_at', ascending: false },
    refetchInterval: 15 * 1000, // 15 segundos
  });
}
```

## 5. Plano de Implementação

### 5.1 Fase 1: Infraestrutura Base (Semana 1)

#### Dia 1-2: Criação das Tabelas
- [ ] Executar scripts SQL para criação das tabelas
- [ ] Configurar índices e views materializadas
- [ ] Configurar permissões RLS (Row Level Security)
- [ ] Testes de performance das queries

#### Dia 3-4: Hooks e Utilitários
- [ ] Implementar hooks para tracking
- [ ] Implementar hooks para relatórios
- [ ] Implementar hooks para monitoramento
- [ ] Criar utilitários de cache e otimização

#### Dia 5-7: Sistema de Tracking
- [ ] Integrar TrackingDashboard com dados reais
- [ ] Implementar captura de UTMs
- [ ] Configurar tracking de eventos
- [ ] Testes de integração

### 5.2 Fase 2: Sistema de Relatórios (Semana 2)

#### Dia 1-3: AdvancedReports
- [ ] Migrar templates de relatórios para banco
- [ ] Implementar geração dinâmica de relatórios
- [ ] Sistema de cache inteligente
- [ ] Interface de criação de relatórios

#### Dia 4-5: Otimização de Performance
- [ ] Implementar lazy loading
- [ ] Cache de métricas frequentes
- [ ] Otimização de queries complexas
- [ ] Monitoramento de performance

#### Dia 6-7: Testes e Refinamentos
- [ ] Testes de carga
- [ ] Ajustes de performance
- [ ] Validação de dados
- [ ] Documentação

### 5.3 Fase 3: Monitoramento e APIs (Semana 3)

#### Dia 1-3: Sistema de Monitoramento
- [ ] Integrar SystemMonitor com dados reais
- [ ] Implementar coleta de métricas
- [ ] Sistema de alertas em tempo real
- [ ] Dashboard de saúde do sistema

#### Dia 4-5: Performance Analytics
- [ ] Migrar PerformanceAnalytics
- [ ] Métricas de API em tempo real
- [ ] Monitoramento de recursos
- [ ] Alertas automáticos

#### Dia 6-7: ApiSettings
- [ ] Integrar configurações de API
- [ ] Métricas de uso de endpoints
- [ ] Sistema de rate limiting
- [ ] Documentação automática

### 5.4 Fase 4: Refinamentos e Otimizações (Semana 4)

#### Dia 1-2: Notificações em Tempo Real
- [ ] Implementar WebSockets para alertas
- [ ] Notificações push para métricas críticas
- [ ] Sistema de assinatura de eventos
- [ ] Interface de configuração de notificações

#### Dia 3-4: UX e Performance
- [ ] Estados de loading otimizados
- [ ] Skeleton screens
- [ ] Error boundaries
- [ ] Retry automático

#### Dia 5-7: Testes Finais e Deploy
- [ ] Testes end-to-end
- [ ] Testes de performance
- [ ] Validação de segurança
- [ ] Deploy gradual

## 6. Melhorias de Performance

### 6.1 Estratégias de Cache

```typescript
// utils/cache.ts
export class MetricsCache {
  private static instance: MetricsCache;
  private cache = new Map<string, { data: any; expires: number }>();

  static getInstance() {
    if (!MetricsCache.instance) {
      MetricsCache.instance = new MetricsCache();
    }
    return MetricsCache.instance;
  }

  set(key: string, data: any, ttl: number = 300000) { // 5 minutos default
    this.cache.set(key, {
      data,
      expires: Date.now() + ttl
    });
  }

  get(key: string) {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  invalidate(pattern: string) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 6.2 Otimização de Queries

```typescript
// utils/queryOptimizer.ts
export function optimizeQuery(baseQuery: any, options: {
  useCache?: boolean;
  cacheKey?: string;
  cacheTTL?: number;
  enablePagination?: boolean;
  pageSize?: number;
}) {
  const { useCache = true, cacheKey, cacheTTL = 300000 } = options;
  
  if (useCache && cacheKey) {
    const cached = MetricsCache.getInstance().get(cacheKey);
    if (cached) {
      return { data: cached, isLoading: false, error: null };
    }
  }

  return {
    ...baseQuery,
    onSuccess: (data: any) => {
      if (useCache && cacheKey) {
        MetricsCache.getInstance().set(cacheKey, data, cacheTTL);
      }
      baseQuery.onSuccess?.(data);
    }
  };
}
```

### 6.3 Lazy Loading e Virtualization

```typescript
// components/VirtualizedTable.tsx
import { FixedSizeList as List } from 'react-window';

export function VirtualizedTable({ data, columns, height = 400 }) {
  const Row = ({ index, style }) => {
    const item = data[index];
    return (
      <div style={style} className="flex border-b">
        {columns.map((column, colIndex) => (
          <div key={colIndex} className="flex-1 p-2">
            {column.render ? column.render(item[column.key], item) : item[column.key]}
          </div>
        ))}
      </div>
    );
  };

  return (
    <List
      height={height}
      itemCount={data.length}
      itemSize={50}
      overscanCount={5}
    >
      {Row}
    </List>
  );
}
```

## 7. Notificações em Tempo Real

### 7.1 Sistema de WebSockets

```typescript
// hooks/useRealTimeNotifications.ts
export function useRealTimeNotifications() {
  const { tenant } = useTenant();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_alerts',
        filter: `tenant_id=eq.${tenant.id}`
      }, (payload) => {
        const newAlert = payload.new as SystemAlert;
        setNotifications(prev => [newAlert, ...prev]);
        
        // Mostrar toast para alertas críticos
        if (newAlert.type === 'critical') {
          toast({
            title: newAlert.title,
            description: newAlert.message,
            variant: 'destructive',
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant.id]);

  return { notifications };
}
```

### 7.2 Push Notifications

```typescript
// utils/pushNotifications.ts
export class PushNotificationService {
  static async requestPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  static async sendNotification(title: string, options: NotificationOptions) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }

  static async sendCriticalAlert(alert: SystemAlert) {
    await this.sendNotification(alert.title, {
      body: alert.message,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: `alert-${alert.id}`,
      requireInteraction: true,
    });
  }
}
```

## 8. Testes e Validação

### 8.1 Testes de Performance

```typescript
// tests/performance.test.ts
describe('Performance Tests', () => {
  test('TrackingDashboard should load within 2 seconds', async () => {
    const startTime = performance.now();
    render(<TrackingDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText(/Total de Leads/)).toBeInTheDocument();
    });
    
    const loadTime = performance.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });

  test('Large dataset should render efficiently', async () => {
    const largeDataset = generateMockData(10000);
    const startTime = performance.now();
    
    render(<VirtualizedTable data={largeDataset} columns={columns} />);
    
    const renderTime = performance.now() - startTime;
    expect(renderTime).toBeLessThan(1000);
  });
});
```

### 8.2 Testes de Integração

```typescript
// tests/integration.test.ts
describe('Database Integration', () => {
  test('should fetch tracking metrics correctly', async () => {
    const { result } = renderHook(() => useTrackingMetrics());
    
    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data.totalLeads).toBeGreaterThan(0);
    });
  });

  test('should handle real-time updates', async () => {
    const { result } = renderHook(() => useRealTimeNotifications());
    
    // Simular inserção de alerta
    await supabase.from('system_alerts').insert({
      type: 'warning',
      title: 'Test Alert',
      message: 'Test message'
    });
    
    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });
  });
});
```

## 9. Monitoramento e Observabilidade

### 9.1 Métricas de Aplicação

```typescript
// utils/metrics.ts
export class ApplicationMetrics {
  static trackPageLoad(pageName: string, loadTime: number) {
    // Enviar para serviço de analytics
    analytics.track('page_load', {
      page: pageName,
      load_time: loadTime,
      timestamp: new Date().toISOString()
    });
  }

  static trackQueryPerformance(queryName: string, duration: number, success: boolean) {
    analytics.track('query_performance', {
      query: queryName,
      duration,
      success,
      timestamp: new Date().toISOString()
    });
  }

  static trackUserInteraction(action: string, component: string) {
    analytics.track('user_interaction', {
      action,
      component,
      timestamp: new Date().toISOString()
    });
  }
}
```

### 9.2 Health Checks

```typescript
// utils/healthCheck.ts
export async function performHealthCheck() {
  const checks = {
    database: await checkDatabaseConnection(),
    api: await checkApiEndpoints(),
    cache: await checkCacheService(),
    websockets: await checkWebSocketConnection()
  };

  const overallHealth = Object.values(checks).every(check => check.status === 'healthy');
  
  return {
    status: overallHealth ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  };
}

async function checkDatabaseConnection() {
  try {
    const { data, error } = await supabase.from('tenants').select('count').limit(1);
    return {
      status: error ? 'unhealthy' : 'healthy',
      responseTime: performance.now(),
      error: error?.message
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      error: err.message
    };
  }
}
```

## 10. Segurança e Permissões

### 10.1 Row Level Security (RLS)

```sql
-- Habilitar RLS para todas as novas tabelas
ALTER TABLE traffic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_metrics ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso baseadas em tenant
CREATE POLICY "Users can access their tenant's tracking data" ON lead_tracking
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()));

CREATE POLICY "Users can access their tenant's reports" ON report_templates
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()));

CREATE POLICY "Users can access their tenant's metrics" ON metrics_cache
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()));
```

### 10.2 Validação de Dados

```typescript
// schemas/tracking.ts
export const leadTrackingSchema = z.object({
  contact_id: z.string().uuid().optional(),
  session_id: z.string().min(1),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  referrer_url: z.string().url().optional(),
  landing_page: z.string().url(),
  ip_address: z.string().ip().optional(),
  user_agent: z.string().optional(),
  device_type: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
});

export const reportConfigSchema = z.object({
  data_source: z.string().min(1),
  metrics: z.array(z.string()).min(1),
  dimensions: z.array(z.string()),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'in', 'not_in']),
    value: z.any()
  })),
  chart_type: z.enum(['bar', 'line', 'pie', 'area', 'table']).optional(),
  time_range: z.object({
    type: z.enum(['relative', 'absolute']),
    value: z.string(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  }),
  grouping: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  limit: z.number().positive().optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional()
});
```

## 11. Conclusão

Esta documentação fornece um roadmap completo para transformar o ConvoFlow em uma aplicação 100% funcional com dados reais. A implementação seguirá padrões de excelência em:

- **Performance**: Queries otimizadas, cache inteligente, lazy loading
- **Escalabilidade**: Arquitetura preparada para crescimento
- **Segurança**: RLS, validação de dados, permissões granulares
- **UX**: Estados de loading, error handling, notificações em tempo real
- **Observabilidade**: Métricas, logs, health checks
- **Manutenibilidade**: Código limpo, testes abrangentes, documentação

O resultado será uma plataforma robusta, performática e pronta para produção com padrão de excelência 10/10.