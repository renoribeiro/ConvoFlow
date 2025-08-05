
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Save } from 'lucide-react';

export const AppearanceSettings = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparência</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="darkMode">Modo Escuro</Label>
            <p className="text-sm text-muted-foreground">
              Alternar entre tema claro e escuro
            </p>
          </div>
          <Switch id="darkMode" />
        </div>
        
        <Separator />
        
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="compactMode">Modo Compacto</Label>
            <p className="text-sm text-muted-foreground">
              Reduzir espaçamento para melhor aproveitamento
            </p>
          </div>
          <Switch id="compactMode" />
        </div>

        <Button>
          <Save className="w-4 h-4 mr-2" />
          Salvar Preferências
        </Button>
      </CardContent>
    </Card>
  );
};
