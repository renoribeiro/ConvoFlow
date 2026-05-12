import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { providerLabel, type ProviderType } from '@/services/whatsapp';
import type { ActiveInstanceWithAdapter } from '@/hooks/useWhatsAppApi';

interface InstanceSelectorProps {
  instances: ActiveInstanceWithAdapter[];
  selectedId: string | null;
  onChange: (id: string) => void;
}

function statusBadge(status: string | null) {
  const s = (status ?? '').toLowerCase();
  if (s === 'connected' || s === 'open' || s === 'working') {
    return <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Conectada</Badge>;
  }
  if (s === 'connecting' || s === 'qrcode') {
    return <Badge variant="outline" className="border-amber-500/40 text-amber-600">Conectando</Badge>;
  }
  return <Badge variant="outline" className="border-destructive/40 text-destructive">Desconectada</Badge>;
}

export function InstanceSelector({ instances, selectedId, onChange }: InstanceSelectorProps) {
  if (!instances.length) {
    return (
      <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md px-3 py-2">
        Nenhuma instância de WhatsApp cadastrada.
      </div>
    );
  }

  const current = instances.find((x) => x.row.id === selectedId) ?? instances[0];
  if (!current) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={current.row.id} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[200px] text-xs">
          <SelectValue>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="w-5 h-5">
                {current.row.profile_picture_url && (
                  <AvatarImage src={current.row.profile_picture_url} alt={current.row.name} />
                )}
                <AvatarFallback className="text-[10px]">
                  {current.row.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{current.row.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground text-[11px]">
                {providerLabel((current.row.provider as ProviderType | null) ?? 'evolution')}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {instances.map((it) => (
            <SelectItem key={it.row.id} value={it.row.id}>
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2">
                  <Avatar className="w-5 h-5">
                    {it.row.profile_picture_url && (
                      <AvatarImage src={it.row.profile_picture_url} alt={it.row.name} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {it.row.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-xs">
                    <p className="font-medium">{it.row.name}</p>
                    <p className="text-muted-foreground">{it.providerLabel}</p>
                  </div>
                </div>
                {statusBadge(it.row.status)}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {statusBadge(current.row.status)}
    </div>
  );
}
