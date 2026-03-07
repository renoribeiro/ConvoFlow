import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CreditCard, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  Edit, 
  Trash2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { stripeMcpService } from '@/services/stripeMcpService';
import StripeConfiguration from '@/components/StripeConfiguration';

// Interfaces
interface Transaction {
  id: string;
  customer: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
  date: string;
  description: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  active: boolean;
}

interface BillingStats {
  balance: number;
  pendingBalance: number;
  totalRevenue: number;
  mrr: number;
  activeSubscriptions: number;
}

export function BillingDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<BillingStats>({
    balance: 0,
    pendingBalance: 0,
    totalRevenue: 0,
    mrr: 0,
    activeSubscriptions: 0
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plans, setPlans] = useState<Plan[]>([
    {
      id: 'price_basic',
      name: 'Basic',
      price: 29.00,
      currency: 'BRL',
      interval: 'month',
      features: ['1 Chatbot', '1000 Mensagens/mês', 'Suporte Básico'],
      active: true
    },
    {
      id: 'price_pro',
      name: 'Pro',
      price: 97.00,
      currency: 'BRL',
      interval: 'month',
      features: ['Chatbots Ilimitados', 'Mensagens Ilimitadas', 'Suporte Prioritário', 'API Access'],
      active: true
    },
    {
      id: 'price_enterprise',
      name: 'Enterprise',
      price: 297.00,
      currency: 'BRL',
      interval: 'month',
      features: ['Tudo do Pro', 'Gerente de Conta Dedicado', 'SLA Garantido', 'Customização White-label'],
      active: true
    }
  ]);

  // Modal states
  const [isEditPlanOpen, setIsEditPlanOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setIsLoading(true);
    try {
      // In a real scenario, we would fetch this data from Stripe via the service
      // For now, we'll try to fetch but fallback to mock data if not configured
      
      const isConfigured = await stripeMcpService.isConfigured();
      
      if (isConfigured) {
        try {
          // Attempt to fetch real data
          // const balance = await stripeMcpService.getBalance();
          // const transactions = await stripeMcpService.listPaymentIntents();
          // ... process data
        } catch (error) {
          console.error("Error fetching real Stripe data:", error);
        }
      }

      // Mock Data for demonstration
      setStats({
        balance: 12500.50,
        pendingBalance: 1200.00,
        totalRevenue: 145600.00,
        mrr: 15400.00,
        activeSubscriptions: 142
      });

      setTransactions([
        { id: 'pi_1', customer: 'João Silva', amount: 97.00, currency: 'BRL', status: 'succeeded', date: '2023-10-25', description: 'Assinatura Pro' },
        { id: 'pi_2', customer: 'Maria Santos', amount: 29.00, currency: 'BRL', status: 'succeeded', date: '2023-10-24', description: 'Assinatura Basic' },
        { id: 'pi_3', customer: 'Empresa X', amount: 297.00, currency: 'BRL', status: 'succeeded', date: '2023-10-24', description: 'Assinatura Enterprise' },
        { id: 'pi_4', customer: 'Carlos Oliveira', amount: 97.00, currency: 'BRL', status: 'failed', date: '2023-10-23', description: 'Assinatura Pro' },
        { id: 'pi_5', customer: 'Ana Costa', amount: 97.00, currency: 'BRL', status: 'pending', date: '2023-10-23', description: 'Assinatura Pro' },
      ]);

    } catch (error) {
      toast.error('Erro ao carregar dados de faturamento');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    setPlans(prev => prev.map(p => p.id === selectedPlan.id ? selectedPlan : p));
    toast.success('Plano atualizado com sucesso!');
    setIsEditPlanOpen(false);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Disponível</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.balance, 'BRL')}</div>
            <p className="text-xs text-muted-foreground">
              + {formatCurrency(stats.pendingBalance, 'BRL')} pendente
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal (MRR)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.mrr, 'BRL')}</div>
            <p className="text-xs text-muted-foreground">
              +2.5% em relação ao mês anterior
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              +12 novos assinantes este mês
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faturado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue, 'BRL')}</div>
            <p className="text-xs text-muted-foreground">
              Desde o início
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Transações Recentes</TabsTrigger>
          <TabsTrigger value="plans">Gerenciar Planos</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transações Recentes</CardTitle>
                <CardDescription>
                  Histórico de pagamentos e cobranças.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  Filtrar
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">Carregando...</TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">Nenhuma transação encontrada</TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium">{transaction.customer}</TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell>{formatCurrency(transaction.amount, transaction.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={
                            transaction.status === 'succeeded' ? 'default' : 
                            transaction.status === 'pending' ? 'secondary' : 'destructive'
                          }>
                            {transaction.status === 'succeeded' ? 'Pago' : 
                             transaction.status === 'pending' ? 'Pendente' : 'Falhou'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(transaction.date).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon">
                            <Search className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Planos de Assinatura</h3>
              <p className="text-sm text-muted-foreground">Gerencie os planos disponíveis para seus usuários.</p>
            </div>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <Card key={plan.id} className={!plan.active ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.active ? (
                      <Badge className="bg-green-500">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </div>
                  <CardDescription>
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(plan.price, plan.currency)}
                    </span>
                    <span className="text-muted-foreground">/{plan.interval === 'month' ? 'mês' : 'ano'}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm mb-4">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center">
                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      setSelectedPlan(plan);
                      setIsEditPlanOpen(true);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <StripeConfiguration />
        </TabsContent>
      </Tabs>

      {/* Edit Plan Modal */}
      <Dialog open={isEditPlanOpen} onOpenChange={setIsEditPlanOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
            <DialogDescription>
              Faça alterações no plano de assinatura.
            </DialogDescription>
          </DialogHeader>
          {selectedPlan && (
            <form onSubmit={handleUpdatePlan} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Nome
                </Label>
                <Input
                  id="name"
                  value={selectedPlan.name}
                  onChange={(e) => setSelectedPlan({...selectedPlan, name: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="price" className="text-right">
                  Preço
                </Label>
                <Input
                  id="price"
                  type="number"
                  value={selectedPlan.price}
                  onChange={(e) => setSelectedPlan({...selectedPlan, price: Number(e.target.value)})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="active" className="text-right">
                  Status
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={selectedPlan.active}
                    onCheckedChange={(checked) => setSelectedPlan({...selectedPlan, active: checked})}
                  />
                  <Label htmlFor="active">{selectedPlan.active ? 'Ativo' : 'Inativo'}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditPlanOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar Alterações</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
