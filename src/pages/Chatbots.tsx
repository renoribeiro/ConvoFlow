import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Plus, Activity, Settings, BarChart3, Play, Pause, Edit, Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { ChatbotSchema, ChatbotCreateSchema, ChatbotUpdateSchema } from '@/lib/validations/chatbot';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { useEnhancedSupabaseMutation } from '@/hooks/enhanced/useEnhancedSupabaseMutation';

interface Chatbot {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_phrases: string[] | null;
  response_type: string | null;
  response_message: string;
  media_url?: string | null;
  priority: number | null;
  is_active: boolean | null;
  whatsapp_instance_id?: string | null;
  created_at: string;
  updated_at: string;
  variables?: any;
  conditions?: any;
  whatsapp_instance?: {
    name: string;
    status: string;
  };
}

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_key: string;
  status: string;
}

const Chatbots = () => {
  const { toast } = useToast();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [whatsappInstances, setWhatsappInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChatbot, setEditingChatbot] = useState<Chatbot | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'keyword' as 'keyword' | 'all',
    trigger_phrases: [] as string[],
    response_type: 'text' as 'text' | 'image' | 'document',
    response_message: '',
    media_url: '',
    priority: 0,
    is_active: true,
    whatsapp_instance_id: ''
  });
  const [triggerInput, setTriggerInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    chatbot: Chatbot | null;
  }>({ isOpen: false, chatbot: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // Função para obter schema de validação baseado na operação
  const getValidationSchema = () => {
    return editingChatbot ? ChatbotUpdateSchema : ChatbotCreateSchema;
  };

  // Função para validar campo individual
  const validateField = async (field: string, value: any) => {
    try {
      setIsValidating(true);
      const schema = getValidationSchema();
      const fieldSchema = schema.shape[field as keyof typeof schema.shape];

      if (fieldSchema) {
        await fieldSchema.parseAsync(value);
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors[0]?.message || 'Erro de validação';
        setValidationErrors(prev => ({ ...prev, [field]: errorMessage }));

        logger.warn('Erro de validação de campo', {
          category: 'validation',
          field,
          error: errorMessage,
          value: typeof value === 'string' ? value.substring(0, 100) : value
        });
      }
    } finally {
      setIsValidating(false);
    }
  };

  // Função para validar formulário completo
  const validateForm = async (data: any) => {
    try {
      setIsValidating(true);
      const schema = getValidationSchema();
      await schema.parseAsync(data);
      setValidationErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const field = err.path.join('.');
          errors[field] = err.message;
        });
        setValidationErrors(errors);

        logger.error('Erro de validação do formulário de chatbot', {
          category: 'validation',
          errors: error.errors,
          formData: {
            name: data.name,
            trigger_type: data.trigger_type,
            hasResponse: !!data.response_message
          }
        });

        toast.error('Por favor, corrija os erros no formulário');
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };



  useEffect(() => {
    loadData();
  }, []);





  const loadData = async () => {
    try {
      const [chatbotsResponse, instancesResponse] = await Promise.all([
        supabase.from('chatbots').select('*').order('created_at', { ascending: false }),
        supabase.from('whatsapp_instances').select('id, name, instance_key, status').eq('is_active', true)
      ]);

      if (chatbotsResponse.error) throw chatbotsResponse.error;
      if (instancesResponse.error) throw instancesResponse.error;

      setChatbots((chatbotsResponse.data || []) as Chatbot[]);
      setWhatsappInstances(instancesResponse.data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      trigger_type: 'keyword',
      trigger_phrases: [],
      response_type: 'text',
      response_message: '',
      media_url: '',
      priority: 0,
      is_active: true,
      whatsapp_instance_id: ''
    });
    setTriggerInput('');
    setValidationErrors({});
    setEditingChatbot(null);
  };

  const handleAddTrigger = () => {
    if (triggerInput.trim() && !formData.trigger_phrases.includes(triggerInput.trim())) {
      setFormData(prev => ({
        ...prev,
        trigger_phrases: [...prev.trigger_phrases, triggerInput.trim()]
      }));
      setTriggerInput('');
    }
  };

  const handleRemoveTrigger = (trigger: string) => {
    setFormData(prev => ({
      ...prev,
      trigger_phrases: prev.trigger_phrases.filter(t => t !== trigger)
    }));
  };

  const handleSubmit = async () => {
    try {
      // Get current user's tenant_id (this would come from auth context in real app)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.tenant_id) throw new Error('Tenant não encontrado');

      const chatbotData = {
        ...formData,
        tenant_id: profile.tenant_id,
        whatsapp_instance_id: formData.whatsapp_instance_id || null
      };

      // Validar dados antes de enviar
      const isValid = await validateForm(chatbotData);
      if (!isValid) {
        return;
      }

      let response;
      if (editingChatbot) {
        response = await supabase
          .from('chatbots')
          .update(chatbotData)
          .eq('id', editingChatbot.id)
          .select()
          .single();
      } else {
        response = await supabase
          .from('chatbots')
          .insert(chatbotData)
          .select()
          .single();
      }

      if (response.error) throw response.error;

      logger.info('Chatbot salvo com sucesso', {
        category: 'chatbot',
        operation: editingChatbot ? 'update' : 'create',
        chatbotId: response.data.id,
        chatbotName: response.data.name
      });

      toast({
        title: editingChatbot ? "Chatbot atualizado" : "Chatbot criado",
        description: `${formData.name} foi ${editingChatbot ? 'atualizado' : 'criado'} com sucesso`,
      });

      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error: any) {
      logger.error('Erro ao salvar chatbot', {
        category: 'chatbot',
        operation: editingChatbot ? 'update' : 'create',
        error: error.message
      });

      toast({
        title: "Erro ao salvar chatbot",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (chatbot: Chatbot) => {
    try {
      console.log('🔧 handleEdit chamado:', { chatbot, showCreateModal });
      setEditingChatbot(chatbot);

      const editFormData = {
        name: chatbot.name || '',
        description: chatbot.description || '',
        trigger_type: chatbot.trigger_type || 'keyword',
        trigger_phrases: chatbot.trigger_phrases || [],
        response_type: chatbot.response_type || 'text',
        response_message: chatbot.response_message || '',
        media_url: chatbot.media_url || '',
        priority: chatbot.priority || 0,
        is_active: chatbot.is_active ?? true,
        whatsapp_instance_id: chatbot.whatsapp_instance_id || ''
      };

      setFormData(editFormData);
      setShowCreateModal(true);
      console.log('🔧 Modal de edição aberto:', { editFormData, showCreateModal: true });

      logger.info('Abrindo modal de edição de chatbot', {
        category: 'chatbot_management',
        action: 'edit_chatbot',
        chatbotId: chatbot.id,
        chatbotName: chatbot.name
      });
    } catch (error: any) {
      logger.error('Erro ao abrir modal de edição', {
        category: 'chatbot_management',
        action: 'edit_chatbot',
        chatbotId: chatbot.id,
        error: error.message
      });

      toast({
        title: "Erro ao editar chatbot",
        description: "Não foi possível abrir o formulário de edição",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (chatbot: Chatbot) => {
    try {
      const { error } = await supabase
        .from('chatbots')
        .update({ is_active: !chatbot.is_active })
        .eq('id', chatbot.id);

      if (error) throw error;

      toast({
        title: chatbot.is_active ? "Chatbot desativado" : "Chatbot ativado",
        description: `${chatbot.name} foi ${chatbot.is_active ? 'desativado' : 'ativado'}`,
      });

      loadData();
    } catch (error: any) {
      toast({
        title: "Erro ao alterar status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (chatbot: Chatbot) => {
    setDeleteConfirmation({
      isOpen: true,
      chatbot
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.chatbot) return;

    try {
      setIsDeleting(true);

      logger.info('Iniciando exclusão de chatbot', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbot.id,
        chatbotName: deleteConfirmation.chatbot.name
      });

      const { error } = await supabase
        .from('chatbots')
        .delete()
        .eq('id', deleteConfirmation.chatbot.id);

      if (error) throw error;

      logger.info('Chatbot excluído com sucesso', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbot.id,
        chatbotName: deleteConfirmation.chatbot.name,
        status: 'success'
      });

      toast({
        title: "Chatbot excluído",
        description: `${deleteConfirmation.chatbot.name} foi excluído com sucesso`,
      });

      setDeleteConfirmation({ isOpen: false, chatbot: null });
      loadData();
    } catch (error: any) {
      logger.error('Erro ao excluir chatbot', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbot?.id,
        chatbotName: deleteConfirmation.chatbot?.name,
        error: error.message
      });

      toast({
        title: "Erro ao excluir chatbot",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, chatbot: null });
  };

  const stats = {
    total: chatbots.length,
    active: chatbots.filter(c => c.is_active).length,
    inactive: chatbots.filter(c => !c.is_active).length,
    keywordTriggers: chatbots.filter(c => c.trigger_type === 'keyword').length
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }



  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Chatbots"
        description="Configure chatbots automáticos para responder mensagens do WhatsApp"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Chatbots" }
        ]}
        actions={
          <Button onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Chatbot
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Chatbots</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ativos</CardTitle>
            <Activity className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inativos</CardTitle>
            <Pause className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.inactive}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Por Palavras-chave</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.keywordTriggers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Chatbots List */}
      <div className="grid gap-4">
        {chatbots.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum chatbot configurado</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie seu primeiro chatbot para começar a responder automaticamente às mensagens do WhatsApp
              </p>
              <Button onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Chatbot
              </Button>
            </CardContent>
          </Card>
        ) : (
          chatbots.map((chatbot) => (
            <Card key={chatbot.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{chatbot.name}</CardTitle>
                      <Badge variant={chatbot.is_active ? "default" : "secondary"}>
                        {chatbot.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      <Badge variant="outline">
                        {chatbot.trigger_type === 'keyword' ? 'Palavras-chave' : 'Todas as mensagens'}
                      </Badge>
                      {chatbot.priority > 0 && (
                        <Badge variant="outline">Prioridade {chatbot.priority}</Badge>
                      )}
                    </div>
                    {chatbot.description && (
                      <CardDescription>{chatbot.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleToggleActive(chatbot)}
                    >
                      {chatbot.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(chatbot)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteClick(chatbot)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {chatbot.trigger_type === 'keyword' && chatbot.trigger_phrases.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Palavras-chave gatilho:</h4>
                    <div className="flex flex-wrap gap-2">
                      {chatbot.trigger_phrases.map((phrase, index) => (
                        <Badge key={index} variant="secondary">
                          {phrase}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-2">Resposta ({chatbot.response_type}):</h4>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    {chatbot.response_message}
                  </p>
                </div>

                {chatbot.media_url && (
                  <div>
                    <h4 className="font-medium mb-2">URL da mídia:</h4>
                    <p className="text-sm text-muted-foreground break-all">{chatbot.media_url}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Confirmation Dialog for Delete */}
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        title="Excluir Chatbot"
        description={`Tem certeza que deseja excluir o chatbot "${deleteConfirmation.chatbot?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={isDeleting}
      />

      {/* Modal de Criação/Edição de Chatbot */}
      <Dialog
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingChatbot ? 'Editar Chatbot' : 'Criar Novo Chatbot'}
            </DialogTitle>
            <DialogDescription>
              Configure um chatbot para responder automaticamente às mensagens do WhatsApp
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData(prev => ({ ...prev, name: value }));
                    if (value) validateField('name', value);
                  }}
                  onBlur={() => {
                    if (formData.name) validateField('name', formData.name);
                  }}
                  placeholder="Nome do chatbot"
                  className={validationErrors.name ? 'border-red-500' : ''}
                />
                {validationErrors.name && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridade</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição do chatbot"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="trigger_type">Tipo de Gatilho</Label>
                <Select
                  value={formData.trigger_type}
                  onValueChange={(value: 'keyword' | 'all') =>
                    setFormData(prev => ({ ...prev, trigger_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Palavras-chave</SelectItem>
                    <SelectItem value="all">Todas as mensagens</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp_instance">Instância WhatsApp</Label>
                <Select
                  value={whatsappInstances.some(i => i.id === formData.whatsapp_instance_id) ? formData.whatsapp_instance_id : ''}
                  onValueChange={(value) =>
                    setFormData(prev => ({ ...prev, whatsapp_instance_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as instâncias" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappInstances.map(instance => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.name} ({instance.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.trigger_type === 'keyword' && (
              <div className="space-y-2">
                <Label>Palavras-chave Gatilho *</Label>
                <div className="flex gap-2">
                  <Input
                    value={triggerInput}
                    onChange={(e) => setTriggerInput(e.target.value)}
                    placeholder="Digite uma palavra-chave"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTrigger()}
                  />
                  <Button type="button" onClick={handleAddTrigger}>
                    Adicionar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.trigger_phrases.map((trigger, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => handleRemoveTrigger(trigger)}
                    >
                      {trigger} ×
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="response_type">Tipo de Resposta</Label>
              <Select
                value={formData.response_type}
                onValueChange={(value: 'text' | 'image' | 'document') =>
                  setFormData(prev => ({ ...prev, response_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="document">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="response_message">Mensagem de Resposta *</Label>
              <Textarea
                id="response_message"
                value={formData.response_message}
                onChange={(e) => setFormData(prev => ({ ...prev, response_message: e.target.value }))}
                placeholder="Olá {name}! Como posso ajudar você hoje?"
                rows={4}
              />
              <div className="text-sm text-muted-foreground">
                Variáveis disponíveis: {'{name}'}, {'{phone}'}, {'{first_name}'}, {'{incoming_message}'}, {'{time}'}, {'{date}'}, {'{datetime}'}
              </div>
            </div>

            {formData.response_type !== 'text' && (
              <div className="space-y-2">
                <Label htmlFor="media_url">URL da Mídia</Label>
                <Input
                  id="media_url"
                  value={formData.media_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, media_url: e.target.value }))}
                  placeholder="https://exemplo.com/imagem.jpg"
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, is_active: checked }))
                }
              />
              <Label htmlFor="is_active">Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingChatbot ? 'Atualizar' : 'Criar'} Chatbot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chatbots;