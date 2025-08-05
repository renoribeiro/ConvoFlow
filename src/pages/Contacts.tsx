
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactModal } from '@/components/contacts/ContactModal';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import { Plus, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Contacts() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    stage: '',
    source: '',
    tags: []
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contatos"
        description="Gerencie todos os seus leads e contatos em um só lugar"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Contatos' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button onClick={() => setIsModalOpen(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Novo Contato
            </Button>
          </div>
        }
      />

      {/* Layout lado a lado: Filtros à esquerda, Tabela à direita */}
      <div className="flex gap-6">
        {/* Filtros à esquerda */}
        <div className="w-80 flex-shrink-0">
          <ContactFilters filters={filters} onFiltersChange={setFilters} />
        </div>
        
        {/* Tabela à direita */}
        <div className="flex-1">
          <ContactsTable filters={filters} onEdit={setSelectedContact} />
        </div>
      </div>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedContact(null);
        }}
        contactId={selectedContact}
      />
    </div>
  );
}
