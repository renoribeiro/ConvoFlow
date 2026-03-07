# Plano de Implementação - Correções do Módulo Follow-ups

## 1. Especificações Técnicas Detalhadas

### 1.1 Correção do FollowupScheduler

#### Arquivo: `src/components/followups/FollowupScheduler.tsx`

**Mudanças Necessárias:**

1. **Importações Adicionais:**
```typescript
import { useFollowups } from '@/hooks/useFollowups'
import { useTenant } from '@/contexts/TenantContext'
import { useContacts } from '@/hooks/useContacts' // Assumindo que existe
import type { CreateFollowupData } from '@/integrations/supabase/types'
```

2. **Estado e Hooks:**
```typescript
export const FollowupScheduler = ({ onClose }: FollowupSchedulerProps) => {
  const { createFollowup, loading: followupLoading } = useFollowups()
  const { tenant } = useTenant()
  const { contacts, loading: contactsLoading } = useContacts()
  const [saving, setSaving] = useState(false)
  
  // ... resto do estado existente
}
```

3. **Função handleSave Corrigida:**
```typescript
const handleSave = async () => {
  if (!canSave || !tenant?.id || saving) return
  
  setSaving(true)
  
  try {
    // Combinar data e hora em ISO string
    const dueDateTime = new Date(formData.date!)
    const [hours, minutes] = formData.time.split(':')
    dueDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)
    
    const followupData: CreateFollowupData = {
      contact_id: formData.contactId,
      task: formData.task,
      type: formData.type as 'call' | 'email' | 'whatsapp',
      priority: formData.priority as 'high' | 'medium' | 'low',
      due_date: dueDateTime.toISOString(),
      notes: formData.notes || null,
      recurring: formData.recurring,
      recurring_type: formData.recurring ? formData.recurringType as 'daily' | 'weekly' | 'monthly' : null,
      recurring_count: formData.recurring ? formData.recurringCount : null
    }
    
    const result = await createFollowup(followupData)
    
    if (result) {
      toast.success('Follow-up agendado com sucesso!')
      onClose()
    }
  } catch (error) {
    console.error('Erro ao criar follow-up:', error)
    toast.error('Erro ao agendar follow-up')
  } finally {
    setSaving(false)
  }
}
```

4. **Seleção de Contatos Real:**
```typescript
{/* Substituir a seção de seleção de contato */}
<div>
  <Label htmlFor="contact">Contato</Label>
  <Select 
    value={formData.contactId} 
    onValueChange={(value) => setFormData({...formData, contactId: value})}
    disabled={contactsLoading}
  >
    <SelectTrigger>
      <SelectValue placeholder={contactsLoading ? "Carregando contatos..." : "Selecione um contato"} />
    </SelectTrigger>
    <SelectContent>
      {contacts.map((contact) => (
        <SelectItem key={contact.id} value={contact.id}>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <div>
              <div className="font-medium">{contact.name}</div>
              <div className="text-xs text-muted-foreground">{contact.phone}</div>
            </div>
          </div>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

5. **Botão de Salvar com Loading:**
```typescript
<Button 
  onClick={handleSave} 
  disabled={!canSave || saving || followupLoading}
>
  {saving ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Agendando...
    </>
  ) : (
    'Agendar Follow-up'
  )}
</Button>
```

### 1.2 Correção dos Tipos TypeScript

#### Arquivo: `src/integrations/supabase/types.ts`

**Tipos Corrigidos:**

```typescript
// Adicionar whatsapp_instance_id aos tipos customizados
export interface CreateFollowupData {
  contact_id: string
  task: string
  type: 'call' | 'email' | 'whatsapp'
  priority: 'high' | 'medium' | 'low'
  due_date: string // ISO string
  notes?: string | null
  recurring?: boolean
  recurring_type?: 'daily' | 'weekly' | 'monthly' | null
  recurring_count?: number | null
  whatsapp_instance_id?: string | null // NOVO CAMPO
}

export interface UpdateFollowupData {
  task?: string
  type?: 'call' | 'email' | 'whatsapp'
  priority?: 'high' | 'medium' | 'low'
  due_date?: string
  notes?: string | null
  status?: 'pending' | 'completed' | 'cancelled'
  recurring?: boolean
  recurring_type?: 'daily' | 'weekly' | 'monthly' | null
  recurring_count?: number | null
  whatsapp_instance_id?: string | null // NOVO CAMPO
}

