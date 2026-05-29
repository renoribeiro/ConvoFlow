
import { useState, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ContactsTable } from '@/components/contacts/ContactsTable';
import { ContactModal } from '@/components/contacts/ContactModal';
import { ContactFilters } from '@/components/contacts/ContactFilters';
import { InstanceSelector } from '@/components/conversations/InstanceSelector';
import { Plus, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';

export default function Contacts() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: '',
    stage: '',
    source: '',
    tags: []
  });
  const { tenant } = useTenant();
  const { instances } = useWhatsAppInstancesWithAdapter();

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

  const escapeCsv = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExport = async () => {
    if (!tenant?.id) {
      toast.error('Tenant não identificado.');
      return;
    }
    if (isExporting) return;

    setIsExporting(true);
    toast.info('Preparando exportação...');

    try {
      let query = supabase
        .from('contacts')
        .select(`
          name,
          email,
          phone,
          notes,
          created_at,
          stage:funnel_stages!contacts_current_stage_id_fkey ( name ),
          lead_sources:lead_source_id ( name )
        `)
        .eq('tenant_id', tenant.id);

      if (activeInstanceId) {
        query = query.eq('whatsapp_instance_id', activeInstanceId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) {
        toast.warning('Nenhum contato para exportar.');
        return;
      }

      const header = ['Nome', 'Email', 'Telefone', 'Estágio', 'Origem', 'Notas', 'Criado em'];
      const lines = [header.join(',')];
      for (const r of rows as any[]) {
        lines.push(
          [
            escapeCsv(r.name),
            escapeCsv(r.email),
            escapeCsv(r.phone),
            escapeCsv(r.stage?.name),
            escapeCsv(r.lead_sources?.name),
            escapeCsv(r.notes),
            escapeCsv(r.created_at),
          ].join(','),
        );
      }

      const csvContent = '﻿' + lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `contatos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exportados ${rows.length} contatos.`);
    } catch (err) {
      toast.error('Falha ao exportar contatos.');
    } finally {
      setIsExporting(false);
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
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exportando...' : 'Exportar'}
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
        <div className="flex-1 space-y-3 min-w-0">
          {instances.length > 0 && (
            <InstanceSelector
              instances={instances}
              selectedId={activeInstanceId}
              onChange={(id) => setActiveInstanceId(id === '__all__' ? null : id)}
            />
          )}
          {/* Ajuste: abrir modal ao editar */}
          <ContactsTable
            filters={filters}
            whatsappInstanceId={activeInstanceId}
            onEdit={(id) => { setSelectedContact(id); setIsModalOpen(true); }}
          />
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
