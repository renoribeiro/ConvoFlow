
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, Mail, MessageSquare, FileText, Search, Filter, Download, AlertCircle } from 'lucide-react';
import { useReportExecutions } from '@/hooks/useReports';
import { useToast } from '@/hooks/use-toast';

interface ReportExecution {
  id: string;
  template_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  execution_time?: number;
  error_message?: string;
  result?: any;
  config?: any;
  created_at: string;
  updated_at: string;
  report_templates?: {
    name: string;
  };
}

// Função para mapear status do banco para status de entrega
const mapExecutionStatus = (status: string) => {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'failed';
    case 'pending':
    case 'running': return 'pending';
    default: return 'pending';
  }
};

const getStatusIcon = (status: string) => {
  const mappedStatus = mapExecutionStatus(status);
  switch (mappedStatus) {
    case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-600" />;
    case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
    default: return null;
  }
};

const getStatusBadge = (status: string) => {
  const mappedStatus = mapExecutionStatus(status);
  switch (mappedStatus) {
    case 'success': return <Badge className="bg-green-100 text-green-800">Concluído</Badge>;
    case 'failed': return <Badge variant="destructive">Falhou</Badge>;
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Processando</Badge>;
    default: return null;
  }
};

const getMethodIcon = (method: string) => {
  switch (method) {
    case 'email': return <Mail className="w-4 h-4 text-blue-600" />;
    case 'whatsapp': return <MessageSquare className="w-4 h-4 text-green-600" />;
    case 'dashboard': return <FileText className="w-4 h-4 text-purple-600" />;
    default: return null;
  }
};

export const DeliveryLog = () => {
  const { data: executions = [], isLoading, error } = useReportExecutions();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredExecutions = executions.filter(execution => {
    const reportName = execution.report_templates?.name || 'Relatório sem nome';
    const matchesSearch = reportName.toLowerCase().includes(searchTerm.toLowerCase());
    const mappedStatus = mapExecutionStatus(execution.status);
    const matchesStatus = statusFilter === 'all' || mappedStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: executions.length,
    success: executions.filter(e => mapExecutionStatus(e.status) === 'success').length,
    failed: executions.filter(e => mapExecutionStatus(e.status) === 'failed').length,
    pending: executions.filter(e => mapExecutionStatus(e.status) === 'pending').length
  };

  // Mostrar erro se houver
  if (error) {
    toast({
      title: 'Erro ao carregar execuções',
      description: 'Não foi possível carregar o histórico de execuções de relatórios.',
      variant: 'destructive',
    });
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar execuções de relatórios. Tente novamente mais tarde.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Execuções</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{stats.total}</p>
                )}
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Concluídas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-green-600">{stats.success}</p>
                )}
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Falhas</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                )}
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processando</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                )}
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por relatório ou destinatário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="success">Concluído</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Processando</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar Histórico
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Execution Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Execuções</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 w-4" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Executions List */}
          {!isLoading && (
            <div className="space-y-4">
              {filteredExecutions.map((execution) => (
                <div key={execution.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(execution.status)}
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    
                    <div>
                      <h4 className="font-medium">
                        {execution.report_templates?.name || 'Relatório sem nome'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        ID: {execution.id.slice(0, 8)}...
                      </p>
                      {execution.error_message && (
                        <p className="text-sm text-red-600 mt-1">
                          Erro: {execution.error_message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {new Date(execution.started_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {execution.execution_time && (
                        <p className="text-xs text-muted-foreground">
                          {execution.execution_time}ms
                        </p>
                      )}
                      {execution.completed_at && (
                        <p className="text-xs text-muted-foreground">
                          Concluído: {new Date(execution.completed_at).toLocaleTimeString('pt-BR')}
                        </p>
                      )}
                    </div>
                    
                    {getStatusBadge(execution.status)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredExecutions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma execução encontrada</h3>
              <p>
                {executions.length === 0 
                  ? 'Ainda não há execuções de relatórios registradas.' 
                  : 'Nenhuma execução encontrada com os filtros aplicados.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
