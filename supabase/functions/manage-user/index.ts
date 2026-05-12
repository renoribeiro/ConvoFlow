// =============================================================================
// manage-user — Edge function para CRUD hierárquico de usuários
// =============================================================================
// Substitui/estende `admin-create-user`. Ações suportadas:
//   create           — convida novo usuário (inviteUserByEmail) com metadata
//                      que o trigger handle_new_user usa para popular profile.
//   update           — atualiza campos editáveis do profile (nome, telefone, ...).
//   suspend          — UPDATE status='suspended' (e cascade nos descendentes).
//   reactivate       — UPDATE status='active'.
//   reset_password   — gera link de recuperação via auth.admin.
//   soft_delete      — UPDATE status='deleted' (mantém histórico/comissões).
//   transfer         — move parent_id (somente superadmin).
//
// Autorização: o caller precisa ter `can_manage_profile(target)` true para
// agir sobre target. Para `create`, regras específicas por role do caller.
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildCorsHeaders,
  SecureError,
  createErrorResponse,
  DataSanitizer,
} from '../_shared/validation.ts';

type Action =
  | 'create'
  | 'update'
  | 'suspend'
  | 'reactivate'
  | 'reset_password'
  | 'soft_delete'
  | 'transfer';

type UserRole = 'superadmin' | 'account_manager' | 'enterprise' | 'user';

interface CallerProfile {
  id: string;
  user_id: string;
  role: UserRole;
  tenant_id: string | null;
  status: string;
}

interface RequestPayload {
  action: Action;
  // create
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  tenantId?: string | null;
  parentId?: string | null;
  affiliateId?: string | null;
  redirectTo?: string;
  // target-bound actions
  targetProfileId?: string;
  // update
  patch?: Record<string, unknown>;
  // transfer
  newParentId?: string;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function getCaller(
  admin: SupabaseClient,
  token: string,
): Promise<CallerProfile> {
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) {
    throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  }
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  }
  if (profile.status !== 'active') {
    throw new SecureError('Conta suspensa ou inativa', 'INACTIVE', 403);
  }
  return profile as CallerProfile;
}

function ensureCanCreate(caller: CallerProfile, role: UserRole): void {
  if (caller.role === 'superadmin') return;
  if (caller.role === 'account_manager' && role === 'enterprise') return;
  if (caller.role === 'enterprise' && role === 'user') return;
  throw new SecureError(
    `Role ${caller.role} não pode criar role ${role}`,
    'FORBIDDEN',
    403,
  );
}

async function ensureCanManage(
  admin: SupabaseClient,
  caller: CallerProfile,
  targetId: string,
): Promise<void> {
  if (caller.id === targetId) {
    throw new SecureError(
      'Não é possível executar esta ação sobre o próprio perfil',
      'FORBIDDEN',
      403,
    );
  }
  const { data, error } = await admin.rpc('can_manage_profile', {
    target_id: targetId,
  });
  if (error || data !== true) {
    throw new SecureError('Sem permissão sobre este perfil', 'FORBIDDEN', 403);
  }
}

async function fetchTarget(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, parent_id, status')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    throw new SecureError('Profile alvo não encontrado', 'NOT_FOUND', 404);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function actionCreate(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  const {
    email,
    firstName,
    lastName,
    phone,
    role,
    tenantId,
    parentId,
    affiliateId,
    redirectTo,
  } = body;

  if (!email || !firstName || !lastName) {
    throw new SecureError(
      'email, firstName e lastName são obrigatórios',
      'VALIDATION_ERROR',
      400,
    );
  }
  const effectiveRole: UserRole = role ?? 'user';
  ensureCanCreate(caller, effectiveRole);

  // Decidir tenant_id e parent_id implícitos por role do caller
  let resolvedTenantId: string | null = tenantId ?? null;
  let resolvedParentId: string | null = parentId ?? null;

  if (caller.role === 'account_manager') {
    resolvedParentId = caller.id;
    // enterprise novo precisa de tenant_id explicitamente fornecido pelo caller
    if (effectiveRole === 'enterprise' && !resolvedTenantId) {
      throw new SecureError(
        'tenantId é obrigatório para criar um enterprise',
        'VALIDATION_ERROR',
        400,
      );
    }
  } else if (caller.role === 'enterprise') {
    if (!caller.tenant_id) {
      throw new SecureError(
        'Enterprise sem tenant_id não pode criar usuários',
        'FORBIDDEN',
        403,
      );
    }
    resolvedTenantId = caller.tenant_id;
    resolvedParentId = caller.id;
  }

  if (
    (effectiveRole === 'enterprise' || effectiveRole === 'user') &&
    !resolvedTenantId
  ) {
    throw new SecureError(
      'tenantId é obrigatório para enterprise/user',
      'VALIDATION_ERROR',
      400,
    );
  }

  const { data: invite, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo || undefined,
      data: {
        first_name: firstName,
        last_name: lastName,
        phone: phone ?? null,
        role: effectiveRole,
        tenant_id: resolvedTenantId,
        parent_id: resolvedParentId,
        affiliate_id: affiliateId ?? null,
        status: 'pending',
      },
    });

  if (inviteError || !invite?.user) {
    throw new SecureError(
      `Falha ao convidar usuário: ${inviteError?.message ?? 'desconhecida'}`,
      'INVITE_FAILED',
      400,
    );
  }

  // O trigger handle_new_user já preencheu profiles a partir do metadata.
  return {
    success: true,
    user: {
      id: invite.user.id,
      email: invite.user.email,
      role: effectiveRole,
      tenantId: resolvedTenantId,
      parentId: resolvedParentId,
    },
  };
}