// Adicionar tipo para contatos se não existir
export interface Contact {
  id: string
  name: string
  phone: string
  email?: string
  tenant_id: string
  created_at: string
  updated_at: string
}
```

### 1.3 Hook useContacts (se não existir)

#### Arquivo: `src/hooks/useContacts.ts`

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/contexts/TenantContext'
import type { Contact } from '@/integrations/supabase/types'
import { toast } from 'sonner'

export interface UseContactsReturn {
  contacts: Contact[]
  loading: boolean
  error: string | null
  refreshContacts: () => Promise<void>
}

export function useContacts(): UseContactsReturn {
  const { tenant } = useTenant()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchContacts = async () => {
    if (!tenant?.id) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('contacts')
        .select('id, name, phone, email')
        .eq('tenant_id', tenant.id)
        .order('name', { ascending: true })

      if (fetchError) {
        throw fetchError
      }

      setContacts(data || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar contatos'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const refreshContacts = async () => {
    await fetchContacts()
  }

  useEffect(() => {
    if (tenant?.id) {
      fetchContacts()
    }
  }, [tenant?.id])

  return {
    contacts,
    loading,
    error,
    refreshContacts
  }
}
```

### 1.4 Melhorias no Hook useFollowups

#### Arquivo: `src/hooks/useFollowups.ts`

**Adições Necessárias:**

1. **Validação Melhorada:**
```typescript
const createFollowup = async (data: CreateFollowupData): Promise<IndividualFollowup | null> => {
  if (!tenant?.id) {
    toast.error('Tenant não encontrado')
    return null
  }

  // Validação adicional
  if (!data.contact_id || !data.task || !data.type || !data.due_date) {
    toast.error('Campos obrigatórios não preenchidos')
    return null
  }

  // Validar se a data não é no passado
  const dueDate = new Date(data.due_date)
  const now = new Date()
  if (dueDate < now) {
    toast.error('A data do follow-up não pode ser no passado')
    return null
  }

  try {
    const { data: newFollowup, error: createError } = await supabase
      .from('individual_followups')
      .insert({
        ...data,
        tenant_id: tenant.id,
        status: 'pending'
      })
      .select(`
        *,
        contacts (
          id,
          name,
          phone
        )
      `)
      .single()

    if (createError) {
      throw createError
    }

    await refreshFollowups()
    toast.success('Follow-up criado com sucesso!')
    return newFollowup
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro ao criar follow-up'
    toast.error(errorMessage)
    return null
  }
}
```

2. **Função para Busca/Filtro:**
```typescript
const searchFollowups = (query: string): IndividualFollowup[] => {
  if (!query.trim()) return followups
  
  const lowercaseQuery = query.toLowerCase()
  return followups.filter(f => 
    f.task.toLowerCase().includes(lowercaseQuery) ||
    (f as any).contacts?.name?.toLowerCase().includes(lowercaseQuery) ||
    f.notes?.toLowerCase().includes(lowercaseQuery)
  )
}

const filterFollowups = (filters: {
  status?: string
  type?: string
  priority?: string
  contactId?: string
}): IndividualFollowup[] => {
  return followups.filter(f => {
    if (filters.status && f.status !== filters.status) return false
    if (filters.type && f.type !== filters.type) return false
    if (filters.priority && f.priority !== filters.priority) return false
    if (filters.contactId && f.contact_id !== filters.contactId) return false
    return true
  })
}
```

## 2. Melhorias de Interface

### 2.1 Componente de Busca

#### Arquivo: `src/components/followups/FollowupSearch.tsx`

```typescript
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Filter, X } from 'lucide-react'

interface FollowupSearchProps {
  onSearch: (query: string) => void
  onFilter: (filters: any) => void
  contacts: Array<{ id: string; name: string }>
}

export const FollowupSearch = ({ onSearch, onFilter, contacts }: FollowupSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    priority: '',
    contactId: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    onSearch(query)
  }

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilter(newFilters)
  }

  const clearFilters = () => {
    const emptyFilters = { status: '', type: '', priority: '', contactId: '' }
    setFilters(emptyFilters)
    onFilter(emptyFilters)
    setSearchQuery('')
    onSearch('')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar follow-ups..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="w-4 h-4 mr-2" />
          Filtros
        </Button>
        {(searchQuery || Object.values(filters).some(v => v)) && (
          <Button variant="outline" onClick={clearFilters}>
            <X className="w-4 h-4 mr-2" />
            Limpar
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
          <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.type} onValueChange={(value) => handleFilterChange('type', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Ligação</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.priority} onValueChange={(value) => handleFilterChange('priority', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.contactId} onValueChange={(value) => handleFilterChange('contactId', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Contato" />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contact.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
```

