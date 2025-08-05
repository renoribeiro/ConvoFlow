import { useState, useEffect } from 'react';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
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
  AlertTriangle
} from 'lucide-react';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { Navigate } from 'react-router-dom';
import CommissionPayments from '@/components/CommissionPayments';
import StripeConfiguration from '@/components/StripeConfiguration';

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
  code: string;
  commission: number;
  totalEarnings: number;
  referrals: number;
  status: 'active' | 'inactive';
  joinedAt: string;
}

const AdminDashboard = () => {
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
    phone: '',
    commissionFirstMonth: 30,
    commissionRecurring: 10,
    isActive: true
  });

  // Redirect se não for super admin
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Buscar dados reais do Supabase usando função RPC
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers, error: usersError } = useQuery({
    queryKey: ['admin-users-complete'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_users_data');
      if (error) {
        throw error;
      }
      return data;
    }
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useSupabaseQuery({
    table: 'tenants',
    select: `
      id,
      name,
      subscription_status,
      plan_type,
      created_at,
      updated_at
    `,
    queryKey: ['admin-tenants']
  });

  const { data: contacts = [], isLoading: contactsLoading } = useSupabaseQuery({
    table: 'contacts',
    select: 'id, name, phone, created_at',
    queryKey: ['admin-contacts']
  });

  const { data: messages = [], isLoading: messagesLoading } = useSupabaseQuery({
    table: 'messages',
    select: 'id, created_at',
    queryKey: ['admin-messages']
  });

  const users: User[] = usersData?.map((profile: any) => ({
    id: profile.id,
    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Usuário sem nome',
    email: profile.email || 'email@exemplo.com',
    role: profile.role || 'tenant_user',
    status: profile.is_active ? 'active' : 'inactive',
    lastLogin: profile.updated_at || profile.created_at,
    createdAt: profile.created_at,
    tenantId: profile.tenant_id,
    tenantName: profile.tenant_name,
    planType: profile.plan_type,
    phone: profile.phone,
    avatarUrl: profile.avatar_url
  })) || [];

  const subscriptions: Subscription[] = tenants.map((tenant: any) => ({
    id: tenant.id,
    userId: tenant.id,
    userName: tenant.name || 'Tenant',
    plan: tenant.plan_type || 'Free',
    status: tenant.subscription_status || 'active',
    amount: tenant.plan_type === 'Pro' ? 99.90 : 0,
    currency: 'BRL',
    nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    stripeSubscriptionId: `sub_${tenant.id}`
  }));

  // Calcular métricas baseadas nos filtros de data separados
  const activeUsersFilterDate = new Date();
  activeUsersFilterDate.setDate(activeUsersFilterDate.getDate() - parseInt(activeUsersDateFilter));

  const newSubscriptionsFilterDate = new Date();
  newSubscriptionsFilterDate.setDate(newSubscriptionsFilterDate.getDate() - parseInt(newSubscriptionsDateFilter));

  // Usuários ativos (que fizeram login nos últimos X dias)
  const activeUsers = users.filter(user => {
    const lastLogin = new Date(user.lastLogin);
    return lastLogin >= activeUsersFilterDate;
  });

  // Novas assinaturas no período
  const newSubscriptions = subscriptions.filter(sub => {
    const createdAt = new Date(tenants.find(t => t.id === sub.id)?.created_at || '');
    return createdAt >= newSubscriptionsFilterDate;
  });

  // Buscar dados reais dos afiliados
  const { data: affiliatesData = [], isLoading: affiliatesLoading, refetch: refetchAffiliates } = useSupabaseQuery({
    table: 'affiliates',
    select: `
      id,
      name,
      email,
      referral_code,
      commission_rate_first_month,
      commission_rate_recurring,
      is_active,
      created_at,
      (
        SELECT COUNT(*) 
        FROM affiliate_referrals ar 
        WHERE ar.affiliate_id = affiliates.id
      ) as referrals_count,
      (
        SELECT COALESCE(SUM(total_commission_paid), 0) 
        FROM affiliate_referrals ar 
        WHERE ar.affiliate_id = affiliates.id
      ) as total_earnings
    `,
    queryKey: ['admin-affiliates']
  });

  const affiliates: Affiliate[] = affiliatesData.map((affiliate: any) => ({
    id: affiliate.id,
    name: affiliate.name,
    email: affiliate.email,
    code: affiliate.referral_code,
    commission: affiliate.commission_rate_first_month,
    totalEarnings: affiliate.total_earnings || 0,
    referrals: affiliate.referrals_count || 0,
    status: affiliate.is_active ? 'active' : 'inactive',
    joinedAt: affiliate.created_at
  }));

  const formatCurrency = (amount: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Funções CRUD para usuários
  const resetUserForm = () => {
    setUserForm({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'tenant_user',
      isActive: true,
      tenantId: '',
      planType: 'basic'
    });
  };

  const handleCreateUser = async () => {
    setIsLoading(true);
    try {
      // Primeiro criar o usuário no auth.users
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: userForm.email,
        password: 'temp123456', // Senha temporária
        email_confirm: true
      });

      if (authError) throw authError;

      // Depois criar o perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authUser.user.id,
          first_name: userForm.firstName,
          last_name: userForm.lastName,
          phone: userForm.phone,
          role: userForm.role,
          is_active: userForm.isActive,
          tenant_id: userForm.tenantId
        });

      if (profileError) throw profileError;

      toast.success('Usuário criado com sucesso!');
      setIsCreateUserOpen(false);
      resetUserForm();
      refetchUsers();
    } catch (error: any) {
      toast.error('Erro ao criar usuário: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: userForm.firstName,
          last_name: userForm.lastName,
          phone: userForm.phone,
          role: userForm.role,
          is_active: userForm.isActive,
          tenant_id: userForm.tenantId
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success('Usuário atualizado com sucesso!');
      setIsEditUserOpen(false);
      setSelectedUser(null);
      resetUserForm();
      refetchUsers();
    } catch (error: any) {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success('Usuário excluído com sucesso!');
      setIsDeleteUserOpen(false);
      setSelectedUser(null);
      refetchUsers();
    } catch (error: any) {
      toast.error('Erro ao excluir usuário: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    const nameParts = user.name.split(' ');
    setUserForm({
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      isActive: user.status === 'active',
      tenantId: user.tenantId || '',
      planType: user.planType || 'basic'
    });
    setIsEditUserOpen(true);
  };

  const openDeleteModal = (user: User) => {
    setSelectedUser(user);
    setIsDeleteUserOpen(true);
  };

  const openViewModal = (user: User) => {
    setSelectedUser(user);
    setIsViewUserOpen(true);
  };

  // Funções CRUD para afiliados
  const resetAffiliateForm = () => {
    setAffiliateForm({
      name: '',
      email: '',
      phone: '',
      commissionFirstMonth: 30,
      commissionRecurring: 10,
      isActive: true
    });
  };

  const generateAffiliateCode = (name: string) => {
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${cleanName.substring(0, 6)}${randomSuffix}`;
  };

  const handleCreateAffiliate = async () => {
    setIsLoading(true);
    try {
      const affiliateCode = generateAffiliateCode(affiliateForm.name);
      
      const { error } = await supabase
        .from('affiliates')
        .insert({
          name: affiliateForm.name,
          email: affiliateForm.email,
          phone: affiliateForm.phone,
          referral_code: affiliateCode,
          commission_rate_first_month: affiliateForm.commissionFirstMonth / 100,
          commission_rate_recurring: affiliateForm.commissionRecurring / 100,
          is_active: affiliateForm.isActive
        });

      if (error) throw error;

      toast.success('Afiliado criado com sucesso!');
      setIsCreateAffiliateOpen(false);
      resetAffiliateForm();
      refetchAffiliates();
    } catch (error: any) {
      toast.error('Erro ao criar afiliado: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditAffiliate = async () => {
    if (!selectedAffiliate) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('affiliates')
        .update({
          name: affiliateForm.name,
          email: affiliateForm.email,
          phone: affiliateForm.phone,
          commission_rate_first_month: affiliateForm.commissionFirstMonth / 100,
          commission_rate_recurring: affiliateForm.commissionRecurring / 100,
          is_active: affiliateForm.isActive
        })
        .eq('id', selectedAffiliate.id);

      if (error) throw error;

      toast.success('Afiliado atualizado com sucesso!');
      setIsEditAffiliateOpen(false);
      setSelectedAffiliate(null);
      resetAffiliateForm();
      refetchAffiliates();
    } catch (error: any) {
      toast.error('Erro ao atualizar afiliado: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAffiliate = async () => {
    if (!selectedAffiliate) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('affiliates')
        .delete()
        .eq('id', selectedAffiliate.id);

      if (error) throw error;

      toast.success('Afiliado excluído com sucesso!');
      setIsDeleteAffiliateOpen(false);
      setSelectedAffiliate(null);
      refetchAffiliates();
    } catch (error: any) {
      toast.error('Erro ao excluir afiliado: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditAffiliateModal = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setAffiliateForm({
      name: affiliate.name,
      email: affiliate.email,
      phone: '', // Não temos phone no mock atual
      commissionFirstMonth: affiliate.commission,
      commissionRecurring: 10, // Valor padrão
      isActive: affiliate.status === 'active'
    });
    setIsEditAffiliateOpen(true);
  };

  const openDeleteAffiliateModal = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setIsDeleteAffiliateOpen(true);
  };

  const openViewAffiliateModal = (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    setIsViewAffiliateOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Ativo', variant: 'default' as const },
      inactive: { label: 'Inativo', variant: 'secondary' as const },
      suspended: { label: 'Suspenso', variant: 'destructive' as const },
      past_due: { label: 'Em Atraso', variant: 'destructive' as const },
      canceled: { label: 'Cancelado', variant: 'secondary' as const },
      trialing: { label: 'Trial', variant: 'outline' as const }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getRoleBadge = (role: string) => {
    const roleConfig = {
      super_admin: { label: 'Super Admin', variant: 'destructive' as const },
      tenant_admin: { label: 'Admin', variant: 'default' as const },
      tenant_user: { label: 'Usuário', variant: 'secondary' as const }
    };

    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.tenant_user;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

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
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="billing">Faturamento</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          <TabsTrigger value="affiliates">Afiliados</TabsTrigger>
          <TabsTrigger value="payments">Pagamentos</TabsTrigger>
          <TabsTrigger value="stripe" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Stripe
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usersLoading ? '...' : users.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {users.filter(u => {
                    const createdThisMonth = new Date(u.createdAt).getMonth() === new Date().getMonth();
                    return createdThisMonth;
                  }).length} novos este mês
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usersLoading ? '...' : activeUsers.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Últimos {activeUsersDateFilter} dias
                </p>
                <div className="mt-2">
                  <Select value={activeUsersDateFilter} onValueChange={setActiveUsersDateFilter}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 dias</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tenantsLoading ? '...' : subscriptions.filter(s => s.status === 'active').length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {subscriptions.filter(s => s.status === 'past_due').length} em atraso
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Novas Assinaturas</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tenantsLoading ? '...' : newSubscriptions.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Últimos {newSubscriptionsDateFilter} dias
                </p>
                <div className="mt-2">
                  <Select value={newSubscriptionsDateFilter} onValueChange={setNewSubscriptionsDateFilter}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 dias</SelectItem>
                      <SelectItem value="30">Últimos 30 dias</SelectItem>
                      <SelectItem value="90">Últimos 90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gestão de Usuários</CardTitle>
                  <CardDescription>
                    Gerencie todos os usuários da plataforma
                  </CardDescription>
                </div>
                <Dialog open={isCreateUserOpen} onOpenChange={setIsCreateUserOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={resetUserForm}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Usuário
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Criar Novo Usuário</DialogTitle>
                      <DialogDescription>
                        Preencha os dados para criar um novo usuário no sistema.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="firstName">Nome</Label>
                          <Input
                            id="firstName"
                            value={userForm.firstName}
                            onChange={(e) => setUserForm({...userForm, firstName: e.target.value})}
                            placeholder="Nome"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="lastName">Sobrenome</Label>
                          <Input
                            id="lastName"
                            value={userForm.lastName}
                            onChange={(e) => setUserForm({...userForm, lastName: e.target.value})}
                            placeholder="Sobrenome"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={userForm.email}
                          onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                          placeholder="email@exemplo.com"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                          id="phone"
                          value={userForm.phone}
                          onChange={(e) => setUserForm({...userForm, phone: e.target.value})}
                          placeholder="(11) 99999-9999"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="role">Função</Label>
                        <Select value={userForm.role} onValueChange={(value: User['role']) => setUserForm({...userForm, role: value})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="tenant_admin">Admin do Tenant</SelectItem>
                            <SelectItem value="tenant_user">Usuário</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="isActive"
                          checked={userForm.isActive}
                          onCheckedChange={(checked) => setUserForm({...userForm, isActive: checked})}
                        />
                        <Label htmlFor="isActive">Usuário ativo</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateUserOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateUser} disabled={isLoading}>
                        {isLoading ? 'Criando...' : 'Criar Usuário'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar usuários..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último Login</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Carregando...</TableCell>
                    </TableRow>
                  ) : usersError ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-red-500">
                        Erro ao carregar dados: {usersError.message}
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Nenhum usuário encontrado</TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        <TableCell>{formatDate(user.lastLogin)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Visualizar"
                              onClick={() => openViewModal(user)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Editar"
                              onClick={() => openEditModal(user)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              title="Excluir"
                              onClick={() => openDeleteModal(user)}
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

        {/* Modal de Edição de Usuário */}
        <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Atualize os dados do usuário {selectedUser?.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="editFirstName">Nome</Label>
                  <Input
                    id="editFirstName"
                    value={userForm.firstName}
                    onChange={(e) => setUserForm({...userForm, firstName: e.target.value})}
                    placeholder="Nome"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editLastName">Sobrenome</Label>
                  <Input
                    id="editLastName"
                    value={userForm.lastName}
                    onChange={(e) => setUserForm({...userForm, lastName: e.target.value})}
                    placeholder="Sobrenome"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editPhone">Telefone</Label>
                <Input
                  id="editPhone"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({...userForm, phone: e.target.value})}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editRole">Função</Label>
                <Select value={userForm.role} onValueChange={(value: User['role']) => setUserForm({...userForm, role: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="tenant_admin">Admin do Tenant</SelectItem>
                    <SelectItem value="tenant_user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editPlanType">Plano</Label>
                <Select value={userForm.planType} onValueChange={(value) => setUserForm({...userForm, planType: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Básico</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="editIsActive"
                  checked={userForm.isActive}
                  onCheckedChange={(checked) => setUserForm({...userForm, isActive: checked})}
                />
                <Label htmlFor="editIsActive">Usuário ativo</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditUser} disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de Confirmação de Exclusão */}
        <AlertDialog open={isDeleteUserOpen} onOpenChange={setIsDeleteUserOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o usuário <strong>{selectedUser?.name}</strong>?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteUser}
                disabled={isLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isLoading ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Modal de Visualização de Usuário */}
        <Dialog open={isViewUserOpen} onOpenChange={setIsViewUserOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Detalhes do Usuário</DialogTitle>
              <DialogDescription>
                Informações completas do usuário {selectedUser?.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Nome Completo</Label>
                  <p className="text-sm">{selectedUser?.name || 'Não informado'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                  <p className="text-sm">{selectedUser?.email || 'Não informado'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Telefone</Label>
                  <p className="text-sm">{selectedUser?.phone || 'Não informado'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Função</Label>
                  <div>{selectedUser && getRoleBadge(selectedUser.role)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <div>{selectedUser && getStatusBadge(selectedUser.status)}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Plano</Label>
                  <p className="text-sm capitalize">{selectedUser?.planType || 'Não informado'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Tenant</Label>
                  <p className="text-sm">{selectedUser?.tenantName || 'Não informado'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">Último Login</Label>
                  <p className="text-sm">{selectedUser?.lastLogin ? formatDate(selectedUser.lastLogin) : 'Nunca'}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-muted-foreground">Data de Criação</Label>
                <p className="text-sm">{selectedUser?.createdAt ? formatDate(selectedUser.createdAt) : 'Não informado'}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewUserOpen(false)}>
                Fechar
              </Button>
              <Button onClick={() => {
                setIsViewUserOpen(false);
                if (selectedUser) openEditModal(selectedUser);
              }}>
                Editar Usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TabsContent value="billing" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Faturamento e Assinaturas</CardTitle>
                  <CardDescription>
                    Gerencie assinaturas e pagamentos via Stripe
                  </CardDescription>
                </div>
                <Button>
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
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Próximo Pagamento</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Carregando...</TableCell>
                    </TableRow>
                  ) : subscriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">Nenhuma assinatura encontrada</TableCell>
                    </TableRow>
                  ) : (
                    subscriptions.map((subscription) => (
                      <TableRow key={subscription.id}>
                        <TableCell className="font-medium">{subscription.userName}</TableCell>
                        <TableCell>{subscription.plan}</TableCell>
                        <TableCell>{getStatusBadge(subscription.status)}</TableCell>
                        <TableCell>{formatCurrency(subscription.amount, subscription.currency)}</TableCell>
                        <TableCell>{formatDate(subscription.nextBilling)}</TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
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

        <TabsContent value="reports" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Relatório de Receitas</CardTitle>
                <CardDescription>
                  Análise financeira mensal
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Janeiro 2024</span>
                    <span className="font-bold">{formatCurrency(2450.00)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Dezembro 2023</span>
                    <span className="font-bold">{formatCurrency(2180.00)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Novembro 2023</span>
                    <span className="font-bold">{formatCurrency(1950.00)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Cobranças Pendentes</CardTitle>
                <CardDescription>
                  Pagamentos em atraso ou falharam
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span>3 cobranças falharam</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-warning" />
                    <span>5 pagamentos em atraso</span>
                  </div>
                  <Button variant="outline" className="w-full">
                    Ver Detalhes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="affiliates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gestão de Afiliados</CardTitle>
                  <CardDescription>
                    Gerencie o programa de afiliados
                  </CardDescription>
                </div>
                <Button onClick={() => setIsCreateAffiliateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Afiliado
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Ganhos Totais</TableHead>
                    <TableHead>Indicações</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliates.map((affiliate) => (
                    <TableRow key={affiliate.id}>
                      <TableCell className="font-medium">{affiliate.name}</TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {affiliate.code}
                        </code>
                      </TableCell>
                      <TableCell>{affiliate.commission}%</TableCell>
                      <TableCell>{formatCurrency(affiliate.totalEarnings)}</TableCell>
                      <TableCell>{affiliate.referrals}</TableCell>
                      <TableCell>{getStatusBadge(affiliate.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openViewAffiliateModal(affiliate)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openEditAffiliateModal(affiliate)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openDeleteAffiliateModal(affiliate)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <CommissionPayments />
        </TabsContent>

        <TabsContent value="stripe" className="space-y-4">
          <StripeConfiguration />
        </TabsContent>
      </Tabs>

      {/* Modal para criar afiliado */}
      <Dialog open={isCreateAffiliateOpen} onOpenChange={setIsCreateAffiliateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Novo Afiliado</DialogTitle>
            <DialogDescription>
              Cadastre um novo afiliado para o sistema.
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
                onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                className="col-span-3"
                placeholder="Nome do afiliado"
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
                onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                className="col-span-3"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">
                Telefone
              </Label>
              <Input
                id="phone"
                value={affiliateForm.phone}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                className="col-span-3"
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="commissionFirst" className="text-right">
                Comissão 1º Mês (%)
              </Label>
              <Input
                id="commissionFirst"
                type="number"
                value={affiliateForm.commissionFirstMonth}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, commissionFirstMonth: Number(e.target.value) })}
                className="col-span-3"
                min="0"
                max="100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="commissionRecurring" className="text-right">
                Comissão Recorrente (%)
              </Label>
              <Input
                id="commissionRecurring"
                type="number"
                value={affiliateForm.commissionRecurring}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, commissionRecurring: Number(e.target.value) })}
                className="col-span-3"
                min="0"
                max="100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isActive" className="text-right">
                Ativo
              </Label>
              <Switch
                id="isActive"
                checked={affiliateForm.isActive}
                onCheckedChange={(checked) => setAffiliateForm({ ...affiliateForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateAffiliateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateAffiliate} disabled={isLoading}>
              {isLoading ? 'Criando...' : 'Criar Afiliado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para editar afiliado */}
      <Dialog open={isEditAffiliateOpen} onOpenChange={setIsEditAffiliateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Afiliado</DialogTitle>
            <DialogDescription>
              Edite as informações do afiliado.
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
                onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                className="col-span-3"
                placeholder="Nome do afiliado"
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
                onChange={(e) => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                className="col-span-3"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-phone" className="text-right">
                Telefone
              </Label>
              <Input
                id="edit-phone"
                value={affiliateForm.phone}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                className="col-span-3"
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-commissionFirst" className="text-right">
                Comissão 1º Mês (%)
              </Label>
              <Input
                id="edit-commissionFirst"
                type="number"
                value={affiliateForm.commissionFirstMonth}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, commissionFirstMonth: Number(e.target.value) })}
                className="col-span-3"
                min="0"
                max="100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-commissionRecurring" className="text-right">
                Comissão Recorrente (%)
              </Label>
              <Input
                id="edit-commissionRecurring"
                type="number"
                value={affiliateForm.commissionRecurring}
                onChange={(e) => setAffiliateForm({ ...affiliateForm, commissionRecurring: Number(e.target.value) })}
                className="col-span-3"
                min="0"
                max="100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-isActive" className="text-right">
                Ativo
              </Label>
              <Switch
                id="edit-isActive"
                checked={affiliateForm.isActive}
                onCheckedChange={(checked) => setAffiliateForm({ ...affiliateForm, isActive: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditAffiliateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditAffiliate} disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para visualizar afiliado */}
      <Dialog open={isViewAffiliateOpen} onOpenChange={setIsViewAffiliateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes do Afiliado</DialogTitle>
            <DialogDescription>
              Informações completas do afiliado.
            </DialogDescription>
          </DialogHeader>
          {selectedAffiliate && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Nome</Label>
                  <p className="text-sm">{selectedAffiliate.name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                  <p className="text-sm">{selectedAffiliate.email}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Código</Label>
                  <p className="text-sm font-mono">{selectedAffiliate.code}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Comissão</Label>
                  <p className="text-sm">{selectedAffiliate.commission}%</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge variant={selectedAffiliate.status === 'active' ? 'default' : 'secondary'}>
                    {selectedAffiliate.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Total de Indicações</Label>
                  <p className="text-sm font-semibold">{selectedAffiliate.referrals}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Ganhos Totais</Label>
                  <p className="text-sm font-semibold">{formatCurrency(selectedAffiliate.totalEarnings)}</p>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Data de Cadastro</Label>
                <p className="text-sm">{formatDate(selectedAffiliate.joinedAt)}</p>
              </div>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium">Link de Indicação</Label>
                <div className="flex items-center space-x-2 mt-2">
                  <Input 
                    value={`${window.location.origin}/signup?ref=${selectedAffiliate.code}`}
                    readOnly
                    className="text-xs"
                  />
                  <Button 
                    size="sm" 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/signup?ref=${selectedAffiliate.code}`);
                      toast.success('Link copiado!');
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsViewAffiliateOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para deletar afiliado */}
      <AlertDialog open={isDeleteAffiliateOpen} onOpenChange={setIsDeleteAffiliateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o afiliado "{selectedAffiliate?.name}"? 
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteAffiliate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;