
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Save } from 'lucide-react';

export const NotificationSettings = () => {
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
          <Switch id="newMessages" defaultChecked />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="followups">Follow-ups</Label>
            <p className="text-sm text-muted-foreground">
              Lembrar sobre tarefas de follow-up pendentes
            </p>
          </div>
          <Switch id="followups" defaultChecked />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="campaigns">Campanhas</Label>
            <p className="text-sm text-muted-foreground">
              Notificações sobre status de campanhas
            </p>
          </div>
          <Switch id="campaigns" />
        </div>

        <Button>
          <Save className="w-4 h-4 mr-2" />
          Salvar Preferências
        </Button>
      </CardContent>
    </Card>
  );
};
