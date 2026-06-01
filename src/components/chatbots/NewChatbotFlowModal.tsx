import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { X, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useCreateChatbot } from '@/hooks/useChatbotFlow';
import { ChatbotFlowCreateSchema } from '@/lib/validations/chatbot-flow';
import type { ChatbotTriggerType, ChatbotTriggerValue } from '@/types/chatbot-flow.types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const TRIGGER_LABELS: Record<ChatbotTriggerType, string> = {
  keyword: 'Palavra-chave',
  first_contact: 'Primeiro contato',
  out_of_hours: 'Fora do horário',
  no_agent_reply: 'Sem resposta do atendente',
  funnel_stage: 'Etapa do funil',
};

const ALL_TRIGGER_TYPES: ChatbotTriggerType[] = [
  'keyword',
  'first_contact',
  'out_of_hours',
  'no_agent_reply',
  'funnel_stage',
];

interface TriggerConfig {
  enabled: boolean;
  keywords: string[];
  keywordInput: string;
  minutes: number;
  stage_id: string;
}

type TriggerConfigs = Record<ChatbotTriggerType, TriggerConfig>;

const defaultTriggerConfig = (): TriggerConfig => ({
  enabled: false,
  keywords: [],
  keywordInput: '',
  minutes: 5,
  stage_id: '',
});

