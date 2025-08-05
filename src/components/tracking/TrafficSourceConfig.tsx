
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  Facebook, 
  Instagram, 
  Search, 
  Users, 
  Link, 
  MoreHorizontal,
  Plus,
  Settings,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { SourceConfigModal } from './SourceConfigModal';

interface TrafficSource {
  id: string;
  name: string;
  type: 'organic' | 'paid' | 'social' | 'direct' | 'referral';
  isActive: boolean;
  leadsCount: number;
  conversionRate: number;
  lastActivity: string;
}

const mockSources: TrafficSource[] = [
  {
    id: '1',
    name: 'Site Institucional',
    type: 'organic',
    isActive: true,
    leadsCount: 124,
    conversionRate: 3.2,
    lastActivity: '2 horas atrás'
  },
  {
    id: '2',
    name: 'Facebook Ads',
    type: 'paid',
    isActive: true,
    leadsCount: 89,
    conversionRate: 5.8,
    lastActivity: '15 min atrás'
  },
  {
    id: '3',
    name: 'Instagram Stories',
    type: 'social',
    isActive: true,
    leadsCount: 67,
    conversionRate: 4.1,
    lastActivity: '1 hora atrás'
  },
  {
    id: '4',
    name: 'Google Ads',
    type: 'paid',
    isActive: false,
    leadsCount: 45,
    conversionRate: 2.9,
    lastActivity: '2 dias atrás'
  },
  {
    id: '5',
    name: 'Linktree',
    type: 'referral',
    isActive: true,
    leadsCount: 32,
    conversionRate: 6.2,
    lastActivity: '30 min atrás'
  },
  {
    id: '6',
    name: 'Tráfego Direto',
    type: 'direct',
    isActive: true,
    leadsCount: 78,
    conversionRate: 1.8,
    lastActivity: '5 min atrás'
  }
];

const getSourceIcon = (type: string) => {
  switch (type) {
    case 'organic': return <Globe className="w-5 h-5" />;
    case 'social': return <Instagram className="w-5 h-5" />;
    case 'paid': return <Search className="w-5 h-5" />;
    case 'direct': return <Users className="w-5 h-5" />;
    case 'referral': return <Link className="w-5 h-5" />;
    default: return <Globe className="w-5 h-5" />;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case 'organic': return 'bg-green-100 text-green-800';
    case 'social': return 'bg-purple-100 text-purple-800';
    case 'paid': return 'bg-blue-100 text-blue-800';
    case 'direct': return 'bg-gray-100 text-gray-800';
    case 'referral': return 'bg-orange-100 text-orange-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export const TrafficSourceConfig = () => {
  const [sources, setSources] = useState<TrafficSource[]>(mockSources);
  const [showModal, setShowModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<TrafficSource | null>(null);

  const toggleSourceStatus = (id: string) => {
    setSources(sources.map(source => 
      source.id === id ? { ...source, isActive: !source.isActive } : source
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Fontes Ativas</p>
                <p className="text-2xl font-bold">
                  {sources.filter(s => s.isActive).length}
                </p>
              </div>
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Eye className="w-4 h-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Leads</p>
                <p className="text-2xl font-bold">
                  {sources.reduce((acc, s) => acc + s.leadsCount, 0)}
                </p>
              </div>
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Melhor Fonte</p>
                <p className="text-2xl font-bold">Linktree</p>
              </div>
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <Link className="w-4 h-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Conversão Média</p>
                <p className="text-2xl font-bold">4.0%</p>
              </div>
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <Search className="w-4 h-4 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Fontes de Tráfego</CardTitle>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Fonte
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                    {getSourceIcon(source.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{source.name}</h3>
                      <Badge className={getTypeColor(source.type)}>
                        {source.type}
                      </Badge>
                      {source.isActive ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Ativa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-600 border-gray-600">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Última atividade: {source.lastActivity}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold">{source.leadsCount}</p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{source.conversionRate}%</p>
                    <p className="text-xs text-muted-foreground">Conversão</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleSourceStatus(source.id)}
                    >
                      {source.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedSource(source);
                        setShowModal(true);
                      }}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SourceConfigModal
        open={showModal}
        onOpenChange={setShowModal}
        source={selectedSource}
        onSave={(source) => {
          if (selectedSource) {
            setSources(sources.map(s => s.id === selectedSource.id ? { ...s, ...source } : s));
          } else {
            const newSource: TrafficSource = {
              ...source,
              id: Date.now().toString(),
              leadsCount: source.leadsCount || 0,
              conversionRate: source.conversionRate || 0,
              lastActivity: source.lastActivity || 'Nunca'
            };
            setSources([...sources, newSource]);
          }
          setShowModal(false);
          setSelectedSource(null);
        }}
      />
    </div>
  );
};
