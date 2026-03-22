import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Eye,
  Send,
  Download,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { stripeService, CommissionPayment } from '../services/stripeService';
import { useSupabaseQuery } from '../hooks/useSupabaseQuery';

interface CommissionPaymentsProps {
  affiliateId?: string;
}

const CommissionPayments: React.FC<CommissionPaymentsProps> = ({ affiliateId }) => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<CommissionPayment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStripeConfigured, setIsStripeConfigured] = useState(false);
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);
  const [statistics, setStatistics] = useState({
    totalPaid: 0,
    totalPending: 0,
    totalFailed: 0,
    totalPayments: 0,
    averagePayment: 0,
  });

  // Form state for creating new payment
  const [newPayment, setNewPayment] = useState({
    affiliate_id: '',
    amount: '',
    description: '',
    currency: 'BRL',
  });

  // Get affiliates for dropdown
  const { data: affiliates } = useSupabaseQuery({
    table: 'affiliates',
    select: 'id, name, email',
    filter: [{ column: 'is_active', operator: 'eq', value: true }],
  }) as { data: any[] | undefined };

  // Load payments and statistics
  const loadData = async () => {
    setLoading(true);
    try {
      const [paymentsData, statsData] = await Promise.all([
        stripeService.getCommissionPayments(affiliateId),
        stripeService.getPaymentStatistics(affiliateId),
      ]);
      setPayments(paymentsData);
      setStatistics(statsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar dados dos pagamentos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    checkStripeConfiguration();
  }, [affiliateId]);

  const checkStripeConfiguration = async () => {
    try {
      const configured = await stripeService.isConfigured();
      setIsStripeConfigured(configured);
    } catch (error) {
      console.error('Erro ao verificar configuração do Stripe:', error);
      setIsStripeConfigured(false);
    }
  };

  // Filter payments based on status
  const filteredPayments = payments.filter(payment => {
    if (filterStatus === 'all') return true;
    return payment.status === filterStatus;
  });

  // Get status badge variant
  const getStatusBadge = (status: CommissionPayment['status']) => {
    const variants = {
      pending: { variant: 'secondary' as const, icon: Clock, color: 'text-yellow-600' },
      processing: { variant: 'default' as const, icon: RefreshCw, color: 'text-blue-600' },
      paid: { variant: 'default' as const, icon: CheckCircle, color: 'text-green-600' },
      completed: { variant: 'default' as const, icon: CheckCircle, color: 'text-green-700' },
      failed: { variant: 'destructive' as const, icon: XCircle, color: 'text-red-600' },
      cancelled: { variant: 'secondary' as const, icon: AlertCircle, color: 'text-gray-600' },
    };

    const config = variants[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Format currency
  const formatCurrency = (amount: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  // Handle create payment
  const handleCreatePayment = async () => {
    if (!newPayment.affiliate_id || !newPayment.amount) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payment = await stripeService.createCommissionPayment(
        newPayment.affiliate_id,
        parseFloat(newPayment.amount),
        newPayment.description
      );

      if (payment) {
        toast({
          title: 'Sucesso',
          description: 'Pagamento criado com sucesso',
        });
        setIsCreateModalOpen(false);
        setNewPayment({ affiliate_id: '', amount: '', description: '', currency: 'BRL' });
        loadData();
      } else {
        throw new Error('Falha ao criar pagamento');
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao criar pagamento',
        variant: 'destructive',
      });
    }
  };

  // Handle process payments
  const handleProcessPayments = async (paymentIds: string[]) => {
    if (paymentIds.length === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos um pagamento',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await stripeService.processBulkPayments(paymentIds);

      toast({
        title: 'Processamento Concluído',
        description: `${result.successful.length} pagamentos processados com sucesso, ${result.failed.length} falharam`,
      });

      setSelectedPayments([]);
      loadData();
    } catch (error) {
      console.error('Error processing payments:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao processar pagamentos',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Stripe processing
  const handleStripeProcessing = async () => {
    if (!isStripeConfigured) {
      toast({
        title: 'Erro',
        description: 'Stripe não está configurado. Configure as chaves da API primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessingStripe(true);
    try {
      // Buscar dados dos pagamentos selecionados
      const paymentsToProcess = payments.filter(p =>
        selectedPayments.includes(p.id) && p.status === 'pending'
      );

      if (paymentsToProcess.length === 0) {
        toast({
          title: 'Aviso',
          description: 'Nenhum pagamento pendente encontrado',
          variant: 'destructive',
        });
        return;
      }

      // Preparar dados para o Stripe MCP
      const stripePayments = paymentsToProcess.map(payment => ({
        affiliateId: payment.affiliate_id,
        amount: Number(payment.amount),
        currency: payment.currency || 'BRL',
        description: `Comissão - ${(payment as any).affiliates?.name || 'Afiliado'}`
      }));

      // Processar pagamentos via Stripe MCP
      const results = await stripeService.processBatchCommissionPayments(stripePayments);

      toast({
        title: 'Sucesso',
        description: `${results.length} pagamentos processados via Stripe com sucesso!`,
      });

      // Atualizar status dos pagamentos
      for (const result of results) {
        await stripeService.updateCommissionPaymentStatus(result.id, 'processing');
      }

      setSelectedPayments([]);
      loadData();

    } catch (error: any) {
      console.error('Erro ao processar pagamentos via Stripe:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao processar pagamentos via Stripe: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessingStripe(false);
    }
  };

  // Handle bulk actions
  const handleBulkAction = async (action: string) => {
    if (selectedPayments.length === 0) {
      toast({
        title: 'Aviso',
        description: 'Selecione pelo menos um pagamento',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (action === 'process') {
        await handleProcessPayments(selectedPayments);
      } else if (action === 'process_stripe') {
        await handleStripeProcessing();
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao processar ação em lote: ' + error.message,
        variant: 'destructive',
      });
    }
  };

  // Handle select all payments
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pendingPayments = filteredPayments
        .filter(p => p.status === 'pending')
        .map(p => p.id);
      setSelectedPayments(pendingPayments);
    } else {
      setSelectedPayments([]);
    }
  };

  // Handle individual payment selection
  const handleSelectPayment = (paymentId: string, checked: boolean) => {
    if (checked) {
      setSelectedPayments(prev => [...prev, paymentId]);
    } else {
      setSelectedPayments(prev => prev.filter(id => id !== paymentId));
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(statistics.totalPaid)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendente</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {formatCurrency(statistics.totalPending)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falharam</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(statistics.totalFailed)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagamentos</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalPayments}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(statistics.averagePayment)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                Pagamentos de Comissão
                {isStripeConfigured ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Stripe Configurado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Stripe Não Configurado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Gerencie os pagamentos de comissão dos afiliados
                {!isStripeConfigured && (
                  <span className="block text-yellow-600 text-sm mt-1">
                    Configure o Stripe MCP para processar pagamentos automaticamente
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              {!affiliateId && (
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Pagamento
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions */}
          {selectedPayments.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedPayments.length} pagamento(s) selecionado(s)
                </span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleBulkAction('process')}
                    disabled={isProcessing}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Send className={`h-4 w-4 mr-2 ${isProcessing ? 'animate-spin' : ''}`} />
                    {isProcessing ? 'Processando...' : 'Processar Selecionados'}
                  </Button>
                  {isStripeConfigured && (
                    <Button
                      onClick={() => handleBulkAction('process_stripe')}
                      disabled={isProcessingStripe}
                      variant="outline"
                    >
                      <CreditCard className={`h-4 w-4 mr-2 ${isProcessingStripe ? 'animate-spin' : ''}`} />
                      {isProcessingStripe ? 'Processando Stripe...' : 'Processar via Stripe'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p => p.status === 'pending').length}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Afiliado</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Carregando pagamentos...
                  </TableCell>
                </TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-500">Nenhum pagamento encontrado</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.status === 'pending' && (
                        <Checkbox
                          checked={selectedPayments.includes(payment.id)}
                          onCheckedChange={(checked) => handleSelectPayment(payment.id, checked as boolean)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{(payment as any).affiliates?.name}</div>
                        <div className="text-sm text-gray-500">{(payment as any).affiliates?.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(payment.amount, payment.currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(payment.status)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {payment.description || '-'}
                    </TableCell>
                    <TableCell>
                      {payment.created_at ? new Date(payment.created_at).toLocaleDateString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setIsViewModalOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {payment.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleProcessPayments([payment.id])}
                            disabled={isProcessing}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Payment Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Pagamento</DialogTitle>
            <DialogDescription>
              Crie um novo pagamento de comissão para um afiliado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="affiliate">Afiliado *</Label>
              <Select
                value={newPayment.affiliate_id}
                onValueChange={(value) => setNewPayment(prev => ({ ...prev, affiliate_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um afiliado" />
                </SelectTrigger>
                <SelectContent>
                  {affiliates?.map((affiliate) => (
                    <SelectItem key={affiliate.id} value={affiliate.id}>
                      {affiliate.name} ({affiliate.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Valor *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={newPayment.amount}
                onChange={(e) => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Moeda</Label>
              <Select
                value={newPayment.currency}
                onValueChange={(value) => setNewPayment(prev => ({ ...prev, currency: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                  <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição do pagamento..."
                value={newPayment.description}
                onChange={(e) => setNewPayment(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreatePayment}>
              Criar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Payment Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Pagamento</DialogTitle>
            <DialogDescription>
              Informações detalhadas do pagamento de comissão.
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Afiliado</Label>
                  <p className="mt-1">{(selectedPayment as any).affiliates?.name}</p>
                  <p className="text-sm text-gray-500">{(selectedPayment as any).affiliates?.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Valor</Label>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedPayment.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Data de Criação</Label>
                  <p className="mt-1">
                    {selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleString('pt-BR') : '-'}
                  </p>
                </div>
              </div>
              {selectedPayment.description && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Descrição</Label>
                  <p className="mt-1">{selectedPayment.description}</p>
                </div>
              )}
              {selectedPayment.stripe_transfer_id && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">ID da Transferência Stripe</Label>
                  <p className="mt-1 font-mono text-sm">{selectedPayment.stripe_transfer_id}</p>
                </div>
              )}
              {selectedPayment.paid_at && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Data do Pagamento</Label>
                  <p className="mt-1">
                    {selectedPayment.paid_at ? new Date(selectedPayment.paid_at).toLocaleString('pt-BR') : '-'}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
              Fechar
            </Button>
            {selectedPayment?.status === 'pending' && (
              <Button
                onClick={() => {
                  if (selectedPayment) {
                    handleProcessPayments([selectedPayment.id]);
                    setIsViewModalOpen(false);
                  }
                }}
                disabled={isProcessing}
              >
                <Send className="h-4 w-4 mr-2" />
                Processar Pagamento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommissionPayments;