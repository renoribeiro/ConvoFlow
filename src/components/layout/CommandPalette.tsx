import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  Bot,
  FileText,
  Filter,
  GaugeCircle,
  LayoutDashboard,
  MessageCircle,
  Megaphone,
  Phone,
  Send,
  Settings,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useModules } from '@/hooks/useModules';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import {
  useHasMinRole,
  useIsSuperAdmin,
  useTenant,
} from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import type { UserRole } from '@/types/userHierarchy';

type PageItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Nome do módulo em module_settings (omita para páginas sempre visíveis). */
  moduleName?: string;
  superAdminOnly?: boolean;
  minRole?: UserRole;
  keywords?: string[];
};

const PREMIUM_MODULES = new Set([
  'chatbots',
  'automation',
  'campaigns',
  'followups',
  'reports',
  'tracking',
  'funnel',
]);

const PAGES: PageItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, keywords: ['inicio', 'home'] },
  { label: 'Conversas', path: '/dashboard/conversations', icon: MessageCircle, moduleName: 'conversations', keywords: ['chat', 'mensagens'] },
  { label: 'Contatos', path: '/dashboard/contacts', icon: Users, moduleName: 'contacts', keywords: ['leads'] },
  { label: 'Funil', path: '/dashboard/funnel', icon: Filter, moduleName: 'funnel', keywords: ['pipeline', 'kanban'] },
  { label: 'Tracking', path: '/dashboard/tracking', icon: Activity, moduleName: 'tracking', keywords: ['rastreio', 'analytics'] },
  { label: 'Relatórios', path: '/dashboard/reports', icon: FileText, moduleName: 'reports', keywords: ['reports', 'analytics'] },
  { label: 'Chatbots', path: '/dashboard/chatbots', icon: Bot, moduleName: 'chatbots', keywords: ['bot', 'ia'] },
  { label: 'Campanhas', path: '/dashboard/campaigns', icon: Megaphone, moduleName: 'campaigns', keywords: ['disparo', 'broadcast'] },
  { label: 'Followups', path: '/dashboard/followups', icon: Send, moduleName: 'followups', keywords: ['lembrete', 'sequencia'] },
  { label: 'Automação', path: '/dashboard/automation', icon: Workflow, moduleName: 'automation', keywords: ['workflow', 'fluxo'] },
  { label: 'Números WhatsApp', path: '/dashboard/whatsapp-numbers', icon: Smartphone, moduleName: 'whatsapp-numbers', keywords: ['instancias', 'sessoes', 'conexoes'] },
  { label: 'Configurações', path: '/dashboard/settings', icon: Settings, keywords: ['preferencias', 'config'] },
  { label: 'Notificações', path: '/dashboard/notifications', icon: Bell },
  { label: 'Meu Perfil', path: '/dashboard/profile', icon: UserCog, keywords: ['conta', 'avatar'] },
  { label: 'Equipe', path: '/dashboard/team', icon: UsersRound, minRole: 'agencia', keywords: ['usuarios', 'time'] },
  { label: 'Admin', path: '/dashboard/admin', icon: ShieldCheck, superAdminOnly: true },
  { label: 'Admin · Usuários', path: '/dashboard/admin/users', icon: UsersRound, superAdminOnly: true },
  { label: 'Admin · Limites de Uso', path: '/dashboard/admin/usage-limits', icon: GaugeCircle, superAdminOnly: true },
];

type ContactRow = {
  id: string;
  name: string | null;
  phone: string;
  last_interaction_at: string | null;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const { tenant, tenantId } = useTenant();
  const isSuperAdmin = useIsSuperAdmin();
  const hasAgenciaRole = useHasMinRole('agencia');
  const { visibleModules } = useModules();
  const { instances } = useWhatsAppInstances();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Reset on close.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Debounce search input (180ms) — used only for server-side contact lookup.
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 180);
    return () => window.clearTimeout(handle);
  }, [search]);

  // Premium gate replicates ModuleGuard logic so the palette only shows pages
  // the user can actually open.
  const hasPremiumAccess = useMemo(() => {
    if (!tenant) return false;
    const isPro = tenant.plan_type === 'pro' && tenant.subscription_status === 'active';
    const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const isTrial = tenant.status === 'trial' && (!trialEnds || trialEnds > new Date());
    const hasManualAccess = tenant.manual_access_granted === true;
    return isPro || isTrial || hasManualAccess;
  }, [tenant]);

  const accessiblePages = useMemo(() => {
    const enabledModuleNames = new Set(
      (visibleModules ?? [])
        .filter((m) => m.is_enabled)
        .map((m) => m.module_name)
    );

    return PAGES.filter((page) => {
      if (page.superAdminOnly) return isSuperAdmin;
      if (isSuperAdmin) return true;

      if (page.minRole === 'agencia' && !hasAgenciaRole) return false;

      if (page.moduleName) {
        if (!enabledModuleNames.has(page.moduleName)) return false;
        if (PREMIUM_MODULES.has(page.moduleName) && !hasPremiumAccess) return false;
      }
      return true;
    });
  }, [visibleModules, isSuperAdmin, hasAgenciaRole, hasPremiumAccess]);

  // Contacts: lightweight server-side query, only runs while palette is open.
  const { data: contacts = [] } = useQuery<ContactRow[]>({
    queryKey: ['contacts', 'command-palette', tenantId, debouncedSearch],
    enabled: open && !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, name, phone, last_interaction_at')
        .eq('tenant_id', tenantId!)
        .order('last_interaction_at', { ascending: false, nullsFirst: false })
        .limit(20);

      if (debouncedSearch.length >= 2) {
        const escaped = debouncedSearch.replace(/[%_,]/g, (c) => `\\${c}`);
        query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  const handleSelect = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const handleSelectContact = (contactId: string) => {
    onOpenChange(false);
    // Sem rota dedicada de detalhe — leva à lista de contatos com filtro de id.
    navigate(`/dashboard/contacts?contact=${contactId}`);
  };

  const handleSelectInstance = (instanceId: string) => {
    onOpenChange(false);
    navigate(`/dashboard/whatsapp-numbers?instance=${instanceId}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar páginas, contatos e sessões..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Páginas">
          {accessiblePages.map((page) => {
            const Icon = page.icon;
            // cmdk filtra por value + keywords; concatenamos pra suportar busca
            // por sinônimos PT-BR (ex.: "sessoes" → "Números WhatsApp").
            const value = [page.label, ...(page.keywords ?? [])].join(' ');
            return (
              <CommandItem
                key={page.path}
                value={value}
                onSelect={() => handleSelect(page.path)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{page.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        {instances.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sessões WhatsApp">
              {instances.map((instance) => (
                <CommandItem
                  key={instance.id}
                  value={`${instance.name} ${instance.number} ${instance.instanceKey}`}
                  onSelect={() => handleSelectInstance(instance.id)}
                >
                  <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{instance.name}</span>
                    {instance.number && (
                      <span className="text-xs text-muted-foreground">
                        {instance.number} · {instance.status}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {contacts.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contatos">
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name ?? ''} ${contact.phone}`}
                  onSelect={() => handleSelectContact(contact.id)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{contact.name || contact.phone}</span>
                    {contact.name && (
                      <span className="text-xs text-muted-foreground">{contact.phone}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
};
