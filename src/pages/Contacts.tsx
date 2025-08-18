
import { useState, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactModal } from '@/components/contacts/ContactModal';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import { Plus, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Contacts() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    stage: '',
    source: '',
    tags: []
  });

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo do arquivo
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
        toast.error('Por favor, selecione um arquivo CSV ou Excel.');
        return;
      }

      // Simular importação
      toast.success(`Importando contatos de ${file.name}...`);
      
      // Aqui você faria o upload e processamento do arquivo
      setTimeout(() => {
        toast.success('Contatos importados com sucesso!');
      }, 2000);
    }
  };

  const handleExport = () => {
    // Simular exportação
    toast.success('Preparando exportação...');
    
    // Criar dados CSV simulados
    const csvData = [
      ['Nome', 'Email', 'Telefone', 'Estágio', 'Origem'],
      ['João Silva', 'joao@email.com', '(11) 99999-9999', 'Lead', 'Website'],
      ['Maria Santos', 'maria@email.com', '(11) 88888-8888', 'Cliente', 'Indicação'],
      ['Pedro Costa', 'pedro@email.com', '(11) 77777-7777', 'Prospect', 'WhatsApp']
    ];
    
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `contatos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Contatos exportados com sucesso!');
    }
  };

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
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={handleImport}>
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
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
          {/* Ajuste: abrir modal ao editar */}
          <ContactsTable filters={filters} onEdit={(id) => { setSelectedContact(id); setIsModalOpen(true); }} />
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
