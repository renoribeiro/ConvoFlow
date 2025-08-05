
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, MessageCircle, Edit, Trash2, AlertCircle, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { Link } from 'react-router-dom';
import React from 'react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  current_stage_id?: string;
  lead_source_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_blocked?: boolean;
  funnel_stages?: {
    name: string;
    color: string;
  };
  conversations?: {
    last_message_at: string;
  }[];
  contact_tags?: {
    tag_id: string;
    tags?: {
      id: string;
      name: string;
      color: string;
    };
  }[];
}

interface ContactsTableProps {
  filters: {
    search: string;
    stage: string;
    source: string;
    tags: string[];
  };
  onEdit: (id: string) => void;
}


const TableSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center space-x-4 p-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-8" />
      </div>
    ))}
  </div>
);

export const ContactsTable = ({ filters, onEdit }: ContactsTableProps) => {
  // Construir query dinâmica baseada nos filtros
  const buildQuery = () => {
    let query = {
      select: `
        *,
        funnel_stages:current_stage_id (
          name,
          color
        ),
        conversations (
          last_message_at
        ),
        contact_tags (
          tag_id,
          tags (
            id,
            name,
            color
          )
        )
      `,
      orderBy: [{ column: 'created_at', ascending: false }]
    };

    // Aplicar filtros
    const filters_array = [];
    
    // Filtro de estágio
    if (filters.stage && filters.stage !== 'all' && filters.stage !== '') {
      filters_array.push({
        column: 'current_stage_id',
        operator: 'eq',
        value: filters.stage
      });
    }
    
    // Filtro de fonte
    if (filters.source && filters.source !== 'all' && filters.source !== '') {
      filters_array.push({
        column: 'lead_source_id',
        operator: 'eq',
        value: filters.source
      });
    }

    return { ...query, filter: filters_array };
  };

  const { data: allContacts = [], isLoading, error } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['contacts', filters.stage, filters.source, filters.tags],
    ...buildQuery()
  });

  // Aplicar filtros de busca e tags no lado do cliente
  const contacts = React.useMemo(() => {
    let filteredContacts = allContacts;
    
    // Filtro por tags
    if (filters.tags && filters.tags.length > 0) {
      filteredContacts = filteredContacts.filter(contact => {
        const contactTagIds = contact.contact_tags?.map(ct => ct.tags?.id) || [];
        return filters.tags.some(tagId => contactTagIds.includes(tagId));
      });
    }
    
    // Filtro de busca
    if (!filters.search || !filters.search.trim()) {
      return filteredContacts;
    }
    
    const searchTerm = filters.search.trim().toLowerCase();
    return filteredContacts.filter(contact => 
      contact.name?.toLowerCase().includes(searchTerm) ||
      contact.phone?.toLowerCase().includes(searchTerm) ||
      contact.email?.toLowerCase().includes(searchTerm)
    );
  }, [allContacts, filters.search, filters.tags]);

  const deleteMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'delete',
    invalidateQueries: [['contacts']],
    successMessage: 'Contato excluído com sucesso!',
    errorMessage: 'Erro ao excluir contato. Tente novamente.'
  });

  const handleDelete = (contactId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este contato?')) {
      deleteMutation.mutate({
        data: {},
        options: {
          filter: { column: 'id', operator: 'eq', value: contactId }
        }
      });
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Contatos</h3>
              <Skeleton className="h-4 w-32 mt-1" />
            </div>
          </div>
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg">
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erro ao carregar contatos. Tente novamente.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Contatos</h3>
            <p className="text-sm text-muted-foreground">{contacts.length} contatos encontrados</p>
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum contato encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filters.search || filters.stage || filters.source
                ? 'Tente ajustar os filtros de busca'
                : 'Adicione seu primeiro contato para começar'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Estágio</TableHead>
                <TableHead>Fonte</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Última Interação</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>
                          {contact.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{contact.name}</p>
                        <p className="text-sm text-muted-foreground">{contact.phone}</p>
                        {contact.email && (
                          <p className="text-xs text-muted-foreground">{contact.email}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {contact.funnel_stages ? (
                      <Badge 
                        style={{ 
                          backgroundColor: `${contact.funnel_stages.color}20`,
                          color: contact.funnel_stages.color,
                          borderColor: contact.funnel_stages.color
                        }}
                        variant="outline"
                      >
                        {contact.funnel_stages.name}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Sem estágio</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {contact.lead_source_id ? (
                      <Badge variant="outline">Fonte {contact.lead_source_id}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.contact_tags && contact.contact_tags.length > 0 ? (
                        contact.contact_tags.map((contactTag) => (
                          contactTag.tags && (
                            <Badge
                              key={contactTag.tag_id}
                              variant="outline"
                              style={{
                                backgroundColor: `${contactTag.tags.color}20`,
                                color: contactTag.tags.color,
                                borderColor: contactTag.tags.color
                              }}
                              className="text-xs"
                            >
                              {contactTag.tags.name}
                            </Badge>
                          )
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={contact.is_blocked ? 'secondary' : 'default'}
                      className={contact.is_blocked ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}
                    >
                      {contact.is_blocked ? 'Bloqueado' : 'Ativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contact.conversations && contact.conversations.length > 0 && contact.conversations[0].last_message_at ? (
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(contact.conversations[0].last_message_at), {
                          locale: ptBR,
                          addSuffix: true
                        })}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/conversations?contact=${contact.id}`}>
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Conversar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEdit(contact.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(contact.id)}
                          className="text-red-600"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};
