import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, UserRole } from '@/types/userHierarchy';

const VARIANTS: Record<UserRole, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  superadmin: 'destructive',
  account_manager: 'default',
  enterprise: 'secondary',
  user: 'outline',
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={VARIANTS[role]}>{ROLE_LABELS[role]}</Badge>;
}
