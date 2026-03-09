import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  CreditCard,
  FileText,
  UserPlus,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  Plus,
  BarChart3,
  Settings,
  Calendar,
  AlertTriangle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import CommissionPayments from '@/components/CommissionPayments';
import StripeConfiguration from '@/components/StripeConfiguration';
import { BillingDashboard } from '@/components/admin/billing/BillingDashboard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'tenant_admin' | 'tenant_user';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  createdAt: string;
  tenantId?: string;
  tenantName?: string;
  planType?: string;
  phone?: string;
  avatarUrl?: string;
}

interface Subscription {
  id: string;
  userId: string;
  userName: string;
  plan: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  amount: number;
  currency: string;
  nextBilling: string;
  stripeSubscriptionId: string;
}

interface Affiliate {
  id: string;
  name: string;
  email: string;
  affiliate_code: string;
  commission_rate_first_month: number;
  commission_rate_recurring: number;
  total_referrals: number;
  total_commission: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stripe_account_id?: string;
}

const AdminDashboard = () => {
  const { user, isLoading: authLoading } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeUsersDateFilter, setActiveUsersDateFilter] = useState('30');
  const [newSubscriptionsDateFilter, setNewSubscriptionsDateFilter] = useState('30');

  // Estados para modais e formulários
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = useState(false);
  const [isViewUserOpen, setIsViewUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Estados para afiliados
  const [isCreateAffiliateOpen, setIsCreateAffiliateOpen] = useState(false);
  const [isEditAffiliateOpen, setIsEditAffiliateOpen] = useState(false);
  const [isDeleteAffiliateOpen, setIsDeleteAffiliateOpen] = useState(false);
  const [isViewAffiliateOpen, setIsViewAffiliateOpen] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);

  // Estados do formulário de usuário
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'tenant_user' as User['role'],
    isActive: true,
    tenantId: '',
    planType: 'basic'
  });

  // Estados do formulário de afiliado
  const [affiliateForm, setAffiliateForm] = useState({
    name: '',
    email: '',
    affiliate_code: '',
    commission_rate_first_month: 30,
    commission_rate_recurring: 10,
    is_active: true
  });

  // Queries para buscar dados
  const { data: affiliates = [], isLoading: affiliatesLoading, refetch: refetchAffiliates, error: affiliatesError } = useSupabaseQuery({
    table: 'affiliates',
    queryKey: ['affiliates'],
    select: '*',
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!user && !authLoading && isSuperAdmin // Só executa se estiver autenticado e for super admin
  });

  // Query para buscar usuários usando a view admin_users_view que já combina auth.users e profiles
  const { data: usersWithEmails = [], isLoading: usersLoading, refetch: refetchUsers, error: usersError } = useSupabaseQuery({
    table: 'admin_users_view',
    queryKey: ['admin-users', isSuperAdmin],
    select: `
      id,
      email,
      first_name,
      last_name,
      role,
      is_active,
      phone,
      created_at,
      profile_updated_at,
      tenant_id
    `,
    orderBy: [{ column: 'created_at', ascending: false }],
    enabled: !!user && !authLoading && isSuperAdmin // Só executa se estiver autenticado e for super admin
  });

  // Debug logs para identificar problemas
  console.log('AdminDashboard - Auth loading:', authLoading);
  console.log('AdminDashboard - User:', user);
  console.log('AdminDashboard - Users loading:', usersLoading);
  console.log('AdminDashboard - Users with emails:', usersWithEmails);
  console.log('AdminDashboard - Users error:', usersError);
  console.log('AdminDashboard - Affiliates loading:', affiliatesLoading);
  console.log('AdminDashboard - Affiliates data:', affiliates);
  console.log('AdminDashboard - Affiliates error:', affiliatesError);
  console.log('AdminDashboard - Is super admin:', isSuperAdmin);

  // Verificar se o usuário está autenticado
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Mostrar erro se não for super admin
  React.useEffect(() => {
    if (!isSuperAdmin && !usersLoading && !authLoading) {
      toast.error('Acesso negado: Apenas super administradores podem acessar esta página');
    }
  }, [isSuperAdmin, usersLoading, authLoading]);

  // Mostrar erro se houver problema na query de usuários
  React.useEffect(() => {
    if (usersError) {
      console.error('Erro na query de usuários:', usersError);
      toast.error('Erro ao carregar usuários: ' + usersError.message);
    }
  }, [usersError]);



  // Mostrar erro se houver problema na query de afiliados
  React.useEffect(() => {
    if (affiliatesError) {
      console.error('Erro na query de afiliados:', affiliatesError);
      toast.error('Erro ao carregar afiliados: ' + affiliatesError.message);
    }
  }, [affiliatesError]);

  // Mutations para CRUD de usuários
  // createUserMutation removido - agora usamos supabase.auth.signUp() diretamente

  const updateUserMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'update',
    onSuccess: () => {
      toast.success('Usuário atualizado com sucesso!');
      setIsEditUserOpen(false);
      resetUserForm();
      refetchUsers();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    }
  });

  const deleteUserMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'delete',
    onSuccess: () => {
      toast.success('Usuário excluído com sucesso!');
      setIsDeleteUserOpen(false);
      setSelectedUser(null);
      refetchUsers();
    },
    onError: (error) => {
      toast.error('Erro ao excluir usuário: ' + error.message);
    }
  });

  // Mutations para CRUD de afiliados
  const createAffiliateMutation = useSupabaseMutation({
    table: 'affiliates',
    operation: 'insert',
    onSuccess: () => {
      toast.success('Afiliado criado com sucesso!');
      setIsCreateAffiliateOpen(false);
      resetAffiliateForm();
      refetchAffiliates();
    },
    onError: (error) => {
      toast.error('Erro ao criar afiliado: ' + error.message);
    }
  });

  const updateAffiliateMutation = useSupabaseMutation({
    table: 'affiliates',
    operation: 'update',
    onSuccess: () => {
      toast.success('Afiliado atualizado com sucesso!');
      setIsEditAffiliateOpen(false);
      resetAffiliateForm();
      refetchAffiliates();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar afiliado: ' + error.message);
    }
  });

  const deleteAffiliateMutation = useSupabaseMutation({
    table: 'affiliates',
    operation: 'delete',
    onSuccess: () => {
      toast.success('Afiliado excluído com sucesso!');
      setIsDeleteAffiliateOpen(false);
      setSelectedAffiliate(null);
      refetchAffiliates();
    },
    onError: (error) => {
      toast.error('Erro ao excluir afiliado: ' + error.message);
    }
  });

  // Funções auxiliares
  const resetUserForm = () => {
    setUserForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'tenant_user' as User['role'],
      isActive: true,
      tenantId: '',
      planType: 'basic'
    });
  };

  const resetAffiliateForm = () => {
    setAffiliateForm({
      name: '',
      email: '',
      affiliate_code: '',
      commission_rate_first_month: 30,
      commission_rate_recurring: 10,
      is_active: true
    });
  };

  const generateAffiliateCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setAffiliateForm(prev => ({ ...prev, affiliate_code: code }));
  };

  const handleCreateUser = async () => {
    if (!userForm.firstName || !userForm.lastName || !userForm.email) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Criar o usuário via Supabase Auth (dispara o trigger handle_new_user que cria o profile)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userForm.email,
        password: Math.random().toString(36).slice(-12) + 'A1!', // Senha temporária segura
        options: {
          data: {
            first_name: userForm.firstName,
            last_name: userForm.lastName,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Não foi possível criar o usuário');

      // 2. Atualizar o profile com campos adicionais (phone, role, is_active)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          phone: userForm.phone || null,
          role: userForm.role,
          is_active: userForm.isActive,
        })
        .eq('user_id', authData.user.id);

      if (profileError) {
        console.error('Erro ao atualizar profile:', profileError);
        // Profile foi criado pelo trigger, mas update falhou - avisar
        toast.warning('Usuário criado, mas alguns dados adicionais não foram salvos: ' + profileError.message);
      } else {
        toast.success('Usuário criado com sucesso!');
      }

      setIsCreateUserOpen(false);
      resetUserForm();
      refetchUsers();
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      toast.error('Erro ao criar usuário: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = () => {
    if (!selectedUser) return;

    updateUserMutation.mutate({
      data: {
        first_name: userForm.firstName,
        last_name: userForm.lastName,
        phone: userForm.phone,
        role: userForm.role,
        is_active: userForm.isActive,
      },
      options: {
        filter: { column: 'user_id', operator: 'eq', value: selectedUser.id }
      }
    });
  };

  const handleDeleteUser = () => {
    if (!selectedUser) return;

    deleteUserMutation.mutate({
      data: {},
      options: {
        filter: { column: 'user_id', operator: 'eq', value: selectedUser.id }
      }
    });
  };

  const handleCreateAffiliate = () => {
    if (!affiliateForm.name || !affiliateForm.email || !affiliateForm.affiliate_code) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    createAffiliateMutation.mutate({
      name: affiliateForm.name,
      email: affiliateForm.email,
      affiliate_code: affiliateForm.affiliate_code,
      commission_rate_first_month: affiliateForm.commission_rate_first_month,
      commission_rate_recurring: affiliateForm.commission_rate_recurring,
      is_active: affiliateForm.is_active
    });
  };

  const handleEditAffiliate = () => {
    if (!selectedAffiliate) return;

    updateAffiliateMutation.mutate({
      id: selectedAffiliate.id,
      name: affiliateForm.name,
      email: affiliateForm.email,
      affiliate_code: affiliateForm.affiliate_code,
      commission_rate_first_month: affiliateForm.commission_rate_first_month,
      commission_rate_recurring: affiliateForm.commission_rate_recurring,
      is_active: affiliateForm.is_active
    });
  };

  const handleDeleteAffiliate = () => {
    if (!selectedAffiliate) return;
    deleteAffiliateMutation.mutate({ id: selectedAffiliate.id });
  };

  const openEditAffiliate = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setAffiliateForm({
      name: affiliate.name,
      email: affiliate.email,
      affiliate_code: affiliate.affiliate_code,
      commission_rate_first_month: affiliate.commission_rate_first_month,
      commission_rate_recurring: affiliate.commission_rate_recurring,
      is_active: affiliate.is_active
    });
    setIsEditAffiliateOpen(true);
  };

  const copyAffiliateCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Código copiado para a área de transferência!');
  };

  // Redirect se não for super admin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Administração</h1>
          <p className="text-muted-foreground">
            Painel de controle para super administradores
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="billing">Faturamento</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="affiliates">Afiliados</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{usersWithEmails.length}</div>
                <p className="text-xs text-muted-foreground">
                  Últimos 30 dias
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Afiliados Ativos</CardTitle>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliates.filter(a => a.is_active).length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total de {affiliates.length} afiliados
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  R$ {affiliates.reduce((sum, a) => sum + Number(a.total_commission), 0).toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total acumulado
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Indicações</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {affiliates.reduce((sum, a) => sum + a.total_referrals, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total de indicações
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Buscar usuários..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-[300px]"
              />
              <Button variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => {
              resetUserForm();
              setIsCreateUserOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Usuário
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Usuários do Sistema</CardTitle>
              <CardDescription>
                Gerencie todos os usuários da plataforma
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Carregando usuários...
                      </TableCell>
                    </TableRow>
                  ) : usersWithEmails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    usersWithEmails.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.first_name} {user.last_name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'super_admin' ? 'destructive' : 'secondary'}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? 'default' : 'secondary'}>
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.tenants?.name || 'N/A'}</TableCell>
                        <TableCell>
                          {format(new Date(user.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedUser({
                                  id: user.id,
                                  name: `${user.first_name} ${user.last_name}`,
                                  email: user.email,
                                  role: user.role,
                                  status: user.is_active ? 'active' : 'inactive',
                                  lastLogin: '',
                                  createdAt: user.created_at,
                                  tenantId: user.tenant_id,
                                  tenantName: '', // Removido pois não temos mais o join com tenants
                                  phone: user.phone
                                });
                                setIsViewUserOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedUser({
                                  id: user.id,
                                  name: `${user.first_name} ${user.last_name}`,
                                  email: user.email,
                                  role: user.role,
                                  status: user.is_active ? 'active' : 'inactive',
                                  lastLogin: '',
                                  createdAt: user.created_at,
                                  tenantId: user.tenant_id,
                                  tenantName: '', // Removido pois não temos mais o join com tenants
                                  phone: user.phone
                                });
                                setUserForm({
                                  firstName: user.first_name || '',
                                  lastName: user.last_name || '',
                                  email: user.email || '',
                                  phone: user.phone || '',
                                  role: user.role,
                                  isActive: user.is_active,
                                  tenantId: user.tenant_id || '',
                                  planType: 'basic'
                                });
                                setIsEditUserOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedUser({
                                  id: user.id,
                                  name: `${user.first_name} ${user.last_name}`,
                                  email: user.email,
                                  role: user.role,
                                  status: user.is_active ? 'active' : 'inactive',
                                  lastLogin: '',
                                  createdAt: user.created_at,
                                  tenantId: user.tenant_id,
                                  tenantName: user.tenants?.name,
                                  phone: user.phone
                                });
                                setIsDeleteUserOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <BillingDashboard />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Relatórios</CardTitle>
              <CardDescription>
                Relatórios detalhados do sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <h3 className="text-lg font-semibold mb-2">Em Desenvolvimento</h3>
                <p className="text-muted-foreground">
                  Relatórios avançados em breve
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="affiliates" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Buscar afiliados..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-[300px]"
              />
              <Button variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setIsCreateAffiliateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Afiliado
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Programa de Afiliados</CardTitle>
              <CardDescription>
                Gerencie afiliados e suas comissões
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Comissão 1º Mês</TableHead>
                    <TableHead>Comissão Recorrente</TableHead>
                    <TableHead>Indicações</TableHead>
                    <TableHead>Total Ganho</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliatesLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Carregando afiliados...
                      </TableCell>
                    </TableRow>
                  ) : affiliates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Nenhum afiliado encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    affiliates.map((affiliate: Affiliate) => (
                      <TableRow key={affiliate.id}>
                        <TableCell className="font-medium">{affiliate.name}</TableCell>
                        <TableCell>{affiliate.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">
                              {affiliate.affiliate_code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyAffiliateCode(affiliate.affiliate_code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{affiliate.commission_rate_first_month}%</TableCell>
                        <TableCell>{affiliate.commission_rate_recurring}%</TableCell>
                        <TableCell>{affiliate.total_referrals}</TableCell>
                        <TableCell>R$ {Number(affiliate.total_commission).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={affiliate.is_active ? 'default' : 'secondary'}>
                            {affiliate.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedAffiliate(affiliate);
                                setIsViewAffiliateOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditAffiliate(affiliate)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedAffiliate(affiliate);
                                setIsDeleteAffiliateOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <CommissionPayments />
          <StripeConfiguration />
        </TabsContent>
      </Tabs>

      {/* Modal Criar Afiliado */}
      <Dialog open={isCreateAffiliateOpen} onOpenChange={setIsCreateAffiliateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Afiliado</DialogTitle>
            <DialogDescription>
              Adicione um novo afiliado ao programa
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nome
              </Label>
              <Input
                id="name"
                value={affiliateForm.name}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={affiliateForm.email}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, email: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">
                Código
              </Label>
              <div className="col-span-3 flex space-x-2">
                <Input
                  id="code"
                  value={affiliateForm.affiliate_code}
                  onChange={(e) => setAffiliateForm(prev => ({ ...prev, affiliate_code: e.target.value.toUpperCase() }))}
                  placeholder="Ex: JOAO123"
                />
                <Button type="button" variant="outline" onClick={generateAffiliateCode}>
                  Gerar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="firstMonth" className="text-right">
                Comissão 1º Mês (%)
              </Label>
              <Input
                id="firstMonth"
                type="number"
                value={affiliateForm.commission_rate_first_month}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, commission_rate_first_month: Number(e.target.value) }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="recurring" className="text-right">
                Comissão Recorrente (%)
              </Label>
              <Input
                id="recurring"
                type="number"
                value={affiliateForm.commission_rate_recurring}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, commission_rate_recurring: Number(e.target.value) }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="active" className="text-right">
                Ativo
              </Label>
              <Switch
                id="active"
                checked={affiliateForm.is_active}
                onCheckedChange={(checked) => setAffiliateForm(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateAffiliateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateAffiliate}
              disabled={createAffiliateMutation.isPending}
            >
              {createAffiliateMutation.isPending ? 'Criando...' : 'Criar Afiliado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Afiliado */}
      <Dialog open={isEditAffiliateOpen} onOpenChange={setIsEditAffiliateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Afiliado</DialogTitle>
            <DialogDescription>
              Atualize as informações do afiliado
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Nome
              </Label>
              <Input
                id="edit-name"
                value={affiliateForm.name}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, name: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">
                Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                value={affiliateForm.email}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, email: e.target.value }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-code" className="text-right">
                Código
              </Label>
              <Input
                id="edit-code"
                value={affiliateForm.affiliate_code}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, affiliate_code: e.target.value.toUpperCase() }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-firstMonth" className="text-right">
                Comissão 1º Mês (%)
              </Label>
              <Input
                id="edit-firstMonth"
                type="number"
                value={affiliateForm.commission_rate_first_month}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, commission_rate_first_month: Number(e.target.value) }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-recurring" className="text-right">
                Comissão Recorrente (%)
              </Label>
              <Input
                id="edit-recurring"
                type="number"
                value={affiliateForm.commission_rate_recurring}
                onChange={(e) => setAffiliateForm(prev => ({ ...prev, commission_rate_recurring: Number(e.target.value) }))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-active" className="text-right">
                Ativo
              </Label>
              <Switch
                id="edit-active"
                checked={affiliateForm.is_active}
                onCheckedChange={(checked) => setAffiliateForm(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEditAffiliateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEditAffiliate}
              disabled={updateAffiliateMutation.isPending}
            >
              {updateAffiliateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Afiliado */}
      <AlertDialog open={isDeleteAffiliateOpen} onOpenChange={setIsDeleteAffiliateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Afiliado</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o afiliado "{selectedAffiliate?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAffiliate}
              disabled={deleteAffiliateMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAffiliateMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Visualizar Afiliado */}
      <Dialog open={isViewAffiliateOpen} onOpenChange={setIsViewAffiliateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Afiliado</DialogTitle>
          </DialogHeader>
          {selectedAffiliate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Nome</Label>
                  <p className="text-sm text-muted-foreground">{selectedAffiliate.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-sm text-muted-foreground">{selectedAffiliate.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Código</Label>
                  <div className="flex items-center space-x-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm">
                      {selectedAffiliate.affiliate_code}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyAffiliateCode(selectedAffiliate.affiliate_code)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div>
                    <Badge variant={selectedAffiliate.is_active ? 'default' : 'secondary'}>
                      {selectedAffiliate.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Comissão 1º Mês</Label>
                  <p className="text-sm text-muted-foreground">{selectedAffiliate.commission_rate_first_month}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Comissão Recorrente</Label>
                  <p className="text-sm text-muted-foreground">{selectedAffiliate.commission_rate_recurring}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Total de Indicações</Label>
                  <p className="text-sm text-muted-foreground">{selectedAffiliate.total_referrals}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Total Ganho</Label>
                  <p className="text-sm text-muted-foreground">R$ {Number(selectedAffiliate.total_commission).toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Criado em</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedAffiliate.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Atualizado em</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedAffiliate.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsViewAffiliateOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Usuário */}
      <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha as informações do novo usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-firstName">Nome</Label>
                <Input
                  id="create-firstName"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div>
                <Label htmlFor="create-lastName">Sobrenome</Label>
                <Input
                  id="create-lastName"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Sobrenome"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="create-phone">Telefone</Label>
              <Input
                id="create-phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <Label htmlFor="create-role">Função</Label>
              <Select value={userForm.role} onValueChange={(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_user">Usuário</SelectItem>
                  <SelectItem value="tenant_admin">Administrador</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-active"
                checked={userForm.isActive}
                onCheckedChange={(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="create-active">Usuário ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateUser}
              disabled={isLoading}
            >
              {isLoading ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Usuário */}
      <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-firstName">Nome</Label>
                <Input
                  id="edit-firstName"
                  value={userForm.firstName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div>
                <Label htmlFor="edit-lastName">Sobrenome</Label>
                <Input
                  id="edit-lastName"
                  value={userForm.lastName}
                  onChange={(e) => setUserForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Sobrenome"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                value={userForm.phone}
                onChange={(e) => setUserForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Função</Label>
              <Select value={userForm.role} onValueChange={(value) => setUserForm(prev => ({ ...prev, role: value as User['role'] }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_user">Usuário</SelectItem>
                  <SelectItem value="tenant_admin">Administrador</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={userForm.isActive}
                onCheckedChange={(checked) => setUserForm(prev => ({ ...prev, isActive: checked as boolean }))}
              />
              <Label htmlFor="edit-active">Usuário ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEditUserOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEditUser}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Usuário */}
      <AlertDialog open={isDeleteUserOpen} onOpenChange={setIsDeleteUserOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário "{selectedUser?.name}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Visualizar Usuário */}
      <Dialog open={isViewUserOpen} onOpenChange={setIsViewUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Nome</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Telefone</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.phone || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Função</Label>
                  <div>
                    <Badge variant={selectedUser.role === 'super_admin' ? 'destructive' : 'secondary'}>
                      {selectedUser.role}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div>
                    <Badge variant={selectedUser.status === 'active' ? 'default' : 'secondary'}>
                      {selectedUser.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Tenant</Label>
                  <p className="text-sm text-muted-foreground">{selectedUser.tenantName || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Criado em</Label>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(selectedUser.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsViewUserOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;