### 2.2 Paginação

#### Arquivo: `src/components/followups/FollowupPagination.tsx`

```typescript
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface FollowupPaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export const FollowupPagination = ({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: FollowupPaginationProps) => {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex items-center space-x-2">
        <p className="text-sm text-muted-foreground">
          Mostrando {startItem} a {endItem} de {totalItems} resultados
        </p>
      </div>
      
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Itens por página</p>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50, 100].map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center space-x-1">
            <p className="text-sm font-medium">
              Página {currentPage} de {totalPages}
            </p>
          </div>
          
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

## 3. Testes de Implementação

### 3.1 Teste do FollowupScheduler

#### Arquivo: `src/components/followups/__tests__/FollowupScheduler.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FollowupScheduler } from '../FollowupScheduler'
import { useFollowups } from '@/hooks/useFollowups'
import { useTenant } from '@/contexts/TenantContext'
import { useContacts } from '@/hooks/useContacts'

// Mocks
jest.mock('@/hooks/useFollowups')
jest.mock('@/contexts/TenantContext')
jest.mock('@/hooks/useContacts')

const mockUseFollowups = useFollowups as jest.MockedFunction<typeof useFollowups>
const mockUseTenant = useTenant as jest.MockedFunction<typeof useTenant>
const mockUseContacts = useContacts as jest.MockedFunction<typeof useContacts>

