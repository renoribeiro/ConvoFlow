import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import stripeMcpService from '@/services/stripeMcpService';
import {
  TrendingUp,
  DollarSign,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw
} from 'lucide-react';

interface TransactionStats {
  total_transactions: number;
  total_amount: number;
  total_fees: number;
  net_amount: number;
  commission_amount: number;
  successful_transactions: number;
  failed_transactions: number;
  pending_transactions: number;
  average_transaction_value: number;
}

const TransactionStatistics = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [tenantId, setTenantId] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const statsData = await stripeMcpService.getTransactionStats(
        tenantId || 'default',
        dateRange.startDate || undefined,
        dateRange.endDate || undefined
      );
      setStats(statsData);
    } catch (error: any) {
      console.error('Erro ao carregar estatísticas:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar estatísticas: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(amount / 100); // Stripe amounts are in cents
  };

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return '0%';
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Estatísticas de Transações Stripe
          </CardTitle>
          <CardDescription>
            Visualize o desempenho das transações processadas pelo Stripe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data Inicial</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Data Final</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID (opcional)</Label>
              <Input
                id="tenantId"
                placeholder="Deixe vazio para todos"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={loadStats} disabled={isLoading}>
              {isLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar Estatísticas
            </Button>
          </div>
        </CardContent>
      </Card>

      {stats && (
        <>
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total de Transações</p>
                    <p className="text-2xl font-bold">{stats.total_transactions}</p>
                  </div>
                  <CreditCard className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Valor Total</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.total_amount)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Valor Líquido</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.net_amount)}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Comissões</p>
                    <p className="text-2xl font-bold">{formatCurrency(stats.commission_amount)}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status das Transações */}
          <Card>
            <CardHeader>
              <CardTitle>Status das Transações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium">Bem-sucedidas</span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{stats.successful_transactions}</p>
                    <p className="text-sm text-gray-600">
                      {formatPercentage(stats.successful_transactions, stats.total_transactions)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="font-medium">Falharam</span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{stats.failed_transactions}</p>
                    <p className="text-sm text-gray-600">
                      {formatPercentage(stats.failed_transactions, stats.total_transactions)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <span className="font-medium">Pendentes</span>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{stats.pending_transactions}</p>
                    <p className="text-sm text-gray-600">
                      {formatPercentage(stats.pending_transactions, stats.total_transactions)}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Métricas Adicionais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Valor Médio por Transação</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-600">
                  {formatCurrency(stats.average_transaction_value)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Taxas do Stripe</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-600">
                  {formatCurrency(stats.total_fees)}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {formatPercentage(stats.total_fees, stats.total_amount)} do valor total
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!stats && !isLoading && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">Nenhuma estatística disponível. Clique em "Atualizar Estatísticas" para carregar os dados.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TransactionStatistics;