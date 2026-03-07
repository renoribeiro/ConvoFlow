import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  CalendarIcon, 
  Clock, 
  Users, 
  MessageSquare, 
  Send, 
  Info,
  X,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface FunnelStage {
  id: string;
  name: string;
  color: string;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  status: string;
}

interface CampaignWizardProps {
  onClose: () => void;
  onCampaignCreated: () => void;
}

export const CampaignWizard = ({ onClose, onCampaignCreated }: CampaignWizardProps) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const { toast } = useToast();

  // Form data
  const [campaignData, setCampaignData] = useState({
    name: '',
    description: '',
    message_template: '',
    whatsapp_instance_id: '',
    target_tags: [] as string[],
    target_stages: [] as string[],
    scheduled_at: null as Date | null,
    delay_between_messages: 30,
    media_url: '',
    enable_message_randomization: false,
    min_delay_seconds: 0,
    max_delay_seconds: 15,
    message_templates: [] as string[]
  });

  const [previewData, setPreviewData] = useState({
    estimatedContacts: 0,
    estimatedDuration: '0 min',
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (step === 3) {
      updatePreview();
    }
  }, [campaignData.target_tags, campaignData.target_stages, campaignData.delay_between_messages]);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      // Load tags
      const { data: tagsData } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('tenant_id', profile.tenant_id);

      if (tagsData) setTags(tagsData);

      // Load stages
      const { data: stagesData } = await supabase
        .from('funnel_stages')
        .select('id, name, color')
        .eq('tenant_id', profile.tenant_id)
        .order('order');

      if (stagesData) setStages(stagesData);

      // Load WhatsApp instances
      const { data: instancesData } = await supabase
        .from('whatsapp_instances')
        .select('id, name, status')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true);

      if (instancesData) setInstances(instancesData);

    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const updatePreview = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      // Count contacts that match criteria
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact' })
        .eq('tenant_id', profile.tenant_id)
        .eq('is_blocked', false)
        .eq('opt_out_mass_message', false);

      // Apply tag filters
      if (campaignData.target_tags.length > 0) {
        const { data: contactIdsWithTags } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', campaignData.target_tags);
          
        if (contactIdsWithTags) {
          const contactIds = contactIdsWithTags.map(ct => ct.contact_id);
          query = query.in('id', contactIds);
        }
      }

      // Apply stage filters  
      if (campaignData.target_stages.length > 0) {
        query = query.in('current_stage_id', campaignData.target_stages);
      }

      const { count } = await query;
      
      const estimatedContacts = count || 0;
      const estimatedDurationMinutes = Math.ceil((estimatedContacts * campaignData.delay_between_messages) / 60);
      
      setPreviewData({
        estimatedContacts,
        estimatedDuration: estimatedDurationMinutes > 60 
          ? `${Math.floor(estimatedDurationMinutes / 60)}h ${estimatedDurationMinutes % 60}min`
          : `${estimatedDurationMinutes} min`,
      });

    } catch (error) {
      console.error('Error updating preview:', error);
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleTagToggle = (tagId: string) => {
    setCampaignData(prev => ({
      ...prev,
      target_tags: prev.target_tags.includes(tagId)
        ? prev.target_tags.filter(id => id !== tagId)
        : [...prev.target_tags, tagId]
    }));
  };

  const handleStageToggle = (stageId: string) => {
    setCampaignData(prev => ({
      ...prev,
      target_stages: prev.target_stages.includes(stageId)
        ? prev.target_stages.filter(id => id !== stageId)
        : [...prev.target_stages, stageId]
    }));
  };

  const handleScheduleCampaign = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      // Create campaign
      const { data: campaign, error } = await supabase
        .from('mass_message_campaigns')
        .insert({
          tenant_id: user.user_metadata.tenant_id,
          name: campaignData.name,
          description: campaignData.description,
          message_template: campaignData.message_template,
          whatsapp_instance_id: campaignData.whatsapp_instance_id,
          target_tags: campaignData.target_tags,
          target_stages: campaignData.target_stages,
          scheduled_at: campaignData.scheduled_at?.toISOString(),
          delay_between_messages: campaignData.delay_between_messages,
          media_url: campaignData.media_url || null,
          enable_message_randomization: campaignData.enable_message_randomization,
          min_delay_seconds: campaignData.min_delay_seconds,
          max_delay_seconds: campaignData.max_delay_seconds,
          message_templates: campaignData.message_templates.filter(t => t.trim() !== '')
        })
        .select()
        .single();

      if (error) throw error;

      // Schedule campaign messages
      const { data: scheduledCount, error: scheduleError } = await supabase
        .rpc('schedule_campaign_messages', {
          p_campaign_id: campaign.id
        });

      if (scheduleError) throw scheduleError;

      toast({
        title: "Campanha Criada",
        description: `Campanha agendada com sucesso! ${scheduledCount} mensagens foram programadas.`,
      });

      onCampaignCreated();
      onClose();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar campanha",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return campaignData.name.trim() && campaignData.message_template.trim();
      case 2:
        return campaignData.whatsapp_instance_id;
      case 3:
        return true; // Optional targeting
      case 4:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Campanha *</Label>
              <Input
                id="name"
                placeholder="Ex: Promoção Black Friday 2024"
                value={campaignData.name}
                onChange={(e) => setCampaignData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                placeholder="Descrição opcional da campanha"
                value={campaignData.description}
                onChange={(e) => setCampaignData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Mensagem *</Label>
              <Textarea
                id="message"
                placeholder="Olá {{nome}}! 🎉 Temos uma promoção especial para você..."
                rows={6}
                value={campaignData.message_template}
                onChange={(e) => setCampaignData(prev => ({ ...prev, message_template: e.target.value }))}
              />
              <div className="text-xs text-muted-foreground">
                Use <code>{'{{nome}}'}</code> e <code>{'{{telefone}}'}</code> para personalizar.
                Use <code>{'{'}</code>opção1|opção2<code>{'}'}</code> para variações (spintax).
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="media">URL da Mídia (opcional)</Label>
              <Input
                id="media"
                placeholder="https://exemplo.com/imagem.jpg"
                value={campaignData.media_url}
                onChange={(e) => setCampaignData(prev => ({ ...prev, media_url: e.target.value }))}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Instância do WhatsApp *</Label>
              <Select
                value={campaignData.whatsapp_instance_id}
                onValueChange={(value) => setCampaignData(prev => ({ ...prev, whatsapp_instance_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex items-center gap-2">
                        {instance.name}
                        <Badge variant={instance.status === 'open' ? 'default' : 'secondary'}>
                          {instance.status}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instances.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma instância do WhatsApp encontrada. Configure uma instância primeiro.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="delay">Delay entre Mensagens (segundos)</Label>
              <Input
                id="delay"
                type="number"
                min="10"
                max="300"
                value={campaignData.delay_between_messages}
                onChange={(e) => setCampaignData(prev => ({ 
                  ...prev, 
                  delay_between_messages: parseInt(e.target.value) || 30 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Recomendado: 30-60 segundos para evitar bloqueios
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="randomization"
                  checked={campaignData.enable_message_randomization}
                  onChange={(e) => setCampaignData(prev => ({
                    ...prev,
                    enable_message_randomization: e.target.checked
                  }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="randomization" className="text-sm font-medium">
                  Ativar randomização para evitar bloqueios
                </Label>
              </div>
              
              {campaignData.enable_message_randomization && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="min-delay">Delay mínimo (segundos)</Label>
                      <Input
                        id="min-delay"
                        type="number"
                        min="0"
                        max="15"
                        value={campaignData.min_delay_seconds}
                        onChange={(e) => setCampaignData(prev => ({
                          ...prev,
                          min_delay_seconds: parseInt(e.target.value) || 0
                        }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-delay">Delay máximo (segundos)</Label>
                      <Input
                        id="max-delay"
                        type="number"
                        min="0"
                        max="15"
                        value={campaignData.max_delay_seconds}
                        onChange={(e) => setCampaignData(prev => ({
                          ...prev,
                          max_delay_seconds: parseInt(e.target.value) || 15
                        }))}
                        placeholder="15"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Delay randômico de {campaignData.min_delay_seconds}-{campaignData.max_delay_seconds} segundos será aplicado antes de cada envio
                  </p>
                  
                  <div className="space-y-2">
                    <Label>Mensagens alternativas (opcional)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Adicione diferentes versões da mensagem para alternar aleatoriamente
                    </p>
                    {campaignData.message_templates.map((template, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={template}
                          onChange={(e) => {
                            const newTemplates = [...campaignData.message_templates];
                            newTemplates[index] = e.target.value;
                            setCampaignData(prev => ({
                              ...prev,
                              message_templates: newTemplates
                            }));
                          }}
                          placeholder={`Mensagem alternativa ${index + 1}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newTemplates = campaignData.message_templates.filter((_, i) => i !== index);
                            setCampaignData(prev => ({
                              ...prev,
                              message_templates: newTemplates
                            }));
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCampaignData(prev => ({
                          ...prev,
                          message_templates: [...prev.message_templates, '']
                        }));
                      }}
                      className="w-full"
                    >
                      + Adicionar mensagem alternativa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Defina o público-alvo. Se nenhum filtro for selecionado, a campanha será enviada para todos os contatos ativos.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Tags</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione as tags dos contatos que devem receber a campanha
                </p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={campaignData.target_tags.includes(tag.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleTagToggle(tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                  {tags.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma tag encontrada</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-base font-medium">Estágios do Funil</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione os estágios do funil que devem receber a campanha
                </p>
                <div className="flex flex-wrap gap-2">
                  {stages.map((stage) => (
                    <Badge
                      key={stage.id}
                      variant={campaignData.target_stages.includes(stage.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleStageToggle(stage.id)}
                    >
                      {stage.name}
                    </Badge>
                  ))}
                  {stages.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum estágio encontrado</p>
                  )}
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Prévia da Campanha
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Contatos Estimados</p>
                    <p className="text-2xl font-bold">{previewData.estimatedContacts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duração Estimada</p>
                    <p className="text-2xl font-bold">{previewData.estimatedDuration}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agendamento</Label>
              <div className="flex gap-2">
                <Button
                  variant={campaignData.scheduled_at ? 'outline' : 'default'}
                  onClick={() => setCampaignData(prev => ({ ...prev, scheduled_at: null }))}
                >
                  Enviar Agora
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant={campaignData.scheduled_at ? 'default' : 'outline'}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      Agendar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={campaignData.scheduled_at || undefined}
                      onSelect={(date) => setCampaignData(prev => ({ 
                        ...prev, 
                        scheduled_at: date || null 
                      }))}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {campaignData.scheduled_at && (
                <p className="text-sm text-muted-foreground">
                  Agendado para: {format(campaignData.scheduled_at, 'dd/MM/yyyy')}
                </p>
              )}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Resumo da Campanha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div><strong>Nome:</strong> {campaignData.name}</div>
                <div><strong>Mensagem:</strong> {campaignData.message_template.substring(0, 100)}...</div>
                <div><strong>Público:</strong> {previewData.estimatedContacts} contatos</div>
                <div><strong>Duração:</strong> {previewData.estimatedDuration}</div>
                <div><strong>Agendamento:</strong> {campaignData.scheduled_at ? format(campaignData.scheduled_at, 'dd/MM/yyyy') : 'Envio imediato'}</div>
                {campaignData.enable_message_randomization && (
                  <>
                    <div><strong>Randomização:</strong> Ativada</div>
                    <div><strong>Delay randômico:</strong> {campaignData.min_delay_seconds}-{campaignData.max_delay_seconds} segundos</div>
                    {campaignData.message_templates.length > 0 && (
                      <div><strong>Mensagens alternativas:</strong> {campaignData.message_templates.filter(t => t.trim() !== '').length} variações</div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Nova Campanha de Mensagens
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Progress bar */}
        <div className="flex items-center gap-2 mt-4">
          {[1, 2, 3, 4].map((stepNumber) => (
            <div
              key={stepNumber}
              className={`h-2 flex-1 rounded ${
                stepNumber <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-sm text-muted-foreground mt-1">
          <span>Conteúdo</span>
          <span>Configuração</span>
          <span>Público</span>
          <span>Agendamento</span>
        </div>
      </CardHeader>

      <CardContent>
        {renderStep()}

        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={step === 1}
          >
            Anterior
          </Button>

          <div className="flex gap-2">
            {step === 4 ? (
              <Button
                onClick={handleScheduleCampaign}
                disabled={loading || !canProceed()}
              >
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Criar Campanha
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Próximo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};