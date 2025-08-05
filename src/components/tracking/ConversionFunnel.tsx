
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const funnelData = [
  { stage: 'Visitantes', count: 2450, percentage: 100, color: 'bg-blue-500' },
  { stage: 'Leads', count: 435, percentage: 17.8, color: 'bg-green-500' },
  { stage: 'Qualificados', count: 187, percentage: 7.6, color: 'bg-yellow-500' },
  { stage: 'Propostas', count: 89, percentage: 3.6, color: 'bg-orange-500' },
  { stage: 'Vendas', count: 34, percentage: 1.4, color: 'bg-purple-500' },
];

export const ConversionFunnel = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Funil de Conversão</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {funnelData.map((stage, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{stage.stage}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold">{stage.count}</span>
                  <span className="text-sm text-muted-foreground">
                    ({stage.percentage}%)
                  </span>
                </div>
              </div>
              <Progress 
                value={stage.percentage} 
                className="h-3"
              />
              {index < funnelData.length - 1 && (
                <div className="flex justify-center my-2">
                  <div className="text-xs text-muted-foreground">
                    ↓ {((funnelData[index + 1].count / stage.count) * 100).toFixed(1)}% conversão
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
