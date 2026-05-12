import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRole } from '@/contexts/TenantContext';
import { useInviteUser } from '@/hooks/users/useManageUser';
import { ROLE_LABELS, UserRole } from '@/types/userHierarchy';

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Tenant a vincular (obrigatório se role escolhida ≠ superadmin/account_manager). */
  defaultTenantId?: string | null;
}

/**
 * Decide quais roles o usuário atual pode convidar:
 *   superadmin       → todas (incluindo superadmin)
 *   account_manager  → enterprise apenas
 *   enterprise       → user apenas
 *   user             → nenhuma (modal não deve abrir)
 */
function allowedRolesFor(callerRole: UserRole | null): UserRole[] {
  switch (callerRole) {
    case 'superadmin':
      return ['superadmin', 'account_manager', 'enterprise', 'user'];
    case 'account_manager':
      return ['enterprise'];
    case 'enterprise':
      return ['user'];
    default:
      return [];
  }
}

export function InviteUserModal({
  open,
  onOpenChange,
  defaultTenantId,
}: InviteUserModalProps) {
  const callerRole = useRole();
  const allowed = allowedRolesFor(callerRole);
  const invite = useInviteUser();

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(allowed[0] ?? 'user');
  const [tenantId, setTenantId] = useState(defaultTenantId ?? '');

  const requiresTenant = role === 'enterprise' || role === 'user';

  const reset = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setPhone('');
    setTenantId(defaultTenantId ?? '');
  };

  const handleSubmit = async () => {
    await invite.mutateAsync({
      email,
      firstName,
      lastName,
      phone: phone || undefined,
      role,
      tenantId: tenantId || null,
      redirectTo: `${window.location.origin}/dashboard`,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Convidar novo usuário</DialogTitle>
          <DialogDescription>
            Um e-mail de convite será enviado. O usuário define a senha ao acessar pela primeira vez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invite-firstName">Nome</Label>
              <Input
                id="invite-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="invite-lastName">Sobrenome</Label>
              <Input
                id="invite-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="invite-phone">Telefone (opcional)</Label>
            <Input
              id="invite-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="invite-role">Função</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowed.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {requiresTenant && (
            <div>
              <Label htmlFor="invite-tenantId">Tenant ID</Label>
              <Input
                id="invite-tenantId"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="UUID do tenant"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Obrigatório para enterprise/user.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              invite.isPending ||
              !email ||
              !firstName ||
              !lastName ||
              (requiresTenant && !tenantId)
            }
          >
            {invite.isPending ? 'Enviando...' : 'Enviar convite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
