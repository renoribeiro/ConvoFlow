import { Store } from 'lucide-react';
import { useMyStores } from '@/hooks/useMyStores';
import { useTenant, useIsGerente } from '@/contexts/TenantContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Seletor de Loja do Gerente. Troca a Loja ativa — dashboard, conversas,
 * campanhas etc. passam a refletir a loja escolhida (reaproveita o mecanismo de
 * tenant ativo do TenantContext). Só renderiza para um gerente que tenha ao
 * menos uma loja; para gestor/atendente não aparece.
 */
export const StoreSwitcher = () => {
  const isGerente = useIsGerente();
  const { tenantId, setActiveTenant } = useTenant();
  const { stores, isLoading } = useMyStores();

  if (!isGerente || isLoading || stores.length === 0) return null;

  const current = stores.find((s) => s.id === tenantId)?.id;

  return (
    <Select value={current} onValueChange={(v) => setActiveTenant(v)}>
      <SelectTrigger className="w-[220px] gap-2" aria-label="Selecionar loja">
        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Selecionar loja" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default StoreSwitcher;
