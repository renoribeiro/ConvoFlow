import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  MessageSquare,
  Plus,
  Edit,
  Trash2,
  Copy,
  Eye,
  Search,
  Filter,
  Download,
  Upload,
  Save,
  Star,
  StarOff,
  Send,
  Image,
  FileText,
  Video,
  Mic,
  Paperclip,
  Hash,
  AtSign,
  Calendar,
  Clock,
  Users,
  Tag,
  Folder,
  FolderPlus,
  Settings,
  Zap,
  TrendingUp,
  BarChart3,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Globe,
  Smartphone,
  Mail,
  Phone,
  MessageCircle,
  Headphones,
  Monitor,
  Palette,
  Type,
  AlignLeft,
  Bold,
  Italic,
  Underline,
  Link,
  List,
  Quote,
  Code,
  Smile,
  Heart,
  ThumbsUp,
  Gift,
  Percent,
  DollarSign,
  ShoppingCart,
  Package,
  Truck,
  CreditCard,
  Receipt,
  Target,
  Megaphone,
  Bell,
  Crown,
  Award,
  Sparkles
} from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface MessageTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive';
  channel: 'whatsapp' | 'email' | 'sms' | 'all';
  variables: TemplateVariable[];
  media?: {
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    filename?: string;
    caption?: string;
  };
  buttons?: TemplateButton[];
  quick_replies?: string[];
  status: 'active' | 'inactive' | 'pending_approval' | 'rejected';
  is_favorite: boolean;
  usage_count: number;
  success_rate: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  tags: string[];
  folder_id?: string;
}

interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'date' | 'url' | 'phone' | 'email';
  required: boolean;
  default_value?: string;
  description?: string;
}

interface TemplateButton {
  type: 'url' | 'phone' | 'quick_reply';
  text: string;
  value: string;
}

interface TemplateFolder {
  id: string;
  name: string;
  description?: string;
  color: string;
  parent_id?: string;
  template_count: number;
}

interface TemplateCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  template_count: number;
}

