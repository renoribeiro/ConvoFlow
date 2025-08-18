# Guia de Implementação - Funcionalidade de Edição de Follow-ups

## 1. Visão Geral da Implementação

Este documento detalha os passos específicos para implementar a funcionalidade completa de edição de follow-ups individuais no ConvoFlow, incluindo criação da tabela no banco de dados, hooks personalizados, componentes React e integração com Supabase.

## 2. Etapas de Implementação

### 2.1 Etapa 1: Criação da Migração do Banco de Dados

**Arquivo:** `supabase/migrations/YYYYMMDD_create_individual_followups.sql`

```sql
-- Migração para criar tabela de follow-ups individuais
CREATE TABLE public.individual_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id),
    task TEXT NOT NULL,
    due_date TIMESTAMPTZ NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    type TEXT NOT NULL CHECK (type IN ('call', 'email', 'whatsapp')),
    notes TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    recurring BOOLEAN DEFAULT false,
    recurring_type TEXT CHECK (recurring_type IN ('daily', 'weekly', 'monthly')),
    recurring_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_individual_followups_tenant_id ON public.individual_followups(tenant_id);
CREATE INDEX idx_individual_followups_contact_id ON public.individual_followups(contact_id);
CREATE INDEX idx_individual_followups_due_date ON public.individual_followups(due_date);
CREATE INDEX idx_individual_followups_status ON public.individual_followups(status);

-- Trigger para updated_at
CREATE TRIGGER update_individual_followups_updated_at 
    BEFORE UPDATE ON public.individual_followups 
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.individual_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access own tenant individual followups" 
    ON public.individual_followups
    FOR ALL 
    USING (tenant_id = public.get_current_user_tenant_id());

CREATE POLICY "Super admins can access all individual followups" 
    ON public.individual_followups
    FOR ALL 
    USING (public.is_super_admin());

-- Permissões
GRANT SELECT ON public.individual_followups TO anon;
GRANT ALL PRIVILEGES ON public.individual_followups TO authenticated;

-- Função para estatísticas
CREATE OR REPLACE FUNCTION public.get_followup_stats(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'completed_today', COUNT(*) FILTER (
            WHERE status = 'completed' 
            AND DATE(updated_at) = CURRENT_DATE
        ),
        'overdue', COUNT(*) FILTER (
            WHERE status = 'pending' 
            AND due_date < NOW()
        )
    )
    INTO result
    FROM public.individual_followups
    WHERE tenant_id = p_tenant_id;
    
    RETURN result;
END;
$$;
```

### 2.2 Etapa 2: Atualização dos Tipos TypeScript

**Arquivo:** `src/integrations/supabase/types.ts`

```typescript
// Adicionar ao arquivo de tipos existente
export interface IndividualFollowup {
  id: string;
  tenant_id: string;
  contact_id: string;
  whatsapp_instance_id?: string;
  task: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  type: 'call' | 'email' | 'whatsapp';
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  recurring: boolean;
  recurring_type?: 'daily' | 'weekly' | 'monthly';
  recurring_count: number;
  created_at: string;
  updated_at: string;
  contacts?: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface FollowupStats {
  total: number;
  pending: number;
  completed_today: number;
  overdue: number;
}

export interface CreateFollowupData {
  contact_id: string;
  task: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  type: 'call' | 'email' | 'whatsapp';
  notes?: string;
  recurring?: boolean;
  recurring_type?: 'daily' | 'weekly' | 'monthly';
  recurring_count?: number;
}

export interface UpdateFollowupData extends Partial<CreateFollowupData> {
  status?: 'pending' | 'completed' | 'cancelled';
}
```

### 2.3 Etapa 3: Hook Personalizado para Follow-ups