describe('FollowupScheduler', () => {
  const mockOnClose = jest.fn()
  const mockCreateFollowup = jest.fn()

  beforeEach(() => {
    mockUseFollowups.mockReturnValue({
      createFollowup: mockCreateFollowup,
      loading: false,
      // ... outros valores mock
    } as any)

    mockUseTenant.mockReturnValue({
      tenant: { id: 'tenant-1', name: 'Test Tenant' }
    } as any)

    mockUseContacts.mockReturnValue({
      contacts: [
        { id: 'contact-1', name: 'João Silva', phone: '+5511999999999' },
        { id: 'contact-2', name: 'Maria Santos', phone: '+5511888888888' }
      ],
      loading: false,
      error: null,
      refreshContacts: jest.fn()
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('deve renderizar o formulário corretamente', () => {
    render(<FollowupScheduler onClose={mockOnClose} />)
    
    expect(screen.getByText('Agendar Novo Follow-up')).toBeInTheDocument()
    expect(screen.getByLabelText('Contato')).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição da Tarefa')).toBeInTheDocument()
  })

  it('deve carregar contatos do tenant', () => {
    render(<FollowupScheduler onClose={mockOnClose} />)
    
    fireEvent.click(screen.getByRole('combobox', { name: /contato/i }))
    
    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
  })

  it('deve criar follow-up com dados válidos', async () => {
    mockCreateFollowup.mockResolvedValue({ id: 'new-followup' })
    
    render(<FollowupScheduler onClose={mockOnClose} />)
    
    // Preencher formulário
    fireEvent.click(screen.getByRole('combobox', { name: /contato/i }))
    fireEvent.click(screen.getByText('João Silva'))
    
    fireEvent.change(screen.getByLabelText('Descrição da Tarefa'), {
      target: { value: 'Ligar para cliente' }
    })
    
    fireEvent.click(screen.getByText('Ligação'))
    
    // Selecionar data e hora
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    // ... configurar data e hora
    
    fireEvent.click(screen.getByText('Agendar Follow-up'))
    
    await waitFor(() => {
      expect(mockCreateFollowup).toHaveBeenCalledWith({
        contact_id: 'contact-1',
        task: 'Ligar para cliente',
        type: 'call',
        priority: 'medium',
        due_date: expect.any(String),
        notes: null,
        recurring: false,
        recurring_type: null,
        recurring_count: null
      })
    })
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('deve validar campos obrigatórios', () => {
    render(<FollowupScheduler onClose={mockOnClose} />)
    
    const saveButton = screen.getByText('Agendar Follow-up')
    expect(saveButton).toBeDisabled()
  })

  it('deve mostrar loading durante criação', async () => {
    mockCreateFollowup.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)))
    
    render(<FollowupScheduler onClose={mockOnClose} />)
    
    // Preencher formulário válido
    // ...
    
    fireEvent.click(screen.getByText('Agendar Follow-up'))
    
    expect(screen.getByText('Agendando...')).toBeInTheDocument()
  })
})
```

### 3.2 Teste do Hook useFollowups

#### Arquivo: `src/hooks/__tests__/useFollowups.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react'
import { useFollowups } from '../useFollowups'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/contexts/TenantContext'

// Mocks
jest.mock('@/integrations/supabase/client')
jest.mock('@/contexts/TenantContext')

const mockSupabase = supabase as jest.Mocked<typeof supabase>
const mockUseTenant = useTenant as jest.MockedFunction<typeof useTenant>

describe('useFollowups', () => {
  beforeEach(() => {
    mockUseTenant.mockReturnValue({
      tenant: { id: 'tenant-1', name: 'Test Tenant' }
    } as any)

    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis()
    } as any)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('deve buscar follow-ups do tenant', async () => {
    const mockFollowups = [
      {
        id: '1',
        task: 'Ligar para cliente',
        status: 'pending',
        due_date: '2024-01-15T10:00:00Z'
      }
    ]

    mockSupabase.from().select().eq().order.mockResolvedValue({
      data: mockFollowups,
      error: null
    })

    const { result } = renderHook(() => useFollowups())

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(result.current.followups).toEqual(mockFollowups)
    expect(result.current.loading).toBe(false)
  })

  it('deve criar novo follow-up', async () => {
    const newFollowup = {
      id: 'new-id',
      task: 'Nova tarefa',
      status: 'pending'
    }

    mockSupabase.from().insert().select().single.mockResolvedValue({
      data: newFollowup,
      error: null
    })

    const { result } = renderHook(() => useFollowups())

    await act(async () => {
      const created = await result.current.createFollowup({
        contact_id: 'contact-1',
        task: 'Nova tarefa',
        type: 'call',
        priority: 'medium',
        due_date: '2024-01-15T10:00:00Z'
      })

      expect(created).toEqual(newFollowup)
    })
  })

  it('deve calcular estatísticas corretamente', () => {
    const mockFollowups = [
      { status: 'pending', due_date: '2024-01-15T10:00:00Z' },
      { status: 'completed', due_date: '2024-01-14T10:00:00Z' },
      { status: 'pending', due_date: '2023-12-01T10:00:00Z' } // overdue
    ]

    // Mock para retornar followups
    const { result } = renderHook(() => useFollowups())

    // Simular followups carregados
    act(() => {
      // Atualizar estado interno com followups mock
    })

    expect(result.current.stats.total).toBe(3)
    expect(result.current.stats.pending).toBe(2)
    expect(result.current.stats.completed).toBe(1)
    expect(result.current.stats.overdue).toBe(1)
  })
})
```

## 4. Checklist de Implementação

### Fase 1: Correções Críticas ✅
- [ ] Integrar FollowupScheduler com useFollowups
- [ ] Corrigir tipos TypeScript (adicionar whatsapp_instance_id)
- [ ] Implementar busca real de contatos
- [ ] Adicionar validação de dados
- [ ] Implementar loading states
- [ ] Testar criação de follow-ups

### Fase 2: Melhorias de UX ✅
- [ ] Implementar componente de busca
- [ ] Adicionar filtros avançados
- [ ] Implementar paginação
- [ ] Melhorar feedback visual
- [ ] Adicionar confirmações de ação
- [ ] Otimizar performance

### Fase 3: Testes ✅
- [ ] Testes unitários dos componentes
- [ ] Testes do hook useFollowups
- [ ] Testes de integração
- [ ] Testes E2E básicos
- [ ] Testes de performance

### Fase 4: Deploy ✅
- [ ] Revisão de código
- [ ] Testes em ambiente de staging
- [ ] Documentação atualizada
- [ ] Deploy em produção
- [ ] Monitoramento pós-deploy

Este plano garante uma implementação sistemática e completa de todas as correções necessárias no módulo de follow-ups.