async function actionUpdate(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);

  const patch = body.patch ?? {};
  // Campos editáveis controlados — qualquer outra chave é ignorada.
  const allowed: Record<string, unknown> = {};
  for (const k of ['first_name', 'last_name', 'phone', 'avatar_url']) {
    if (k in patch) allowed[k] = patch[k];
  }
  // role só superadmin pode alterar
  if ('role' in patch) {
    if (caller.role !== 'superadmin') {
      throw new SecureError('Apenas superadmin pode mudar role', 'FORBIDDEN', 403);
    }
    allowed.role = patch.role;
  }
  if ('tenant_id' in patch) {
    if (caller.role !== 'superadmin') {
      throw new SecureError('Apenas superadmin pode mudar tenant_id', 'FORBIDDEN', 403);
    }
    allowed.tenant_id = patch.tenant_id;
  }
  if (Object.keys(allowed).length === 0) {
    throw new SecureError('Nenhum campo válido para atualizar', 'VALIDATION_ERROR', 400);
  }

  const { error } = await admin
    .from('profiles')
    .update(allowed)
    .eq('id', body.targetProfileId);

  if (error) {
    throw new SecureError(`Falha ao atualizar profile: ${error.message}`, 'UPDATE_FAILED', 500);
  }
  return { success: true };
}

async function actionChangeStatus(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
  newStatus: 'suspended' | 'active' | 'deleted',
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);
  const target = await fetchTarget(admin, body.targetProfileId);

  // Cascade: se suspender ou deletar, propagar para descendentes (status='suspended').
  if (newStatus === 'suspended' || newStatus === 'deleted') {
    const { data: descendants, error: descErr } = await admin.rpc(
      'descendant_profile_ids',
      { root_id: target.id },
    );
    if (descErr) {
      throw new SecureError(
        `Falha ao calcular descendentes: ${descErr.message}`,
        'CASCADE_FAILED',
        500,
      );
    }
    const ids = (descendants as Array<{ id: string }> | string[] | null) ?? [];
    const idList: string[] = Array.isArray(ids)
      ? (ids as Array<string | { id: string }>).map((x) =>
          typeof x === 'string' ? x : x.id,
        )
      : [];

    // Atualiza o alvo com o status pedido; cascade nos demais vira 'suspended'.
    const others = idList.filter((id) => id !== target.id);
    if (others.length > 0) {
      const { error: cascadeErr } = await admin
        .from('profiles')
        .update({ status: 'suspended' })
        .in('id', others)
        .neq('status', 'deleted');
      if (cascadeErr) {
        throw new SecureError(
          `Falha no cascade: ${cascadeErr.message}`,
          'CASCADE_FAILED',
          500,
        );
      }
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ status: newStatus })
    .eq('id', target.id);
  if (error) {
    throw new SecureError(
      `Falha ao alterar status: ${error.message}`,
      'STATUS_FAILED',
      500,
    );
  }
  return { success: true, status: newStatus };
}

async function actionResetPassword(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (!body.targetProfileId) {
    throw new SecureError('targetProfileId é obrigatório', 'VALIDATION_ERROR', 400);
  }
  await ensureCanManage(admin, caller, body.targetProfileId);
  const target = await fetchTarget(admin, body.targetProfileId);

  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(
    target.user_id,
  );
  if (getErr || !authUser?.user?.email) {
    throw new SecureError('Não foi possível obter email do usuário', 'NOT_FOUND', 404);
  }

  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: authUser.user.email,
  });
  if (linkErr) {
    throw new SecureError(
      `Falha ao gerar reset: ${linkErr.message}`,
      'RESET_FAILED',
      500,
    );
  }
  return { success: true };
}

async function actionTransfer(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: RequestPayload,
) {
  if (caller.role !== 'superadmin') {
    throw new SecureError('Apenas superadmin pode transferir', 'FORBIDDEN', 403);
  }
  if (!body.targetProfileId || !body.newParentId) {
    throw new SecureError(
      'targetProfileId e newParentId são obrigatórios',
      'VALIDATION_ERROR',
      400,
    );
  }
  const { error } = await admin
    .from('profiles')
    .update({ parent_id: body.newParentId })
    .eq('id', body.targetProfileId);
  if (error) {
    throw new SecureError(`Falha ao transferir: ${error.message}`, 'TRANSFER_FAILED', 500);
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured' }, 500, cors);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new SecureError('Authorization header ausente', 'UNAUTHORIZED', 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const caller = await getCaller(admin, token);

    const body = (await req.json()) as RequestPayload;
    if (!body?.action) {
      throw new SecureError('action é obrigatório', 'VALIDATION_ERROR', 400);
    }

    console.log(
      'manage-user',
      DataSanitizer.sanitizeForLog({ action: body.action, caller: caller.id }),
    );

    let result: unknown;
    switch (body.action) {
      case 'create':
        result = await actionCreate(admin, caller, body);
        break;
      case 'update':
        result = await actionUpdate(admin, caller, body);
        break;
      case 'suspend':
        result = await actionChangeStatus(admin, caller, body, 'suspended');
        break;
      case 'reactivate':
        result = await actionChangeStatus(admin, caller, body, 'active');
        break;
      case 'soft_delete':
        result = await actionChangeStatus(admin, caller, body, 'deleted');
        break;
      case 'reset_password':
        result = await actionResetPassword(admin, caller, body);
        break;
      case 'transfer':
        result = await actionTransfer(admin, caller, body);
        break;
      default:
        throw new SecureError(`Ação desconhecida: ${body.action}`, 'VALIDATION_ERROR', 400);
    }

    return json(result, 200, cors);
  } catch (err) {
    if (err instanceof SecureError) {
      return createErrorResponse(err);
    }
    console.error('manage-user error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