**Arquivo:** `src/hooks/useFollowups.ts`

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IndividualFollowup, FollowupStats, CreateFollowupData, UpdateFollowupData } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const useFollowups = () => {
  const [followups, setFollowups] = useState<IndividualFollowup[]>([]);
  const [stats, setStats] = useState<FollowupStats>({ total: 0, pending: 0, completed_today: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchFollowups = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('individual_followups')
        .select(`
          *,
          contacts (
            name,
            phone,
            email
          )
        `)
        .order('due_date', { ascending: true });

      if (error) throw error;
      setFollowups(data || []);
    } catch (error) {
      console.error('Erro ao buscar follow-ups:', error);
      toast.error('Erro ao carregar follow-ups');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) return;

      const { data, error } = await supabase
        .rpc('get_followup_stats', { p_tenant_id: profile.tenant_id });

      if (error) throw error;
      setStats(data || { total: 0, pending: 0, completed_today: 0, overdue: 0 });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    }
  };

  const createFollowup = async (data: CreateFollowupData) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id)
        .single();

      if (!profile?.tenant_id) throw new Error('Tenant não encontrado');

      const { error } = await supabase
        .from('individual_followups')
        .insert({
          ...data,
          tenant_id: profile.tenant_id
        });

      if (error) throw error;
      
      toast.success('Follow-up criado com sucesso!');
      await fetchFollowups();
      await fetchStats();
    } catch (error) {
      console.error('Erro ao criar follow-up:', error);
      toast.error('Erro ao criar follow-up');
      throw error;
    }
  };

  const updateFollowup = async (id: string, data: UpdateFollowupData) => {
    try {
      const { error } = await supabase
        .from('individual_followups')
        .update(data)
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Follow-up atualizado com sucesso!');
      await fetchFollowups();
      await fetchStats();
    } catch (error) {
      console.error('Erro ao atualizar follow-up:', error);
      toast.error('Erro ao atualizar follow-up');
      throw error;
    }
  };

  const deleteFollowup = async (id: string) => {
    try {
      const { error } = await supabase
        .from('individual_followups')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Follow-up excluído com sucesso!');
      await fetchFollowups();
      await fetchStats();
    } catch (error) {
      console.error('Erro ao excluir follow-up:', error);
      toast.error('Erro ao excluir follow-up');
      throw error;
    }
  };

  const completeFollowup = async (id: string) => {
    await updateFollowup(id, { status: 'completed' });
  };

  const getFollowupsByStatus = (status: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    switch (status) {
      case 'pending':
        return followups.filter(f => f.status === 'pending' && new Date(f.due_date) >= tomorrow);
      case 'today':
        return followups.filter(f => {
          const dueDate = new Date(f.due_date);
          return f.status === 'pending' && dueDate >= today && dueDate < tomorrow;
        });
      case 'completed':
        return followups.filter(f => f.status === 'completed');
      case 'overdue':
        return followups.filter(f => f.status === 'pending' && new Date(f.due_date) < today);
      default:
        return followups;
    }
  };

  useEffect(() => {
    if (user) {
      fetchFollowups();
      fetchStats();
    }
  }, [user]);

  return {
    followups,
    stats,
    loading,
    createFollowup,
    updateFollowup,
    deleteFollowup,
    completeFollowup,
    getFollowupsByStatus,
    refetch: () => {
      fetchFollowups();
      fetchStats();
    }
  };
};
```

### 2.4 Etapa 4: Componente de Modal de Edição

**Arquivo:** `src/components/followups/FollowupEditModal.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IndividualFollowup, UpdateFollowupData } from '@/integrations/supabase/types';
import { useFollowups } from '@/hooks/useFollowups';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface FollowupEditModalProps {
  followup: IndividualFollowup | null;
  open: boolean;
  onClose: () => void;
}