// Templates mockados
const mockTemplates: MessageTemplate[] = [
  {
    id: '1',
    name: 'Boas-vindas Padrão',
    description: 'Mensagem de boas-vindas para novos clientes',
    content: 'Olá {{nome}}! 👋\n\nSeja bem-vindo(a) à {{empresa}}! Estamos muito felizes em tê-lo(a) conosco.\n\nComo posso ajudá-lo(a) hoje?',
    category: 'boas-vindas',
    type: 'text',
    channel: 'whatsapp',
    variables: [
      { name: 'nome', type: 'text', required: true, description: 'Nome do cliente' },
      { name: 'empresa', type: 'text', required: true, default_value: 'Nossa Empresa', description: 'Nome da empresa' }
    ],
    quick_replies: ['Quero fazer um pedido', 'Preciso de suporte', 'Ver catálogo'],
    status: 'active',
    is_favorite: true,
    usage_count: 1250,
    success_rate: 98.5,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-03T10:00:00Z',
    created_by: 'João Silva',
    tags: ['boas-vindas', 'automático', 'padrão'],
    folder_id: '1'
  },
  {
    id: '2',
    name: 'Confirmação de Pedido',
    description: 'Confirma o pedido realizado pelo cliente',
    content: '✅ *Pedido Confirmado!*\n\n📦 Pedido: #{{numero_pedido}}\n💰 Valor: R$ {{valor}}\n📅 Data: {{data}}\n\n🚚 Seu pedido será entregue em até {{prazo_entrega}} dias úteis.\n\nObrigado pela preferência! 😊',
    category: 'vendas',
    type: 'text',
    channel: 'whatsapp',
    variables: [
      { name: 'numero_pedido', type: 'text', required: true, description: 'Número do pedido' },
      { name: 'valor', type: 'number', required: true, description: 'Valor total do pedido' },
      { name: 'data', type: 'date', required: true, description: 'Data do pedido' },
      { name: 'prazo_entrega', type: 'number', required: true, default_value: '5', description: 'Prazo de entrega em dias' }
    ],
    buttons: [
      { type: 'url', text: 'Acompanhar Pedido', value: 'https://loja.com/pedido/{{numero_pedido}}' },
      { type: 'phone', text: 'Falar com Suporte', value: '+5511999999999' }
    ],
    status: 'active',
    is_favorite: false,
    usage_count: 856,
    success_rate: 95.2,
    created_at: '2024-01-02T14:00:00Z',
    updated_at: '2024-01-03T08:00:00Z',
    created_by: 'Maria Santos',
    tags: ['vendas', 'confirmação', 'pedido'],
    folder_id: '2'
  },
  {
    id: '3',
    name: 'Carrinho Abandonado',
    description: 'Lembra o cliente sobre itens no carrinho',
    content: '🛒 *Você esqueceu algo!*\n\nOi {{nome}}, vi que você deixou alguns itens incríveis no seu carrinho:\n\n{{itens_carrinho}}\n\n💸 Total: R$ {{valor_total}}\n\n🎁 *Oferta especial:* Use o cupom {{cupom}} e ganhe {{desconto}}% de desconto!\n\nFinalizar compra agora? 👇',
    category: 'marketing',
    type: 'text',
    channel: 'whatsapp',
    variables: [
      { name: 'nome', type: 'text', required: true, description: 'Nome do cliente' },
      { name: 'itens_carrinho', type: 'text', required: true, description: 'Lista de itens no carrinho' },
      { name: 'valor_total', type: 'number', required: true, description: 'Valor total do carrinho' },
      { name: 'cupom', type: 'text', required: true, default_value: 'VOLTA10', description: 'Código do cupom' },
      { name: 'desconto', type: 'number', required: true, default_value: '10', description: 'Percentual de desconto' }
    ],
    buttons: [
      { type: 'url', text: 'Finalizar Compra', value: 'https://loja.com/checkout' },
      { type: 'quick_reply', text: 'Ver mais produtos', value: 'ver_produtos' }
    ],
    status: 'active',
    is_favorite: true,
    usage_count: 642,
    success_rate: 87.3,
    created_at: '2024-01-01T16:00:00Z',
    updated_at: '2024-01-02T12:00:00Z',
    created_by: 'Ana Costa',
    tags: ['marketing', 'carrinho', 'desconto'],
    folder_id: '2'
  },
  {
    id: '4',
    name: 'Suporte Técnico',
    description: 'Template para atendimento de suporte',
    content: '🔧 *Suporte Técnico*\n\nOlá {{nome}}!\n\nRecebemos sua solicitação de suporte sobre: {{assunto}}\n\n📋 Protocolo: {{protocolo}}\n⏰ Abertura: {{data_abertura}}\n\nNosso time está analisando e retornará em breve.\n\nTempo médio de resposta: {{tempo_resposta}} horas.',
    category: 'suporte',
    type: 'text',
    channel: 'all',
    variables: [
      { name: 'nome', type: 'text', required: true, description: 'Nome do cliente' },
      { name: 'assunto', type: 'text', required: true, description: 'Assunto da solicitação' },
      { name: 'protocolo', type: 'text', required: true, description: 'Número do protocolo' },
      { name: 'data_abertura', type: 'date', required: true, description: 'Data de abertura' },
      { name: 'tempo_resposta', type: 'number', required: true, default_value: '24', description: 'Tempo de resposta em horas' }
    ],
    quick_replies: ['Urgente', 'Posso aguardar', 'Mais informações'],
    status: 'active',
    is_favorite: false,
    usage_count: 423,
    success_rate: 92.1,
    created_at: '2024-01-03T11:00:00Z',
    updated_at: '2024-01-03T11:00:00Z',
    created_by: 'Carlos Lima',
    tags: ['suporte', 'protocolo', 'atendimento'],
    folder_id: '3'
  },
  {
    id: '5',
    name: 'Promoção Flash',
    description: 'Template para promoções por tempo limitado',
    content: '⚡ *PROMOÇÃO FLASH* ⚡\n\n🔥 {{produto}} com {{desconto}}% OFF!\n\n~~R$ {{preco_original}}~~\n💰 *R$ {{preco_promocional}}*\n\n⏰ *Apenas por {{tempo_restante}}!*\n\n{{descricao_produto}}\n\n🛒 Aproveite agora!',
    category: 'marketing',
    type: 'image',
    channel: 'whatsapp',
    variables: [
      { name: 'produto', type: 'text', required: true, description: 'Nome do produto' },
      { name: 'desconto', type: 'number', required: true, description: 'Percentual de desconto' },
      { name: 'preco_original', type: 'number', required: true, description: 'Preço original' },
      { name: 'preco_promocional', type: 'number', required: true, description: 'Preço promocional' },
      { name: 'tempo_restante', type: 'text', required: true, description: 'Tempo restante da promoção' },
      { name: 'descricao_produto', type: 'text', required: false, description: 'Descrição do produto' }
    ],
    media: {
      type: 'image',
      url: 'https://example.com/promo-image.jpg',
      caption: 'Promoção especial por tempo limitado!'
    },
    buttons: [
      { type: 'url', text: 'Comprar Agora', value: 'https://loja.com/produto/{{produto_id}}' },
      { type: 'quick_reply', text: 'Ver mais promoções', value: 'ver_promocoes' }
    ],
    status: 'pending_approval',
    is_favorite: false,
    usage_count: 0,
    success_rate: 0,
    created_at: '2024-01-03T15:00:00Z',
    updated_at: '2024-01-03T15:00:00Z',
    created_by: 'Marketing Team',
    tags: ['marketing', 'promoção', 'flash', 'desconto'],
    folder_id: '2'
  }
];

