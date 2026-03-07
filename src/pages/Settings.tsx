
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, 
  Bell, 
  Shield, 
  Database, 
  Palette, 
  Settings as SettingsIcon,
  Smartphone,
  CreditCard
} from 'lucide-react';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { IntegrationSettings } from '@/components/settings/IntegrationSettings';
import { SubscriptionSettings } from '@/components/settings/SubscriptionSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { ModuleSettings } from '@/components/settings/ModuleSettings';
import { WhatsAppApiSettings } from '@/components/whatsapp/WhatsAppApiSettings';
import { useIsSuperAdmin } from '@/contexts/TenantContext';
import { useSearchParams } from 'react-router-dom';


export default function Settings() {
  const isSuperAdmin = useIsSuperAdmin();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'profile';
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie as configurações da sua conta e preferências do sistema"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Configurações' }
        ]}
      />

      <Tabs defaultValue={currentTab} className="space-y-6">
        <TabsList className={`grid w-full ${isSuperAdmin ? 'grid-cols-7' : 'grid-cols-7'}`}>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Perfil
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Assinatura
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notificações
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="whatsapp-api" className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            API WhatsApp
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Aparência
          </TabsTrigger>
          {isSuperAdmin && (
              <TabsTrigger value="modules" className="flex items-center gap-2">
                <SettingsIcon className="w-4 h-4" />
                Módulos
              </TabsTrigger>
            )}
        </TabsList>

        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationSettings />
        </TabsContent>

        <TabsContent value="whatsapp-api">
          <WhatsAppApiSettings />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        
        {isSuperAdmin && (
          <TabsContent value="modules">
            <ModuleSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
