import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Camera, Save } from 'lucide-react';

export function ProfileSettings() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Buscar dados do perfil
  const { data: profile, isLoading } = useSupabaseQuery({
    table: 'profiles',
    select: '*',
    filters: [{ column: 'user_id', operator: 'eq', value: user?.id }],
    single: true
  });

  // Mutação para atualizar perfil
  const updateProfileMutation = useSupabaseMutation({
    table: 'profiles',
    operation: 'update',
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    }
  });

  // Preencher campos quando os dados do perfil carregarem
  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  const handleSave = () => {
    if (!user?.id) return;

    updateProfileMutation.mutate({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      bio: bio,
      avatar_url: avatarUrl
    });
  };

  const getInitials = () => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Carregando informações do perfil...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>
          Gerencie suas informações pessoais e preferências de conta
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar Section */}
        <div className="flex items-center space-x-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl} alt="Avatar" />
            <AvatarFallback className="text-lg">
              {getInitials() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <Button variant="outline" size="sm">
              <Camera className="h-4 w-4 mr-2" />
              Alterar Foto
            </Button>
            <p className="text-sm text-muted-foreground">
              JPG, GIF ou PNG. Máximo 1MB.
            </p>
          </div>
        </div>

        {/* Personal Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Conte um pouco sobre você..."
            rows={3}
          />
        </div>

        <div className="flex justify-end">
          <Button 
            onClick={handleSave}
            disabled={updateProfileMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}