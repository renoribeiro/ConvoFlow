
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

export const NotificationSettings = () => {
  const [newMessages, setNewMessages] = useState(true);
  const [followups, setFollowups] = useState(true);
  const [campaigns, setCampaigns] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    
    try {
      // Simular salvamento das preferências
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Aqui você salvaria as preferências no backend
      const preferences = {
        newMessages,
        followups,
        campaigns
      };
      
      console.log('Salvando preferências:', preferences);
      toast.success('Preferências de notificação salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar preferências. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências de Notificação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="newMessages">Novas Mensagens</Label>
            <p className="text-sm text-muted-foreground">
              Receber notificações quando chegarem novas mensagens
            </p>
          </div>
          <Switch 
            id="newMessages" 
            checked={newMessages}
            onCheckedChange={setNewMessages}
          />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="followups">Follow-ups</Label>
            <p className="text-sm text-muted-foreground">
              Lembrar sobre tarefas de follow-up pendentes
            </p>
          </div>
          <Switch 
            id="followups" 
            checked={followups}
            onCheckedChange={setFollowups}
          />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="campaigns">Campanhas</Label>
            <p className="text-sm text-muted-foreground">
              Notificações sobre status de campanhas
            </p>
          </div>
          <Switch 
            id="campaigns" 
            checked={campaigns}
            onCheckedChange={setCampaigns}
          />
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Preferências'}
        </Button>
      </CardContent>
    </Card>
  );
};
