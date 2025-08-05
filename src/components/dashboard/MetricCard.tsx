import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export const MetricCard = ({ 
  title, 
  value, 
  description, 
  icon, 
  trend,
  className 
}: MetricCardProps) => {
  return (
    <Card className={cn("hover:shadow-medium transition-all duration-200", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {trend && (
          <div className={cn(
            "text-xs mt-2 flex items-center",
            trend.isPositive ? "text-status-success" : "text-status-error"
          )}>
            <span className="mr-1">
              {trend.isPositive ? "↗" : "↘"}
            </span>
            {Math.abs(trend.value)}% em relação ao mês anterior
          </div>
        )}
      </CardContent>
    </Card>
  );
};