export const FollowupEditModal = ({ followup, open, onClose }: FollowupEditModalProps) => {
  const { updateFollowup, deleteFollowup } = useFollowups();
  const [formData, setFormData] = useState<UpdateFollowupData>({
    task: '',
    due_date: '',
    priority: 'medium',
    type: 'call',
    notes: '',
    status: 'pending'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (followup) {
      setFormData({
        task: followup.task,
        due_date: new Date(followup.due_date).toISOString().slice(0, 16),
        priority: followup.priority,
        type: followup.type,
        notes: followup.notes || '',
        status: followup.status
      });
    }
  }, [followup]);

  const handleSave = async () => {
    if (!followup) return;
    
    try {
      setLoading(true);
      await updateFollowup(followup.id, {
        ...formData,
        due_date: new Date(formData.due_date!).toISOString()
      });
      onClose();
    } catch (error) {
      // Error handled by hook
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!followup) return;
    
    if (confirm('Tem certeza que deseja excluir este follow-up?')) {
      try {
        setLoading(true);
        await deleteFollowup(followup.id);
        onClose();
      } catch (error) {
        // Error handled by hook
      } finally {
        setLoading(false);
      }
    }
  };

  const canSave = formData.task && formData.due_date && formData.priority && formData.type;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Follow-up</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="task">Tarefa</Label>
              <Input
                id="task"
                value={formData.task}
                onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                placeholder="Descreva a tarefa do follow-up"
              />
            </div>
            
            <div>
              <Label htmlFor="due_date">Data e Hora</Label>
              <Input
                id="due_date"
                type="datetime-local"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Prioridade</Label>
              <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Tipo</Label>
              <Select value={formData.type} onValueChange={(value: any) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Ligação</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas adicionais sobre o follow-up"
              rows={3}
            />
          </div>
          
          <div className="flex justify-between pt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canSave || loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

### 2.5 Etapa 5: Atualização do Componente FollowupsList

**Modificações no arquivo:** `src/components/followups/FollowupsList.tsx`

```typescript
// Adicionar imports
import { useFollowups } from '@/hooks/useFollowups';
import { FollowupEditModal } from './FollowupEditModal';
import { IndividualFollowup } from '@/integrations/supabase/types';

// Substituir interface Followup pela IndividualFollowup
// Remover mockFollowups

// Atualizar o componente
export const FollowupsList = ({ status }: FollowupsListProps) => {
  const { getFollowupsByStatus, completeFollowup } = useFollowups();
  const [editingFollowup, setEditingFollowup] = useState<IndividualFollowup | null>(null);
  
  const followups = getFollowupsByStatus(status);

  const handleComplete = async (id: string) => {
    await completeFollowup(id);
  };

  const handleEdit = (followup: IndividualFollowup) => {
    setEditingFollowup(followup);
  };

  // Atualizar o botão Editar no JSX
  <Button size="sm" variant="outline" onClick={() => handleEdit(followup)}>
    Editar
  </Button>

  // Adicionar o modal no final do JSX
  <FollowupEditModal
    followup={editingFollowup}
    open={!!editingFollowup}
    onClose={() => setEditingFollowup(null)}
  />
};
```

### 2.6 Etapa 6: Atualização da Página Principal

**Modificações no arquivo:** `src/pages/Followups.tsx`

```typescript
// Adicionar import
import { useFollowups } from '@/hooks/useFollowups';

// Substituir stats mockados
export default function Followups() {
  const { stats, loading } = useFollowups();
  const [showScheduler, setShowScheduler] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  // Usar stats reais ao invés de mockados
  // const stats = { ... } // Remover esta linha

  // Resto do componente permanece igual
};
```

## 3. Checklist de Implementação

* [ ] Criar migração do banco de dados

* [ ] Aplicar migração no Supabase

* [ ] Atualizar tipos TypeScript

* [ ] Criar hook useFollowups

* [ ] Criar componente FollowupEditModal

* [ ] Atualizar FollowupsList para usar dados reais

* [ ] Atualizar página Followups para usar estatísticas reais

* [ ] Testar funcionalidade de criação

* [ ] Testar funcionalidade de edição

* [ ] Testar funcionalidade de exclusão

* [ ] Testar funcionalidade de conclusão

* [ ] Verificar responsividade

* [ ] Testar políticas RLS

## 4. Considerações de Segurança

* Todas as operações respeitam as políticas RLS do Supabase

* Usuários só podem acessar follow-ups do próprio tenant

* Super admins têm acesso completo

* Validação de dados no frontend e backend

* Confirmação antes de exclusões

## 5. Performance

* Índices criados para queries frequentes

* Paginação pode ser implementada futuramente se necessário

* Cache local dos dados para melhor UX

* Otimização de queries com select específico

