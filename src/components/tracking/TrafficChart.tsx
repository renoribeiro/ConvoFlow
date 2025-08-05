
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { date: '01/01', leads: 12, conversions: 3 },
  { date: '02/01', leads: 19, conversions: 4 },
  { date: '03/01', leads: 15, conversions: 2 },
  { date: '04/01', leads: 22, conversions: 6 },
  { date: '05/01', leads: 28, conversions: 7 },
  { date: '06/01', leads: 24, conversions: 5 },
  { date: '07/01', leads: 31, conversions: 8 },
  { date: '08/01', leads: 27, conversions: 6 },
  { date: '09/01', leads: 35, conversions: 9 },
  { date: '10/01', leads: 29, conversions: 7 },
  { date: '11/01', leads: 41, conversions: 11 },
  { date: '12/01', leads: 38, conversions: 10 },
];

export const TrafficChart = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução de Leads e Conversões</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="leads" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              name="Leads"
            />
            <Line 
              type="monotone" 
              dataKey="conversions" 
              stroke="hsl(var(--success))" 
              strokeWidth={2}
              name="Conversões"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
