
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Clock, Mail, MessageSquare, FileText, Search, Filter, Download } from 'lucide-react';

interface DeliveryEntry {
  id: string;
  reportName: string;
  method: 'email' | 'whatsapp' | 'dashboard';
  recipient: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  errorMessage?: string;
  fileSize?: string;
  downloadCount?: number;
}

const mockDeliveries: DeliveryEntry[] = [
  {
    id: '1',
    reportName: 'Relatório de Performance Geral',
    method: 'email',
    recipient: 'joao@empresa.com',
    status: 'success',
    timestamp: '20/11/2024 - 09:00',
    fileSize: '2.3 MB',
    downloadCount: 3
  },
  {
    id: '2',
    reportName: 'Relatório de Performance Geral',
    method: 'whatsapp',
    recipient: '+55 11 99999-0000',
    status: 'success',
    timestamp: '20/11/2024 - 09:01',
  },
  {
    id: '3',
    reportName: 'Análise de Fontes de Tráfego',
    method: 'email',
    recipient: 'marketing@empresa.com',
    status: 'failed',
    timestamp: '20/11/2024 - 08:30',
    errorMessage: 'Endereço de email inválido',
    fileSize: '1.8 MB'
  },
  {
    id: '4',
    reportName: 'Funil de Conversão',
    method: 'whatsapp',
    recipient: '+55 11 88888-0000',
    status: 'pending',
    timestamp: '20/11/2024 - 17:00',
  },
  {
    id: '5',
    reportName: 'Relatório Financeiro',
    method: 'email',
    recipient: 'financeiro@empresa.com',
    status: 'success',
    timestamp: '19/11/2024 - 10:00',
    fileSize: '3.1 MB',
    downloadCount: 1
  },
  {
    id: '6',
    reportName: 'Performance de Campanhas',
    method: 'dashboard',
    recipient: 'Sistema',
    status: 'success',
    timestamp: '20/11/2024 - 06:30',
  }
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-600" />;
    case 'pending': return <Clock className="w-4 h-4 text-yellow-600" />;
    default: return null;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success': return <Badge className="bg-green-100 text-green-800">Sucesso</Badge>;
    case 'failed': return <Badge variant="destructive">Falhou</Badge>;
    case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>;
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
  const [deliveries, setDeliveries] = useState<DeliveryEntry[]>(mockDeliveries);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = delivery.reportName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.recipient.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    const matchesMethod = methodFilter === 'all' || delivery.method === methodFilter;
    
    return matchesSearch && matchesStatus && matchesMethod;
  });

  const stats = {
    total: deliveries.length,
    success: deliveries.filter(d => d.status === 'success').length,
    failed: deliveries.filter(d => d.status === 'failed').length,
    pending: deliveries.filter(d => d.status === 'pending').length
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Entregas</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Sucessos</p>
                <p className="text-2xl font-bold text-green-600">{stats.success}</p>
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
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
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
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Métodos</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="dashboard">Dashboard</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar Log
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Entregas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredDeliveries.map((delivery) => (
              <div key={delivery.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(delivery.status)}
                    {getMethodIcon(delivery.method)}
                  </div>
                  
                  <div>
                    <h4 className="font-medium">{delivery.reportName}</h4>
                    <p className="text-sm text-muted-foreground">
                      Para: {delivery.recipient}
                    </p>
                    {delivery.errorMessage && (
                      <p className="text-sm text-red-600 mt-1">
                        Erro: {delivery.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{delivery.timestamp}</p>
                    {delivery.fileSize && (
                      <p className="text-xs text-muted-foreground">
                        {delivery.fileSize}
                        {delivery.downloadCount && ` • ${delivery.downloadCount} downloads`}
                      </p>
                    )}
                  </div>
                  
                  {getStatusBadge(delivery.status)}
                </div>
              </div>
            ))}
          </div>

          {filteredDeliveries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma entrega encontrada com os filtros aplicados.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
