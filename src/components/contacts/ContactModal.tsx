
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, X, Plus } from 'lucide-react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useEnhancedSupabaseMutation } from '@/hooks/enhanced/useEnhancedSupabaseMutation';
import { ContactSchema, ContactCreateSchema, ContactUpdateSchema } from '@/lib/validations/contact';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId?: string | null;
}



export const ContactModal = ({ isOpen, onClose, contactId }: ContactModalProps) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    current_stage_id: '',
    lead_source_id: '',
    assigned_to: '',
    notes: ''
  });
  
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Schema de validação baseado no contexto (criar vs editar)
  const getValidationSchema = () => {
    return contactId ? ContactUpdateSchema : ContactCreateSchema;
  };

  // Função para validar um campo específico
  const validateField = (fieldName: string, value: any) => {
    try {
      const schema = getValidationSchema();
      const fieldSchema = schema.shape[fieldName as keyof typeof schema.shape];
      if (fieldSchema) {
        fieldSchema.parse(value);
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        setValidationErrors(prev => ({
          ...prev,
          [fieldName]: error.errors[0]?.message || 'Campo inválido'
        }));
      }
    }
  };

  // Função para validar todo o formulário
  const validateForm = () => {
    try {
      setIsValidating(true);
      const schema = getValidationSchema();
      
      // Preparar dados para validação
      const dataToValidate = {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        current_stage_id: formData.current_stage_id || undefined,
        lead_source_id: formData.lead_source_id || undefined,
        assigned_to: formData.assigned_to || undefined,
        notes: formData.notes || undefined,
      };

      schema.parse(dataToValidate);
      setValidationErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path.length > 0) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setValidationErrors(errors);
        
        // Log do erro de validação
        logger.warn('Erro de validação no formulário de contato', {
          errors: errors,
          formData: dataToValidate,
          operation: contactId ? 'update' : 'create'
        });
        
        toast.error('Por favor, corrija os erros no formulário');
      }
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Query para buscar dados do contato (se editando)
  const { data: contactData, isLoading: contactLoading, error: contactError } = useSupabaseQuery({
    table: 'contacts',
    select: `
      *,
      stage:funnel_stages!contacts_current_stage_id_fkey (id, name, color),
      contact_tags(
        tag_id,
        tags:tag_id(
          id,
          name,
          color
        )
      )
    `,
    filters: contactId ? [{ column: 'id', operator: 'eq', value: contactId }] : [],
    enabled: !!contactId && isOpen,
  });

  const contact = contactData?.[0];

  // Query para buscar estágios do funil
  const { data: stages = [], isLoading: stagesLoading } = useSupabaseQuery({
    table: 'funnel_stages',
    queryKey: ['funnel-stages'],
    select: 'id, name, color',
    orderBy: [{ column: 'order', ascending: true }],
    enabled: isOpen,
  });

  // Query para buscar usuários
  const { data: users = [], isLoading: usersLoading } = useSupabaseQuery({
    table: 'profiles',
    queryKey: ['users'],
    select: 'id, first_name, last_name',
    orderBy: [{ column: 'first_name', ascending: true }],
    enabled: isOpen,
  });

  // Query para buscar fontes de lead
  const { data: leadSources = [], isLoading: leadSourcesLoading } = useSupabaseQuery({
    table: 'lead_sources',
    queryKey: ['lead-sources'],
    select: 'id, name',
    orderBy: [{ column: 'name', ascending: true }],
    enabled: isOpen,
  });

  // Query para buscar todas as tags
  const { data: allTags = [], isLoading: tagsLoading } = useSupabaseQuery({
    table: 'tags',
    queryKey: ['tags'],
    select: 'id, name, color',
    orderBy: [{ column: 'name', ascending: true }],
    enabled: isOpen,
  });

  // Mutation para criar/atualizar contato com validação enhanced
  const saveMutation = useEnhancedSupabaseMutation({
    table: 'contacts',
    operation: contactId ? 'update' : 'insert',
    invalidateQueries: [['contacts'], ['contact', contactId]],
    successMessage: contactId ? 'Contato atualizado com sucesso!' : 'Contato criado com sucesso!',
    errorMessage: contactId ? 'Erro ao atualizar contato' : 'Erro ao criar contato',
    inputSchema: getValidationSchema(),
    enableLogging: true,
    showSuccessToast: true,
    showErrorToast: true,
    onSuccess: (data) => {
      logger.info('Contato salvo com sucesso', {
        contactId: contactId || data?.id,
        operation: contactId ? 'update' : 'create',
        tagsCount: selectedTags.length
      });
      onClose();
    },
    onError: (error) => {
      logger.error('Erro ao salvar contato', {
        error,
        contactId,
        operation: contactId ? 'update' : 'create',
        formData: formData
      });
    }
  });

  // Mutation para criar nova tag
  const createTagMutation = useSupabaseMutation({
    table: 'tags',
    operation: 'insert',
    invalidateQueries: [['tags']],
    successMessage: 'Tag criada com sucesso!',
    errorMessage: 'Erro ao criar tag'
  });

  // Mutation para gerenciar associações de tags
  const manageTagsMutation = useSupabaseMutation({
    table: 'contact_tags',
    operation: 'upsert',
    invalidateQueries: [['contacts']],
    errorMessage: 'Erro ao gerenciar tags do contato'
  });

  useEffect(() => {
    if (contact && contactId) {
      setFormData({
        name: contact.name || '',
        phone: contact.phone || '',
        email: contact.email || '',
        current_stage_id: contact.current_stage_id?.toString() || '',
        lead_source_id: contact.lead_source_id || '',
        assigned_to: contact.assigned_to?.toString() || '',
        notes: contact.notes || ''
      });
      
      // Carregar tags do contato
      const contactTagIds = contact.contact_tags?.map(ct => ct.tags?.id).filter(Boolean) || [];
      setSelectedTags(contactTagIds);
    } else if (!contactId) {
      setFormData({
        name: '',
        phone: '',
        email: '',
        current_stage_id: '',
        lead_source_id: '',
        assigned_to: '',
        notes: ''
      });
      setSelectedTags([]);
    }
  }, [contact, contactId, isOpen]);

  // Funções para gerenciar tags
  const addTag = (tagId: string) => {
    if (!selectedTags.includes(tagId)) {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const removeTag = (tagId: string) => {
    setSelectedTags(selectedTags.filter(id => id !== tagId));
  };

  const createNewTag = async () => {
    if (!newTagName.trim()) return;
    
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      const result = await createTagMutation.mutateAsync({        name: newTagName.trim(),        color: randomColor      });
      
      if (result?.data?.[0]?.id) {
        addTag(result.data[0].id);
        setNewTagName('');
      }
    } catch (error) {
      console.error('Erro ao criar tag:', error);
    }
  };

  const manageTags = async (contactId: string) => {
    try {
      // Primeiro, remover todas as tags existentes do contato
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/contact_tags?contact_id=eq.${contactId}`, {
        method: 'DELETE',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Depois, adicionar as tags selecionadas
      if (selectedTags.length > 0) {
        const tagAssociations = selectedTags.map(tagId => ({
          contact_id: contactId,
          tag_id: tagId
        }));
        
        await manageTagsMutation.mutateAsync(tagAssociations);
      }
    } catch (error) {
      console.error('Erro ao gerenciar tags:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar formulário antes de enviar
    if (!validateForm()) {
      return;
    }
    
    const contactData = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      email: formData.email?.trim() || null,
      current_stage_id: formData.current_stage_id || null,
      lead_source_id: formData.lead_source_id || null,
      assigned_to: formData.assigned_to || null,
      notes: formData.notes?.trim() || null,
    };

    try {
      if (contactId) {
        await saveMutation.mutateAsync({
          data: contactData,
          options: {
            filter: { column: 'id', operator: 'eq', value: contactId }
          }
        });
        // Gerenciar tags após salvar
        await manageTags(contactId);
      } else {
        const result = await saveMutation.mutateAsync({ 
          data: contactData
        });
        // Gerenciar tags após criar o contato
        if (result?.data?.[0]?.id) {
          await manageTags(result.data[0].id);
        }
      }
    } catch (error) {
      // Erro já tratado pela mutation enhanced
      logger.error('Erro no handleSubmit', { error, contactData });
    }
  };

  // Função para limpar formulário e erros
  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      current_stage_id: '',
      lead_source_id: '',
      assigned_to: '',
      notes: ''
    });
    setSelectedTags([]);
    setNewTagName('');
    setValidationErrors({});
  };

  // Função personalizada para fechar modal
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isLoading = saveMutation.isPending;
  const hasError = contactError;

  if (hasError) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erro ao carregar dados do contato. Tente novamente.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {contactId ? 'Editar Contato' : 'Novo Contato'}
          </DialogTitle>
        </DialogHeader>

        {contactLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Skeleton className="h-10 w-full" />
              </div>
              <div>
                <Label>Telefone *</Label>
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, name: value });
                    validateField('name', value);
                  }}
                  onBlur={() => validateField('name', formData.name)}
                  required
                  disabled={isLoading}
                  className={validationErrors.name ? 'border-red-500' : ''}
                />
                {validationErrors.name && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, phone: value });
                    validateField('phone', value);
                  }}
                  onBlur={() => validateField('phone', formData.phone)}
                  required
                  disabled={isLoading}
                  className={validationErrors.phone ? 'border-red-500' : ''}
                  placeholder="(11) 99999-9999"
                />
                {validationErrors.phone && (
                  <p className="text-sm text-red-500 mt-1">{validationErrors.phone}</p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({ ...formData, email: value });
                  if (value) validateField('email', value);
                }}
                onBlur={() => {
                  if (formData.email) validateField('email', formData.email);
                }}
                disabled={isLoading}
                className={validationErrors.email ? 'border-red-500' : ''}
                placeholder="exemplo@email.com"
              />
              {validationErrors.email && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.email}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estágio do Funil</Label>
                {stagesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select 
                    value={formData.current_stage_id} 
                    onValueChange={(value) => setFormData({ ...formData, current_stage_id: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Fonte do Lead</Label>
                {leadSourcesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select 
                    value={formData.lead_source_id} 
                    onValueChange={(value) => setFormData({ ...formData, lead_source_id: value })}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSources.map((source) => (
                        <SelectItem key={source.id} value={source.id.toString()}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div>
              <Label>Responsável</Label>
              {usersLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={formData.assigned_to} 
                  onValueChange={(value) => setFormData({ ...formData, assigned_to: value })}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Usuário sem nome'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Seção de Tags */}
            <div>
              <Label>Tags</Label>
              {tagsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <div className="space-y-3">
                  {/* Tags selecionadas */}
                  {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map((tagId) => {
                        const tag = allTags.find(t => t.id === tagId);
                        if (!tag) return null;
                        return (
                          <Badge
                            key={tagId}
                            variant="secondary"
                            className="flex items-center gap-1 px-2 py-1"
                            style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color }}
                          >
                            {tag.name}
                            <X
                              className="h-3 w-3 cursor-pointer hover:opacity-70"
                              onClick={() => removeTag(tagId)}
                            />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Seletor de tags existentes */}
                  <Select 
                    value="" 
                    onValueChange={addTag}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Adicionar tag existente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags
                        .filter(tag => !selectedTags.includes(tag.id))
                        .map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </div>
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  
                  {/* Criar nova tag */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome da nova tag..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      disabled={isLoading || createTagMutation.isPending}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          createNewTag();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={createNewTag}
                      disabled={!newTagName.trim() || isLoading || createTagMutation.isPending}
                    >
                      {createTagMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                disabled={isLoading}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading || isValidating}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || isValidating || Object.keys(validationErrors).length > 0}
              >
                {isLoading || isValidating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isValidating ? 'Validando...' : (contactId ? 'Salvando...' : 'Criando...')}
                  </>
                ) : (
                  contactId ? 'Salvar' : 'Criar'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