// Pastas mockadas
const mockFolders: TemplateFolder[] = [
  { id: '1', name: 'Atendimento', description: 'Templates para atendimento ao cliente', color: 'blue', template_count: 8 },
  { id: '2', name: 'Vendas', description: 'Templates para processo de vendas', color: 'green', template_count: 12 },
  { id: '3', name: 'Suporte', description: 'Templates para suporte técnico', color: 'orange', template_count: 6 },
  { id: '4', name: 'Marketing', description: 'Templates para campanhas de marketing', color: 'purple', template_count: 15 }
];

// Categorias mockadas
const mockCategories: TemplateCategory[] = [
  { id: 'boas-vindas', name: 'Boas-vindas', icon: 'wave', color: 'blue', description: 'Mensagens de boas-vindas', template_count: 5 },
  { id: 'vendas', name: 'Vendas', icon: 'shopping-cart', color: 'green', description: 'Templates de vendas', template_count: 12 },
  { id: 'marketing', name: 'Marketing', icon: 'megaphone', color: 'purple', description: 'Campanhas de marketing', template_count: 18 },
  { id: 'suporte', name: 'Suporte', icon: 'headphones', color: 'orange', description: 'Atendimento e suporte', template_count: 8 },
  { id: 'cobranca', name: 'Cobrança', icon: 'credit-card', color: 'red', description: 'Templates de cobrança', template_count: 4 },
  { id: 'feedback', name: 'Feedback', icon: 'star', color: 'yellow', description: 'Coleta de feedback', template_count: 3 }
];

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'whatsapp': return <MessageCircle className="h-4 w-4" />;
    case 'email': return <Mail className="h-4 w-4" />;
    case 'sms': return <Smartphone className="h-4 w-4" />;
    case 'all': return <Globe className="h-4 w-4" />;
    default: return <MessageSquare className="h-4 w-4" />;
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'text': return <Type className="h-4 w-4" />;
    case 'image': return <Image className="h-4 w-4" />;
    case 'video': return <Video className="h-4 w-4" />;
    case 'audio': return <Mic className="h-4 w-4" />;
    case 'document': return <FileText className="h-4 w-4" />;
    case 'interactive': return <Zap className="h-4 w-4" />;
    default: return <MessageSquare className="h-4 w-4" />;
  }
};

const getStatusBadge = (status: string) => {
  const variants = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending_approval: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800'
  };

  const labels = {
    active: 'Ativo',
    inactive: 'Inativo',
    pending_approval: 'Aguardando Aprovação',
    rejected: 'Rejeitado'
  };

  return (
    <Badge className={variants[status as keyof typeof variants]}>
      {labels[status as keyof typeof labels]}
    </Badge>
  );
};

