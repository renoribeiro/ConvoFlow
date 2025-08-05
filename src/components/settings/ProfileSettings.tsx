
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Camera, Save, User, AlertCircle } from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useTenant } from '@/contexts/TenantContext';



export const ProfileSettings = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const { toast } = useToast();
  const { tenant, user } = useTenant();

  // Buscar perfil do usuário
  const { data: profileData, isLoading, error } = useSupabaseQuery({
    table: 'profiles',
    queryKey: ['user-profile', user?.id],
    select: '*',
    filters: user?.id ? [{ column: 'id', operator: 'eq', value: user.id }] : [],
    enabled: !!user?.id
  });

  const profile = profileData?.[0];

  // Atualizar estados quando o perfil for carregado
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setPhone(profile.phone || '');
      setCompany(profile.company || '');
    }
  }, [profile]);

  // Mutation para atualizar perfil
  const updateProfileMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'update',
    invalidateQueries: [['user-profile', user?.id]],
    successMessage: 'Perfil atualizado com sucesso!',
    errorMessage: 'Erro ao atualizar perfil',
    onError: (error: any) => {
      toast({
          title: 'Erro',
          description: error.message || 'Erro ao atualizar perfil',
          variant: 'destructive'
        });
      }
    }
  );

  const handleSaveProfile = () => {
    const profileData = {
      id: user?.id,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      company: company
    };

    updateProfileMutation.mutate(profileData);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Informações do Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <div>
          <h3 className="font-semibold">Erro ao carregar perfil</h3>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Erro desconhecido'}
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.avatar_url} />
            <AvatarFallback>
              <User className="h-8 w-8" />
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>Informações do Perfil</CardTitle>
            <div className="flex items-center space-x-2 mt-2">
              <Badge variant="secondary">{profile?.role || 'Usuário'}</Badge>
              {profile?.tenant_id && (
                <Badge variant="outline">ID: {profile.tenant_id.slice(0, 8)}</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input 
              id="firstName" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input 
              id="lastName" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Seu sobrenome"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input 
            id="email" 
            type="email" 
            value={profile?.email || ''}
            disabled
            className="bg-gray-50"
          />
          <p className="text-xs text-gray-500">
            O email não pode ser alterado aqui. Use as configurações de segurança.
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input 
            id="phone" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 99999-0000"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="company">Empresa</Label>
          <Input 
            id="company" 
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nome da sua empresa"
          />
        </div>

        <Button 
          onClick={handleSaveProfile}
          disabled={updateProfileMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
        </Button>
      </CardContent>
    </Card>
  );
};
