
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';

export const SecuritySettings = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Segurança da Conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Senha Atual</Label>
          <Input id="currentPassword" type="password" />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nova Senha</Label>
          <Input id="newPassword" type="password" />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
          <Input id="confirmPassword" type="password" />
        </div>

        <Button>
          <Save className="w-4 h-4 mr-2" />
          Alterar Senha
        </Button>
      </CardContent>
    </Card>
  );
};
