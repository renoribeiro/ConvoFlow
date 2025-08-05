import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import stripeMcpService from '@/services/stripeMcpService';
import TransactionStatistics from '@/components/TransactionStatistics';
import {
  CreditCard,
  Key,
  Shield,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  Webhook
} from 'lucide-react';

interface StripeConfig {
  secret_key: string;
  publishable_key: string;
  webhook_secret: string;
  environment: 'test' | 'live';
}

const StripeConfiguration = () => {
  const { toast } = useToast();
  const [config, setConfig] = useState<StripeConfig>({
    secret_key: '',
    publishable_key: '',
    webhook_secret: '',
    environment: 'test'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [showSecrets, setShowSecrets] = useState({
    secret_key: false,
    webhook_secret: false
  });
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);

  useEffect(() => {
    loadConfiguration();
    checkConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      const configData = await stripeMcpService.getStripeConfig();
      
      if (configData) {
        setConfig({
          secret_key: configData.secretKey || '',
          publishable_key: configData.publishableKey || '',
          webhook_secret: configData.webhookSecret || '',
          environment: configData.environment || 'test'
        });
      }
    } catch (error: any) {
      console.error('Erro ao carregar configuração:', error);
    }
  };

  const checkConfiguration = async () => {
    try {
      const configured = await stripeMcpService.isConfigured();
      setIsConfigured(configured);
      
      if (configured) {
        await loadAccountInfo();
        await loadBalance();
      }
    } catch (error) {
      console.error('Erro ao verificar configuração:', error);
      setIsConfigured(false);
    }
  };

  const loadAccountInfo = async () => {
    try {
      const info = await stripeMcpService.getAccountInfo();
      setAccountInfo(info);
    } catch (error) {
      console.error('Erro ao carregar informações da conta:', error);
    }
  };

  const loadBalance = async () => {
    try {
      const balanceData = await stripeMcpService.getBalance();
      setBalance(balanceData);
    } catch (error) {
      console.error('Erro ao carregar saldo:', error);
    }
  };

  const handleSave = async () => {
    if (!config.secret_key || !config.publishable_key) {
      toast({
        title: 'Erro',
        description: 'Chave secreta e chave pública são obrigatórias',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Usar o serviço para salvar a configuração
      await stripeMcpService.saveStripeConfig({
        secretKey: config.secret_key,
        publishableKey: config.publishable_key,
        webhookSecret: config.webhook_secret,
        environment: config.environment
      });

      toast({
        title: 'Sucesso',
        description: 'Configuração do Stripe salva com sucesso!',
      });

      await checkConfiguration();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao salvar configuração: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!config.secret_key) {
      toast({
        title: 'Erro',
        description: 'Chave secreta é obrigatória para testar',
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      // Primeiro salva a configuração temporariamente
      await handleSave();
      
      // Testa a conexão usando o novo método
      const testResult = await stripeMcpService.testConnection();
      
      if (testResult.success) {
        toast({
          title: 'Sucesso',
          description: `Conexão com Stripe estabelecida! Conta: ${testResult.accountInfo?.business_profile?.name || testResult.accountInfo?.email || 'Stripe Account'}`,
        });
        
        setAccountInfo(testResult.accountInfo);
        await loadBalance();
      } else {
        throw new Error(testResult.error || 'Erro desconhecido ao testar conexão');
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: 'Erro ao testar conexão: ' + error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const toggleSecretVisibility = (field: 'secret_key' | 'webhook_secret') => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const formatBalance = (amount: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Status da Integração Stripe MCP
            {isConfigured ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Configurado
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Não Configurado
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure a integração com Stripe MCP para processar pagamentos de comissões automaticamente
          </CardDescription>
        </CardHeader>
        
        {isConfigured && accountInfo && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Informações da Conta</Label>
                <div className="text-sm text-gray-600">
                  <p><strong>ID:</strong> {accountInfo.id}</p>
                  <p><strong>País:</strong> {accountInfo.country}</p>
                  <p><strong>Email:</strong> {accountInfo.email || 'N/A'}</p>
                  {accountInfo.business_profile?.name && (
                    <p><strong>Nome:</strong> {accountInfo.business_profile.name}</p>
                  )}
                </div>
              </div>
              
              {balance && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Saldo Disponível</Label>
                  <div className="text-sm text-gray-600">
                    {balance.available?.map((bal: any, index: number) => (
                      <p key={index}>
                        <strong>{bal.currency.toUpperCase()}:</strong> {formatBalance(bal.amount, bal.currency)}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configuration Tabs */}
      <Tabs defaultValue="api-keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api-keys">
            <Key className="h-4 w-4 mr-2" />
            Chaves da API
          </TabsTrigger>
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="statistics">
            <RefreshCw className="h-4 w-4 mr-2" />
            Estatísticas
          </TabsTrigger>
          <TabsTrigger value="documentation">
            <ExternalLink className="h-4 w-4 mr-2" />
            Documentação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>Configuração das Chaves da API</CardTitle>
              <CardDescription>
                Configure suas chaves da API do Stripe para habilitar o processamento de pagamentos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>Importante:</strong> Use chaves de teste durante o desenvolvimento. 
                  Nunca compartilhe suas chaves secretas.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="environment">Ambiente</Label>
                  <select
                    id="environment"
                    value={config.environment}
                    onChange={(e) => setConfig(prev => ({ ...prev, environment: e.target.value as 'test' | 'live' }))}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="test">Teste (Sandbox)</option>
                    <option value="live">Produção (Live)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="publishable_key">Chave Pública (Publishable Key)</Label>
                <Input
                  id="publishable_key"
                  type="text"
                  placeholder={config.environment === 'test' ? 'pk_test_...' : 'pk_live_...'}
                  value={config.publishable_key}
                  onChange={(e) => setConfig(prev => ({ ...prev, publishable_key: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secret_key">Chave Secreta (Secret Key)</Label>
                <div className="relative">
                  <Input
                    id="secret_key"
                    type={showSecrets.secret_key ? 'text' : 'password'}
                    placeholder={config.environment === 'test' ? 'sk_test_...' : 'sk_live_...'}
                    value={config.secret_key}
                    onChange={(e) => setConfig(prev => ({ ...prev, secret_key: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => toggleSecretVisibility('secret_key')}
                  >
                    {showSecrets.secret_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook_secret">Webhook Secret (Opcional)</Label>
                <div className="relative">
                  <Input
                    id="webhook_secret"
                    type={showSecrets.webhook_secret ? 'text' : 'password'}
                    placeholder="whsec_..."
                    value={config.webhook_secret}
                    onChange={(e) => setConfig(prev => ({ ...prev, webhook_secret: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => toggleSecretVisibility('webhook_secret')}
                  >
                    {showSecrets.webhook_secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {isLoading ? 'Salvando...' : 'Salvar Configuração'}
                </Button>
                <Button variant="outline" onClick={handleTest} disabled={isTesting || !config.secret_key}>
                  {isTesting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
                  {isTesting ? 'Testando...' : 'Testar Conexão'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks">
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Webhooks</CardTitle>
              <CardDescription>
                Configure webhooks para receber notificações automáticas do Stripe
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Webhook className="h-4 w-4" />
                <AlertDescription>
                  <strong>URL do Webhook:</strong> Configure esta URL no seu dashboard do Stripe:
                  <br />
                  <code className="bg-gray-100 px-2 py-1 rounded mt-2 block">
                    {window.location.origin}/api/webhooks/stripe
                  </code>
                </AlertDescription>
              </Alert>
              
              <div className="mt-4 space-y-2">
                <Label>Eventos Recomendados:</Label>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• payment_intent.succeeded</li>
                  <li>• payment_intent.payment_failed</li>
                  <li>• customer.created</li>
                  <li>• customer.updated</li>
                  <li>• invoice.payment_succeeded</li>
                  <li>• invoice.payment_failed</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistics">
          <TransactionStatistics />
        </TabsContent>

        <TabsContent value="documentation">
          <Card>
            <CardHeader>
              <CardTitle>Documentação e Recursos</CardTitle>
              <CardDescription>
                Links úteis para configurar e usar o Stripe MCP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                  href="https://docs.stripe.com/mcp#tools"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ExternalLink className="h-4 w-4" />
                    <strong>Documentação Stripe MCP</strong>
                  </div>
                  <p className="text-sm text-gray-600">
                    Guia completo para configurar e usar o Model Context Protocol do Stripe
                  </p>
                </a>
                
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-4 w-4" />
                    <strong>Chaves da API</strong>
                  </div>
                  <p className="text-sm text-gray-600">
                    Acesse suas chaves da API no dashboard do Stripe
                  </p>
                </a>
                
                <a
                  href="https://dashboard.stripe.com/webhooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Webhook className="h-4 w-4" />
                    <strong>Configurar Webhooks</strong>
                  </div>
                  <p className="text-sm text-gray-600">
                    Configure webhooks no dashboard do Stripe
                  </p>
                </a>
                
                <a
                  href="https://stripe.com/docs/testing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4" />
                    <strong>Guia de Testes</strong>
                  </div>
                  <p className="text-sm text-gray-600">
                    Como testar pagamentos com cartões de teste
                  </p>
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StripeConfiguration;