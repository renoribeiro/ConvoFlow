import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/shared/EmptyState';
import { CampaignWizard } from './CampaignWizardNew';
import { CampaignReportsModal } from './CampaignReportsModal';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Pagination } from '@/components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Send, Edit, Pause, Play, Trash2, Clock, Users, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CampaignCardSkeleton } from '@/components/shared/Skeleton';
import { logger } from '@/lib/logger';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
}

interface CampaignsListProps {
  status: string;
  onEdit: (id: string) => void;
}

export const CampaignsList = ({ status, onEdit }: CampaignsListProps) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    campaignId: string | null;
    campaignName: string;
  }>({ isOpen: false, campaignId: null, campaignName: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Configurar paginação
  const pagination = usePagination({
    totalItems: campaigns.length,
    initialItemsPerPage: 6
  });

  // Aplicar paginação às campanhas
  const paginatedCampaigns = useMemo(() => {
    const startIndex = pagination.startIndex;
    const endIndex = startIndex + pagination.itemsPerPage;
    return campaigns.slice(startIndex, endIndex);
  }, [campaigns, pagination.startIndex, pagination.itemsPerPage]);

  useEffect(() => {
    loadCampaigns();
  }, [status]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return;

      const { data: campaignsData, error } = await supabase
        .from('mass_message_campaigns')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(campaignsData || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: "Erro",
        description: "Falha ao carregar campanhas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getProgress = (campaign: Campaign) => {
    if (campaign.total_recipients === 0) return 0;
    return Math.round((campaign.sent_count / campaign.total_recipients) * 100);
  };

  const getSuccessRate = (campaign: Campaign) => {
    if (campaign.sent_count === 0) return 0;
    return Math.round(((campaign.sent_count - campaign.failed_count) / campaign.sent_count) * 100);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays} dias atrás`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
    return `${Math.floor(diffDays / 30)} meses atrás`;
  };

  const handleDeleteClick = (campaignId: string, campaignName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      campaignId,
      campaignName
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.campaignId) return;

    try {
      setIsDeleting(true);
      
      logger.info('Iniciando exclusão de campanha', {
        category: 'campaign_management',
        action: 'delete_campaign',
        campaignId: deleteConfirmation.campaignId,
        campaignName: deleteConfirmation.campaignName
      });

      const { error } = await supabase
        .from('mass_message_campaigns')
        .delete()
        .eq('id', deleteConfirmation.campaignId);

      if (error) throw error;

      logger.info('Campanha excluída com sucesso', {
        category: 'campaign_management',
        action: 'delete_campaign',
        campaignId: deleteConfirmation.campaignId,
        campaignName: deleteConfirmation.campaignName,
        status: 'success'
      });

      toast({
        title: 'Campanha excluída',
        description: 'A campanha foi excluída com sucesso.',
      });

      setDeleteConfirmation({ isOpen: false, campaignId: null, campaignName: '' });
      await loadCampaigns();
    } catch (error) {
      logger.error('Erro ao excluir campanha', {
        category: 'campaign_management',
        action: 'delete_campaign',
        campaignId: deleteConfirmation.campaignId,
        campaignName: deleteConfirmation.campaignName,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });

      toast({
        title: 'Erro ao excluir campanha',
        description: 'Ocorreu um erro ao excluir a campanha. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, campaignId: null, campaignName: '' });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <CampaignCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <>
        <div className="text-center py-12">
          <h3 className="text-lg font-semibold mb-2">Nenhuma campanha encontrada</h3>
          <p className="text-muted-foreground mb-4">
            Não há campanhas {status === 'draft' ? 'em rascunho' : status === 'active' ? 'ativas' : status} no momento.
          </p>
          <Button onClick={() => setShowWizard(true)}>Nova Campanha</Button>
        </div>
        {showWizard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <CampaignWizard
              onClose={() => setShowWizard(false)}
              onCampaignCreated={loadCampaigns}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {paginatedCampaigns.map((campaign) => (
          <Card key={campaign.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{campaign.name}</h3>
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground">{campaign.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                    {campaign.status}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(campaign.id)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteClick(campaign.id, campaign.name)}
                        className="text-red-600"
                        disabled={isDeleting}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{getProgress(campaign)}%</div>
                  <div className="text-xs text-muted-foreground">Progresso</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold flex items-center justify-center gap-1">
                    <Users className="h-4 w-4" />
                    {campaign.total_recipients}
                  </div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{campaign.sent_count}</div>
                  <div className="text-xs text-muted-foreground">Enviadas</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{getSuccessRate(campaign)}%</div>
                  <div className="text-xs text-muted-foreground">Taxa de Sucesso</div>
                </div>
              </div>

              <Progress value={getProgress(campaign)} className="mb-2" />
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Criada {formatDate(campaign.created_at)}
                </span>
                {campaign.scheduled_at && (
                  <span>Agendada para {formatDate(campaign.scheduled_at)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paginação */}
      {campaigns.length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={campaigns.length}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            showItemsPerPage={true}
            itemsPerPageOptions={[3, 6, 12, 24]}
          />
        </div>
      )}

      {showWizard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <CampaignWizard 
            onClose={() => setShowWizard(false)}
            onCampaignCreated={loadCampaigns}
          />
        </div>
      )}
      
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Excluir Campanha"
        description={`Tem certeza que deseja excluir a campanha "${deleteConfirmation.campaignName}"? Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={isDeleting}
        icon={<Trash2 className="h-5 w-5 text-red-500" />}
      />
    </>
  );
};