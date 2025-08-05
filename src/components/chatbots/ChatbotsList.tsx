
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Bot, 
  Edit, 
  Trash2, 
  Copy, 
  Play, 
  Pause, 
  MessageSquare,
  Eye,
  MoreHorizontal,
  TestTube,
  Download,
  Upload
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/shared/EmptyState';
import { useChatbot } from '@/contexts/ChatbotContext';
import { useToast } from '@/hooks/use-toast';

interface ChatbotsListProps {
  onEdit: (botId: string) => void;
  onTest: (botId: string) => void;
  selectedBot?: string | null;
}

export const ChatbotsList = ({ onEdit, onTest }: ChatbotsListProps) => {
  const { chatbots, toggleChatbot, deleteChatbot, duplicateChatbot, exportChatbot } = useChatbot();
  const { toast } = useToast();

  const handleExport = async (botId: string) => {
    try {
      const exportData = await exportChatbot(botId);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatbot-${botId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o chatbot.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (botId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este chatbot?')) {
      await deleteChatbot(botId);
    }
  };

  if (chatbots.length === 0) {
    return (
      <EmptyState
        icon={<Bot className="w-full h-full" />}
        title="Nenhum chatbot criado"
        description="Crie seu primeiro chatbot para automatizar o atendimento no WhatsApp"
        action={{
          label: "Criar Primeiro Chatbot",
          onClick: () => onEdit('new')
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {chatbots.map((bot) => (
        <Card key={bot.id} className="relative group hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bot.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{bot.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={bot.type === 'flow' ? 'default' : 'secondary'}>
                      {bot.type === 'flow' ? 'Fluxo' : 'Simples'}
                    </Badge>
                    <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                      {bot.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(bot.id)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTest(bot.id)}>
                    <TestTube className="mr-2 h-4 w-4" />
                    Testar
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Eye className="mr-2 h-4 w-4" />
                    Visualizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateChatbot(bot.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(bot.id)}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleDelete(bot.id)}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{bot.description}</p>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">GATILHOS ({bot.triggers.length})</p>
                <div className="flex flex-wrap gap-1">
                  {bot.triggers.slice(0, 3).map((trigger, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {trigger.phrase}
                    </Badge>
                  ))}
                  {bot.triggers.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{bot.triggers.length - 3} mais
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{bot.analytics.totalInteractions} interações</span>
                </div>
                <span className="text-muted-foreground">
                  {bot.analytics.successRate.toFixed(1)}% sucesso
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  checked={bot.isActive}
                  onCheckedChange={() => toggleChatbot(bot.id)}
                />
                <span className="text-sm font-medium">
                  {bot.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTest(bot.id)}
                >
                  <TestTube className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(bot.id)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant={bot.isActive ? "outline" : "default"}
                  size="sm"
                  onClick={() => toggleChatbot(bot.id)}
                >
                  {bot.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