const NewChatbotFlowModal: React.FC<Props> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const createChatbot = useCreateChatbot();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instanceId, setInstanceId] = useState<string>('all');
  const [priority, setPriority] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [triggerConfigs, setTriggerConfigs] = useState<TriggerConfigs>(() =>
    Object.fromEntries(ALL_TRIGGER_TYPES.map((t) => [t, defaultTriggerConfig()])) as TriggerConfigs
  );

  const { data: instances = [] } = useSupabaseQuery({
    table: 'whatsapp_instances',
    queryKey: ['whatsapp_instances', 'active'],
    select: 'id, name, status',
    filter: [{ column: 'is_active', operator: 'eq', value: true }],
  });

  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel_stages', 'list'],
    select: 'id, name',
    order: { column: 'order', ascending: true },
  });

  const setTrigger = (type: ChatbotTriggerType, patch: Partial<TriggerConfig>) => {
    setTriggerConfigs((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  };

  const addKeyword = (type: ChatbotTriggerType) => {
    const kw = triggerConfigs[type].keywordInput.trim();
    if (kw && !triggerConfigs[type].keywords.includes(kw)) {
      setTrigger(type, {
        keywords: [...triggerConfigs[type].keywords, kw],
        keywordInput: '',
      });
    }
  };

  const removeKeyword = (type: ChatbotTriggerType, kw: string) => {
    setTrigger(type, { keywords: triggerConfigs[type].keywords.filter((k) => k !== kw) });
  };

  const buildTriggers = (): Array<{
    trigger_type: ChatbotTriggerType;
    trigger_value: ChatbotTriggerValue;
    is_active: boolean;
  }> => {
    const out: ReturnType<typeof buildTriggers> = [];
    for (const type of ALL_TRIGGER_TYPES) {
      const cfg = triggerConfigs[type];
      if (!cfg.enabled) continue;
      let trigger_value: ChatbotTriggerValue;
      switch (type) {
        case 'keyword':
          trigger_value = { keywords: cfg.keywords };
          break;
        case 'first_contact':
          trigger_value = {};
          break;
        case 'out_of_hours':
          trigger_value = {};
          break;
        case 'no_agent_reply':
          trigger_value = { minutes: cfg.minutes };
          break;
        case 'funnel_stage':
          trigger_value = { stage_id: cfg.stage_id };
          break;
        default:
          trigger_value = {};
      }
      out.push({ trigger_type: type, trigger_value, is_active: true });
    }
    return out;
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    const result = ChatbotFlowCreateSchema.safeParse({
      name,
      description: description || undefined,
      whatsapp_instance_id: instanceId === 'all' ? null : instanceId,
      priority,
      triggers: buildTriggers(),
    });

    if (!result.success) {
      result.error.errors.forEach((e) => {
        const key = e.path.join('.');
        newErrors[key] = e.message;
      });
    }

    // Extra per-trigger validation
    for (const type of ALL_TRIGGER_TYPES) {
      const cfg = triggerConfigs[type];
      if (!cfg.enabled) continue;
      if (type === 'keyword' && cfg.keywords.length === 0) {
        newErrors['trigger_keyword'] = 'Adicione pelo menos uma palavra-chave';
      }
      if (type === 'funnel_stage' && !cfg.stage_id) {
        newErrors['trigger_funnel_stage'] = 'Selecione uma etapa do funil';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const chatbot = await createChatbot.mutateAsync({
        name,
        description: description || null,
        whatsapp_instance_id: instanceId === 'all' ? null : instanceId,
        priority,
        triggers: buildTriggers(),
      });

      toast.success('Chatbot criado com sucesso');
      handleClose();
      navigate(`/dashboard/chatbots/${chatbot.id}/builder`);
    } catch (err: any) {
      toast.error('Erro ao criar chatbot', { description: err?.message });
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setInstanceId('all');
    setPriority(0);
    setErrors({});
    setTriggerConfigs(
      Object.fromEntries(ALL_TRIGGER_TYPES.map((t) => [t, defaultTriggerConfig()])) as TriggerConfigs
    );
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Chatbot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label htmlFor="cf-name">Nome *</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do chatbot"
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label htmlFor="cf-desc">Descrição</Label>
            <Textarea
              id="cf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>

          {/* Instância */}
          <div className="space-y-1">
            <Label>Instância WhatsApp</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as instâncias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as instâncias</SelectItem>
                {(instances as any[]).map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prioridade */}
          <div className="space-y-1">
            <Label htmlFor="cf-priority">Prioridade</Label>
            <Input
              id="cf-priority"
              type="number"
              min={0}
              max={100}
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            />
          </div>

          {/* Gatilhos */}
          <div className="space-y-2">
            <Label>Gatilhos *</Label>
            {errors.triggers && <p className="text-xs text-destructive">{errors.triggers}</p>}
            <div className="space-y-3 rounded-md border p-3">
              {ALL_TRIGGER_TYPES.map((type) => {
                const cfg = triggerConfigs[type];
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`trig-${type}`}
                        checked={cfg.enabled}
                        onCheckedChange={(v) => setTrigger(type, { enabled: !!v })}
                      />
                      <Label htmlFor={`trig-${type}`} className="cursor-pointer font-normal">
                        {TRIGGER_LABELS[type]}
                      </Label>
                    </div>

                    {cfg.enabled && type === 'keyword' && (
                      <div className="ml-6 space-y-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Digite uma palavra-chave"
                            value={cfg.keywordInput}
                            onChange={(e) => setTrigger(type, { keywordInput: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword(type))}
                            className={errors.trigger_keyword ? 'border-destructive' : ''}
                          />
                          <Button type="button" size="sm" variant="outline" onClick={() => addKeyword(type)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {errors.trigger_keyword && (
                          <p className="text-xs text-destructive">{errors.trigger_keyword}</p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {cfg.keywords.map((kw) => (
                            <Badge key={kw} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeKeyword(type, kw)}>
                              {kw}
                              <X className="h-3 w-3" />
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {cfg.enabled && type === 'no_agent_reply' && (
                      <div className="ml-6 flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={cfg.minutes}
                          onChange={(e) => setTrigger(type, { minutes: parseInt(e.target.value) || 5 })}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">minutos sem resposta</span>
                      </div>
                    )}

                    {cfg.enabled && type === 'funnel_stage' && (
                      <div className="ml-6">
                        <Select value={cfg.stage_id} onValueChange={(v) => setTrigger(type, { stage_id: v })}>
                          <SelectTrigger className={errors.trigger_funnel_stage ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Selecione uma etapa" />
                          </SelectTrigger>
                          <SelectContent>
                            {(funnelStages as any[]).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.trigger_funnel_stage && (
                          <p className="text-xs text-destructive">{errors.trigger_funnel_stage}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createChatbot.isPending}>
            {createChatbot.isPending ? 'Criando...' : 'Criar e Abrir Editor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewChatbotFlowModal;
