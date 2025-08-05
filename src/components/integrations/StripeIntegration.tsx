import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { 
  CreditCard, 
  DollarSign, 
  Users, 
  TrendingUp,
  Settings,
  CheckCircle,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface StripeConfig {
  id?: string;
  publishable_key: string;
  secret_key: string;
  webhook_secret: string;
  connect_client_id: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface CommissionPayment {
  id: string;
  affiliate_id: string;
  affiliate_name: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  stripe_transfer_id?: string;
  created_at: string;
  paid_at?: string;
}

export const StripeIntegration = () => {
  const { toast } = useToast();
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [config, setConfig] = useState<StripeConfig>({
    publishable_key: '',
    secret_key: '',
    webhook_secret: '',
    connect_client_id: '',
    is_active: false
  });

  // Query para buscar configuração do Stripe
  const { data: stripeConfig, isLoading: configLoading, refetch: refetchConfig } = useSupabaseQuery({
    table: 'stripe_config',
    select: '*',
    single: true
  });

  // Query para buscar pagamentos de comissão
  const { data: commissionPayments, isLoading: paymentsLoading, refetch: refetchPayments } = useSupabaseQuery({
    table: 'commission_payments',
    select: `
      *,
      affiliates!inner(name)
    `,
    orderBy: { column: 'created_at', ascending: false }
  });

  // Mutation para salvar configuração
  const saveConfigMutation = useSupabaseMutation({
    table: 'stripe_config',
    operation: stripeConfig ? 'update' : 'insert',
    invalidateQueries: [['stripe_config']],
    successMessage: 'Configuração do Stripe salva com sucesso!'
  });

  // Mutation para processar pagamento
  const processPaymentMutation = useSupabaseMutation({
    table: 'commission_payments',
    operation: 'update',
    invalidateQueries: [['commission_payments']],
    successMessage: 'Pagamento processado com sucesso!'
  });

  React.useEffect(() => {
    if (stripeConfig) {
      setConfig(stripeConfig);
    }
  }, [stripeConfig]);

  const handleSaveConfig = async () => {
    try {
      if (stripeConfig) {
        await saveConfigMutation.mutateAsync({
          id: stripeConfig.id,
          ...config,
          updated_at: new Date().toISOString()
        });
      } else {
        await saveConfigMutation.mutateAsync({
          ...config,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      setIsConfiguring(false);
      refetchConfig();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração do Stripe',
        variant: 'destructive'
      });
    }
  };

  const handleProcessPayment = async (paymentId: string) => {
    try {
      // Aqui seria feita a integração real com a API do Stripe
      // Por enquanto, vamos simular o processamento
      await processPaymentMutation.mutateAsync({
        id: paymentId,
        status: 'processing',
        updated_at: new Date().toISOString()
      });
      
      // Simular processamento assíncrono
      setTimeout(async () => {
        await processPaymentMutation.mutateAsync({
          id: paymentId,
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_transfer_id: `tr_${Math.random().toString(36).substr(2, 9)}`
        });
        refetchPayments();
      }, 2000);
      
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao processar pagamento',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Pago</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const totalPendingAmount = commissionPayments?.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0) || 0;
  const totalPaidAmount = commissionPayments?.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) || 0;
  const totalAffiliates = new Set(commissionPayments?.map(p => p.affiliate_id)).size || 0;

  if (configLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Carregando configuração...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pendente</p>
                <p className="text-2xl font-bold">R$ {totalPendingAmount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pago</p>
                <p className="text-2xl font-bold">R$ {totalPaidAmount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Afiliados</p>
                <p className="text-2xl font-bold">{totalAffiliates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">R$ {(totalPendingAmount + totalPaidAmount).toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuração do Stripe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuração do Stripe
            {config.is_active && <Badge className="bg-green-100 text-green-800">Ativo</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isConfiguring ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Chave Pública</Label>
                  <p className="text-sm text-muted-foreground">
                    {config.publishable_key ? `${config.publishable_key.substring(0, 20)}...` : 'Não configurado'}
                  </p>
                </div>
                <div>
                  <Label>Status</Label>
                  <p className="text-sm">
                    {config.is_active ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        Configurado e ativo
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        Não configurado
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button onClick={() => setIsConfiguring(true)}>
                {config.publishable_key ? 'Editar Configuração' : 'Configurar Stripe'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="publishable_key">Chave Pública *</Label>
                  <Input
                    id="publishable_key"
                    placeholder="pk_test_..."
                    value={config.publishable_key}
                    onChange={(e) => setConfig({ ...config, publishable_key: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="secret_key">Chave Secreta *</Label>
                  <Input
                    id="secret_key"
                    type="password"
                    placeholder="sk_test_..."
                    value={config.secret_key}
                    onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="webhook_secret">Webhook Secret</Label>
                  <Input
                    id="webhook_secret"
                    placeholder="whsec_..."
                    value={config.webhook_secret}
                    onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="connect_client_id">Connect Client ID</Label>
                  <Input
                    id="connect_client_id"
                    placeholder="ca_..."
                    value={config.connect_client_id}
                    onChange={(e) => setConfig({ ...config, connect_client_id: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={config.is_active}
                  onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="is_active">Ativar integração</Label>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending || !config.publishable_key || !config.secret_key}
                >
                  {saveConfigMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button variant="outline" onClick={() => setIsConfiguring(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de pagamentos de comissão */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Pagamentos de Comissão
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Carregando pagamentos...</span>
            </div>
          ) : commissionPayments && commissionPayments.length > 0 ? (
            <div className="space-y-4">
              {commissionPayments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{payment.affiliate_name}</h4>
                      {getStatusBadge(payment.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Criado em {new Date(payment.created_at).toLocaleDateString('pt-BR')}
                      {payment.paid_at && ` • Pago em ${new Date(payment.paid_at).toLocaleDateString('pt-BR')}`}
                    </p>
                    {payment.stripe_transfer_id && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Transfer ID: {payment.stripe_transfer_id}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">R$ {payment.amount.toFixed(2)}</p>
                    {payment.status === 'pending' && config.is_active && (
                      <Button 
                        size="sm" 
                        onClick={() => handleProcessPayment(payment.id)}
                        disabled={processPaymentMutation.isPending}
                        className="mt-2"
                      >
                        {processPaymentMutation.isPending ? 'Processando...' : 'Processar'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum pagamento de comissão encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};