const TemplateCard = ({ template, onEdit, onDelete, onDuplicate, onToggleFavorite, onPreview }: {
  template: MessageTemplate;
  onEdit: (template: MessageTemplate) => void;
  onDelete: (id: string) => void;
  onDuplicate: (template: MessageTemplate) => void;
  onToggleFavorite: (id: string) => void;
  onPreview: (template: MessageTemplate) => void;
}) => {
  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {getTypeIcon(template.type)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">{template.name}</h3>
                {template.is_favorite && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
              </div>
              <p className="text-sm text-muted-foreground">{template.description}</p>
            </div>
          </div>
          {getStatusBadge(template.status)}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Canal:</span>
            <div className="flex items-center space-x-1 ml-2">
              {getChannelIcon(template.channel)}
              <span className="font-medium capitalize">{template.channel}</span>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Categoria:</span>
            <span className="ml-2 font-medium capitalize">{template.category}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Uso:</span>
            <span className="ml-2 font-medium">{template.usage_count.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Taxa de Sucesso:</span>
            <span className={`ml-2 font-medium ${getSuccessRateColor(template.success_rate)}`}>
              {template.success_rate.toFixed(1)}%
            </span>
          </div>
        </div>

        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {template.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="text-xs text-muted-foreground mb-4">
          Criado por {template.created_by} • {new Date(template.created_at).toLocaleDateString()}
        </div>

        <Separator className="mb-4" />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => onPreview(template)}>
              <Eye className="h-4 w-4 mr-1" />
              Visualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(template)}>
              <Edit className="h-4 w-4 mr-1" />
              Editar
            </Button>
            <Button variant="outline" size="sm" onClick={() => onDuplicate(template)}>
              <Copy className="h-4 w-4 mr-1" />
              Duplicar
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onToggleFavorite(template.id)}
            >
              {template.is_favorite ? (
                <Star className="h-4 w-4 text-yellow-500 fill-current" />
              ) : (
                <StarOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(template.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const TemplatePreview = ({ template, onClose }: {
  template: MessageTemplate;
  onClose: () => void;
}) => {
  const [variables, setVariables] = useState<Record<string, string>>(
    template.variables.reduce((acc, variable) => {
      acc[variable.name] = variable.default_value || '';
      return acc;
    }, {} as Record<string, string>)
  );

  const renderContent = () => {
    let content = template.content;
    
    // Substituir variáveis
    template.variables.forEach(variable => {
      const value = variables[variable.name] || `{{${variable.name}}}`;
      content = content.replace(new RegExp(`{{${variable.name}}}`, 'g'), value);
    });
    
    return content;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            {getTypeIcon(template.type)}
            <span>{template.name}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Variáveis */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Variáveis</h3>
            {template.variables.length === 0 ? (
              <p className="text-muted-foreground">Este template não possui variáveis.</p>
            ) : (
              <div className="space-y-3">
                {template.variables.map((variable) => (
                  <div key={variable.name}>
                    <Label htmlFor={variable.name}>
                      {variable.name}
                      {variable.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      id={variable.name}
                      type={variable.type === 'number' ? 'number' : variable.type === 'date' ? 'date' : 'text'}
                      value={variables[variable.name] || ''}
                      onChange={(e) => setVariables(prev => ({ ...prev, [variable.name]: e.target.value }))}
                      placeholder={variable.description || `Digite ${variable.name}`}
                    />
                    {variable.description && (
                      <p className="text-xs text-muted-foreground mt-1">{variable.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Preview</h3>
            <div className="border rounded-lg p-4 bg-muted/50">
              {template.media && (
                <div className="mb-4">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                    {getTypeIcon(template.media.type)}
                    <span>Mídia: {template.media.type}</span>
                  </div>
                  {template.media.caption && (
                    <p className="text-sm italic">{template.media.caption}</p>
                  )}
                </div>
              )}
              
              <div className="whitespace-pre-wrap text-sm">
                {renderContent()}
              </div>
              
              {template.buttons && template.buttons.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Botões:</p>
                  {template.buttons.map((button, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      <Badge variant="outline">{button.type}</Badge>
                      <span>{button.text}</span>
                    </div>
                  ))}
                </div>
              )}
              
              {template.quick_replies && template.quick_replies.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Respostas Rápidas:</p>
                  <div className="flex flex-wrap gap-1">
                    {template.quick_replies.map((reply, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {reply}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button className="flex-1">
                <Send className="h-4 w-4 mr-2" />
                Enviar Teste
              </Button>
              <Button variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copiar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TemplateBuilder = ({ template, onSave, onCancel }: {
  template?: MessageTemplate;
  onSave: (template: Partial<MessageTemplate>) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [content, setContent] = useState(template?.content || '');
  const [category, setCategory] = useState(template?.category || '');
  const [type, setType] = useState<MessageTemplate['type']>(template?.type || 'text');
  const [channel, setChannel] = useState<MessageTemplate['channel']>(template?.channel || 'whatsapp');
  const [variables, setVariables] = useState<TemplateVariable[]>(template?.variables || []);
  const [buttons, setButtons] = useState<TemplateButton[]>(template?.buttons || []);
  const [quickReplies, setQuickReplies] = useState<string[]>(template?.quick_replies || []);
  const [tags, setTags] = useState<string[]>(template?.tags || []);
  const [folderId, setFolderId] = useState(template?.folder_id || '');
  const { toast } = useToast();

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Erro",
        description: "Nome do template é obrigatório",
        variant: "destructive"
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "Erro",
        description: "Conteúdo do template é obrigatório",
        variant: "destructive"
      });
      return;
    }

    onSave({
      name,
      description,
      content,
      category,
      type,
      channel,
      variables,
      buttons: buttons.length > 0 ? buttons : undefined,
      quick_replies: quickReplies.length > 0 ? quickReplies : undefined,
      tags,
      folder_id: folderId || undefined,
      status: 'active'
    });
  };

  const addVariable = () => {
    const newVariable: TemplateVariable = {
      name: '',
      type: 'text',
      required: false
    };
    setVariables([...variables, newVariable]);
  };

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, updates: Partial<TemplateVariable>) => {
    setVariables(variables.map((variable, i) => i === index ? { ...variable, ...updates } : variable));
  };

  const addButton = () => {
    const newButton: TemplateButton = {
      type: 'quick_reply',
      text: '',
      value: ''
    };
    setButtons([...buttons, newButton]);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, updates: Partial<TemplateButton>) => {
    setButtons(buttons.map((button, i) => i === index ? { ...button, ...updates } : button));
  };

  const addQuickReply = () => {
    setQuickReplies([...quickReplies, '']);
  };

  const removeQuickReply = (index: number) => {
    setQuickReplies(quickReplies.filter((_, i) => i !== index));
  };

  const updateQuickReply = (index: number, value: string) => {
    setQuickReplies(quickReplies.map((reply, i) => i === index ? value : reply));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Nome do Template *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Boas-vindas Padrão"
              />
            </div>
            
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {mockCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o propósito deste template..."
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(value: any) => setType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="interactive">Interativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(value: any) => setChannel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Pasta</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma pasta" />
                </SelectTrigger>
                <SelectContent>
                  {mockFolders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
            <Input
              id="tags"
              value={tags.join(', ')}
              onChange={(e) => setTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="Ex: boas-vindas, automático, padrão"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdo</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <Label htmlFor="content">Mensagem *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite o conteúdo da mensagem...\n\nUse {{variavel}} para inserir variáveis dinâmicas."
              rows={8}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use {{nome_da_variavel}} para inserir variáveis dinâmicas
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Hash className="h-5 w-5" />
              <span>Variáveis</span>
            </div>
            <Button variant="outline" size="sm" onClick={addVariable}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {variables.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhuma variável definida. As variáveis permitem personalizar a mensagem.
            </p>
          ) : (
            <div className="space-y-4">
              {variables.map((variable, index) => (
                <div key={index} className="flex items-center space-x-2 p-4 border rounded-lg">
                  <Input
                    placeholder="Nome da variável"
                    value={variable.name}
                    onChange={(e) => updateVariable(index, { name: e.target.value })}
                    className="flex-1"
                  />
                  
                  <Select 
                    value={variable.type} 
                    onValueChange={(value: any) => updateVariable(index, { type: value })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Input
                    placeholder="Valor padrão"
                    value={variable.default_value || ''}
                    onChange={(e) => updateVariable(index, { default_value: e.target.value })}
                    className="flex-1"
                  />
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={variable.required}
                      onCheckedChange={(checked) => updateVariable(index, { required: checked })}
                    />
                    <span className="text-sm">Obrigatório</span>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeVariable(index)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {channel === 'whatsapp' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Botões</span>
                </div>
                <Button variant="outline" size="sm" onClick={addButton}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {buttons.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhum botão definido. Os botões facilitam a interação do usuário.
                </p>
              ) : (
                <div className="space-y-4">
                  {buttons.map((button, index) => (
                    <div key={index} className="flex items-center space-x-2 p-4 border rounded-lg">
                      <Select 
                        value={button.type} 
                        onValueChange={(value: any) => updateButton(index, { type: value })}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="phone">Telefone</SelectItem>
                          <SelectItem value="quick_reply">Resposta Rápida</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Input
                        placeholder="Texto do botão"
                        value={button.text}
                        onChange={(e) => updateButton(index, { text: e.target.value })}
                        className="flex-1"
                      />
                      
                      <Input
                        placeholder={button.type === 'url' ? 'https://...' : button.type === 'phone' ? '+55...' : 'valor'}
                        value={button.value}
                        onChange={(e) => updateButton(index, { value: e.target.value })}
                        className="flex-1"
                      />
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeButton(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-5 w-5" />
                  <span>Respostas Rápidas</span>
                </div>
                <Button variant="outline" size="sm" onClick={addQuickReply}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quickReplies.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  Nenhuma resposta rápida definida. Facilite as respostas dos usuários.
                </p>
              ) : (
                <div className="space-y-2">
                  {quickReplies.map((reply, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        placeholder="Texto da resposta rápida"
                        value={reply}
                        onChange={(e) => updateQuickReply(index, e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeQuickReply(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex items-center justify-end space-x-4">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar Template
        </Button>
      </div>
    </div>
  );
};

const TemplatesList = () => {
  const [templates, setTemplates] = useState<MessageTemplate[]>(mockTemplates);
  const [filter, setFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const { toast } = useToast();

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filter === 'all' || template.status === filter;
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
    const matchesChannel = channelFilter === 'all' || template.channel === channelFilter || template.channel === 'all';
    return matchesSearch && matchesStatus && matchesCategory && matchesChannel;
  });

  const handleEdit = (template: MessageTemplate) => {
    toast({
      title: "Editar template",
      description: `Editando ${template.name}`
    });
  };

  const handleDelete = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast({
      title: "Template removido",
      description: "O template foi removido com sucesso"
    });
  };

  const handleDuplicate = (template: MessageTemplate) => {
    const newTemplate: MessageTemplate = {
      ...template,
      id: Date.now().toString(),
      name: `${template.name} (Cópia)`,
      usage_count: 0,
      success_rate: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setTemplates(prev => [newTemplate, ...prev]);
    toast({
      title: "Template duplicado",
      description: "Uma cópia do template foi criada"
    });
  };

  const handleToggleFavorite = (id: string) => {
    setTemplates(prev => prev.map(template => {
      if (template.id === id) {
        return { ...template, is_favorite: !template.is_favorite };
      }
      return template;
    }));
    
    const template = templates.find(t => t.id === id);
    const action = template?.is_favorite ? 'removido dos' : 'adicionado aos';
    
    toast({
      title: "Favoritos atualizados",
      description: `Template ${action} favoritos`
    });
  };

  const handlePreview = (template: MessageTemplate) => {
    setSelectedTemplate(template);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
              <SelectItem value="pending_approval">Aguardando Aprovação</SelectItem>
              <SelectItem value="rejected">Rejeitado</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {mockCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onToggleFavorite={handleToggleFavorite}
            onPreview={handlePreview}
          />
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template encontrado</h3>
            <p className="text-muted-foreground">
              {searchTerm ? 
                'Nenhum template corresponde aos filtros aplicados.' :
                'Você ainda não criou nenhum template.'
              }
            </p>
          </CardContent>
        </Card>
      )}
      
      {selectedTemplate && (
        <TemplatePreview 
          template={selectedTemplate} 
          onClose={() => setSelectedTemplate(null)} 
        />
      )}
    </div>
  );
};

const CategoriesOverview = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockCategories.map((category) => (
          <Card key={category.id} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className={`p-3 rounded-lg bg-${category.color}-100`}>
                  <div className={`h-6 w-6 text-${category.color}-600`}>
                    {category.icon === 'wave' && <span>👋</span>}
                    {category.icon === 'shopping-cart' && <ShoppingCart className="h-6 w-6" />}
                    {category.icon === 'megaphone' && <Megaphone className="h-6 w-6" />}
                    {category.icon === 'headphones' && <Headphones className="h-6 w-6" />}
                    {category.icon === 'credit-card' && <CreditCard className="h-6 w-6" />}
                    {category.icon === 'star' && <Star className="h-6 w-6" />}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">{category.description}</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{category.template_count}</span>
                <Badge variant="outline">
                  {category.template_count === 1 ? 'template' : 'templates'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockCategories.map((category) => {
              const percentage = (category.template_count / mockCategories.reduce((acc, cat) => acc + cat.template_count, 0)) * 100;
              return (
                <div key={category.id} className="flex items-center space-x-4">
                  <div className="w-24 text-sm font-medium">{category.name}</div>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div 
                      className={`bg-${category.color}-500 h-2 rounded-full`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-sm text-muted-foreground text-right">
                    {percentage.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const FoldersManagement = () => {
  const [folders, setFolders] = useState<TemplateFolder[]>(mockFolders);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('blue');
  const { toast } = useToast();

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Erro",
        description: "Nome da pasta é obrigatório",
        variant: "destructive"
      });
      return;
    }

    const newFolder: TemplateFolder = {
      id: Date.now().toString(),
      name: newFolderName,
      description: newFolderDescription,
      color: newFolderColor,
      template_count: 0
    };

    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setNewFolderDescription('');
    setNewFolderColor('blue');
    setIsCreating(false);
    
    toast({
      title: "Pasta criada",
      description: "Nova pasta foi criada com sucesso"
    });
  };

  const handleDeleteFolder = (id: string) => {
    setFolders(folders.filter(f => f.id !== id));
    toast({
      title: "Pasta removida",
      description: "A pasta foi removida com sucesso"
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Gerenciar Pastas</h3>
        <Button onClick={() => setIsCreating(true)}>
          <FolderPlus className="h-4 w-4 mr-2" />
          Nova Pasta
        </Button>
      </div>
      
      {isCreating && (
        <Card>
          <CardHeader>
            <CardTitle>Criar Nova Pasta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="folder-name">Nome da Pasta *</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex: Templates de Vendas"
              />
            </div>
            
            <div>
              <Label htmlFor="folder-description">Descrição</Label>
              <Textarea
                id="folder-description"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder="Descreva o propósito desta pasta..."
                rows={2}
              />
            </div>
            
            <div>
              <Label>Cor</Label>
              <Select value={newFolderColor} onValueChange={setNewFolderColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">Azul</SelectItem>
                  <SelectItem value="green">Verde</SelectItem>
                  <SelectItem value="purple">Roxo</SelectItem>
                  <SelectItem value="orange">Laranja</SelectItem>
                  <SelectItem value="red">Vermelho</SelectItem>
                  <SelectItem value="yellow">Amarelo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-4">
              <Button onClick={handleCreateFolder}>
                <Save className="h-4 w-4 mr-2" />
                Criar Pasta
              </Button>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {folders.map((folder) => (
          <Card key={folder.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className={`p-3 rounded-lg bg-${folder.color}-100`}>
                  <Folder className={`h-6 w-6 text-${folder.color}-600`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{folder.name}</h3>
                  {folder.description && (
                    <p className="text-sm text-muted-foreground">{folder.description}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl font-bold">{folder.template_count}</span>
                <Badge variant="outline">
                  {folder.template_count === 1 ? 'template' : 'templates'}
                </Badge>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Eye className="h-4 w-4 mr-1" />
                  Ver Templates
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const TemplateAnalytics = () => {
  const totalTemplates = mockTemplates.length;
  const activeTemplates = mockTemplates.filter(t => t.status === 'active').length;
  const totalUsage = mockTemplates.reduce((acc, t) => acc + t.usage_count, 0);
  const avgSuccessRate = mockTemplates.reduce((acc, t) => acc + t.success_rate, 0) / totalTemplates;
  
  const topTemplates = [...mockTemplates]
    .sort((a, b) => b.usage_count - a.usage_count)
    .slice(0, 5);
    
  const categoryStats = mockCategories.map(category => {
    const categoryTemplates = mockTemplates.filter(t => t.category === category.id);
    const usage = categoryTemplates.reduce((acc, t) => acc + t.usage_count, 0);
    const successRate = categoryTemplates.length > 0 
      ? categoryTemplates.reduce((acc, t) => acc + t.success_rate, 0) / categoryTemplates.length 
      : 0;
    
    return {
      ...category,
      usage,
      successRate
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <MessageSquare className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Templates</p>
                <p className="text-2xl font-bold">{totalTemplates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Templates Ativos</p>
                <p className="text-2xl font-bold">{activeTemplates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Usos</p>
                <p className="text-2xl font-bold">{totalUsage.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <BarChart3 className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Sucesso Média</p>
                <p className="text-2xl font-bold">{avgSuccessRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Templates Mais Utilizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topTemplates.map((template, index) => (
                <div key={template.id} className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">{template.usage_count.toLocaleString()} usos</p>
                  </div>
                  <Badge className={template.success_rate >= 95 ? 'bg-green-100 text-green-800' : 
                                  template.success_rate >= 80 ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-red-100 text-red-800'}>
                    {template.success_rate.toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Performance por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryStats.map((category) => (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{category.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">
                        {category.usage.toLocaleString()} usos
                      </span>
                      <Badge className={category.successRate >= 95 ? 'bg-green-100 text-green-800' : 
                                       category.successRate >= 80 ? 'bg-yellow-100 text-yellow-800' : 
                                       'bg-red-100 text-red-800'}>
                        {category.successRate.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`bg-${category.color}-500 h-2 rounded-full`}
                      style={{ width: `${(category.usage / totalUsage) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default function MessageTemplates() {
  const [activeTab, setActiveTab] = useState('templates');
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const { toast } = useToast();

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setIsBuilding(true);
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setIsBuilding(true);
  };

  const handleSaveTemplate = (templateData: Partial<MessageTemplate>) => {
    if (editingTemplate) {
      toast({
        title: "Template atualizado",
        description: "O template foi atualizado com sucesso"
      });
    } else {
      toast({
        title: "Template criado",
        description: "Novo template foi criado com sucesso"
      });
    }
    setIsBuilding(false);
    setEditingTemplate(null);
  };

  const handleCancelBuilder = () => {
    setIsBuilding(false);
    setEditingTemplate(null);
  };

  const handleImportTemplates = () => {
    toast({
      title: "Importar templates",
      description: "Funcionalidade de importação será implementada"
    });
  };

  const handleExportTemplates = () => {
    toast({
      title: "Exportar templates",
      description: "Templates exportados com sucesso"
    });
  };

  if (isBuilding) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {editingTemplate ? 'Editar Template' : 'Criar Novo Template'}
            </h1>
            <p className="text-muted-foreground">
              {editingTemplate ? 'Modifique as informações do template' : 'Configure seu novo template de mensagem'}
            </p>
          </div>
        </div>
        
        <TemplateBuilder
          template={editingTemplate || undefined}
          onSave={handleSaveTemplate}
          onCancel={handleCancelBuilder}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Templates de Mensagens</h1>
          <p className="text-muted-foreground">
            Gerencie e organize seus templates de mensagens para diferentes canais
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={handleImportTemplates}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button variant="outline" onClick={handleExportTemplates}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={handleCreateTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="templates" className="flex items-center space-x-2">
            <MessageSquare className="h-4 w-4" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center space-x-2">
            <Tag className="h-4 w-4" />
            <span>Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="folders" className="flex items-center space-x-2">
            <Folder className="h-4 w-4" />
            <span>Pastas</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Análises</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <TemplatesList />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesOverview />
        </TabsContent>

        <TabsContent value="folders">
          <FoldersManagement />
        </TabsContent>

        <TabsContent value="analytics">
          <TemplateAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}