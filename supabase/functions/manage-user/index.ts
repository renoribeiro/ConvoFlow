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
import { can, CAPABILITY_DENIAL_MESSAGES } from '../_shared/capabilities.ts';

type Action =
  | 'create'
  | 'update'
  | 'suspend'
  | 'reactivate'
  | 'reset_password'
  | 'soft_delete'
  | 'transfer';

type UserRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

interface CallerProfile {
  id: string;
  user_id: string;
  role: UserRole;
  tenant_id: string | null;
  status: string;
  capabilities: Record<string, unknown> | null;
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
  /**
   * Caixa "Usuário ativo" do painel. O convidado SEMPRE nasce 'pending' — ele
   * ainda precisa concluir o cadastro. Isto guarda a intenção do admin em
   * profiles.invite_intent_active; no aceite, o trigger on_auth_user_confirmed
   * promove para 'active' (marcada) ou 'suspended' (desmarcada).
   */
  isActive?: boolean;
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
    .select('id, user_id, role, tenant_id, status, capabilities')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  }
  if (profile.status !== 'active') {
    throw new SecureError(
      profile.status === 'pending'
        ? 'Complete seu cadastro para acessar o sistema.'
        : 'Sua conta foi suspensa. Entre em contato com o administrador.',
      'INACTIVE',
      403,
    );
  }
  return profile as CallerProfile;
}

/**
 * Gerenciar usuários é `store.admin` — atendente não faz. As regras finas de
 * quem-pode-sobre-quem continuam em ensureCanCreate/ensureCanManage; isto é o
 * corte grosso, escrito uma vez na matriz compartilhada.
 */
function ensureStoreAdmin(caller: CallerProfile): void {
  if (!can(caller.role, 'store.admin', caller.capabilities)) {
    throw new SecureError(CAPABILITY_DENIAL_MESSAGES['store.admin'], 'FORBIDDEN', 403);
  }
}

function ensureCanCreate(caller: CallerProfile, role: UserRole): void {
  // superadmin creates gerente accounts (and anything else); gerente invites
  // gestor/atendente into its own stores; gestor invites atendente into its store.
  if (caller.role === 'superadmin') return;
  if (caller.role === 'gerente' && (role === 'gestor' || role === 'atendente')) return;
  if (caller.role === 'gestor' && role === 'atendente') return;
  throw new SecureError(
    `Role ${caller.role} não pode criar role ${role}`,
    'FORBIDDEN',
    403,
  );
}

/**
 * Per-store membership caps: 1 gestor + up to 5 atendentes per store.
 * Pre-checked here (before inviteUserByEmail) so we never leave an orphan auth
 * user when the DB trigger `enforce_store_membership_limits` would reject.
 */
async function ensureStoreHasRoom(
  admin: SupabaseClient,
  storeTenantId: string,
  role: UserRole,
): Promise<void> {
  if (role !== 'gestor' && role !== 'atendente') return;
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', storeTenantId)
    .eq('role', role)
    .neq('status', 'deleted');
  if (error) {
    throw new SecureError(`Falha ao checar limites da loja: ${error.message}`, 'CAP_CHECK_FAILED', 500);
  }
  const cap = role === 'gestor' ? 1 : 5;
  if ((count ?? 0) >= cap) {
    throw new SecureError(
      role === 'gestor'
        ? 'Esta loja já possui um gestor.'
        : 'Esta loja já atingiu o limite de 5 atendentes.',
      'STORE_FULL',
      409,
    );
  }
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
    redirectTo,
    isActive,
  } = body;

  // Ausente = marcada. Chamadores antigos (e o auto-cadastro) não mandam o
  // campo e devem continuar produzindo usuário ativo ao aceitar o convite.
  const inviteIntentActive = isActive === undefined ? true : isActive !== false;

  if (!email || !firstName || !lastName) {
    throw new SecureError(
      'email, firstName e lastName são obrigatórios',
      'VALIDATION_ERROR',
      400,
    );
  }
  const effectiveRole: UserRole = role ?? 'atendente';
  ensureCanCreate(caller, effectiveRole);

  // Decidir tenant_id (loja) e parent_id implícitos por role do caller
  let resolvedTenantId: string | null = tenantId ?? null;
  let resolvedParentId: string | null = parentId ?? null;

  if (caller.role === 'gerente') {
    // Gerente convida gestor/atendente para UMA das suas próprias lojas.
    resolvedParentId = caller.id;
    if (!resolvedTenantId) {
      throw new SecureError(
        'tenantId (loja) é obrigatório para convidar gestor/atendente',
        'VALIDATION_ERROR',
        400,
      );
    }
    const { data: store, error: storeError } = await admin
      .from('tenants')
      .select('id, kind, parent_tenant_id')
      .eq('id', resolvedTenantId)
      .maybeSingle();
    if (storeError) {
      throw new SecureError(`Falha ao validar a loja: ${storeError.message}`, 'STORE_LOOKUP_FAILED', 500);
    }
    if (!store || store.kind !== 'store' || store.parent_tenant_id !== caller.tenant_id) {
      throw new SecureError('Esta loja não pertence à sua conta.', 'FORBIDDEN', 403);
    }
  } else if (caller.role === 'gestor') {
    // Gestor convida atendente para a PRÓPRIA loja.
    if (!caller.tenant_id) {
      throw new SecureError(
        'Gestor sem loja não pode convidar usuários',
        'FORBIDDEN',
        403,
      );
    }
    resolvedTenantId = caller.tenant_id;
    resolvedParentId = caller.id;
  }

  if (
    (effectiveRole === 'gestor' || effectiveRole === 'atendente') &&
    !resolvedTenantId
  ) {
    throw new SecureError(
      'tenantId (loja) é obrigatório para gestor/atendente',
      'VALIDATION_ERROR',
      400,
    );
  }

  // Respeita o limite da loja ANTES de convidar (evita usuário órfão no Auth).
  if (resolvedTenantId) {
    await ensureStoreHasRoom(admin, resolvedTenantId, effectiveRole);
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
        // Convidado sempre nasce 'pending': ele ainda não definiu a senha.
        // Quem decide o estado FINAL é invite_intent_active, aplicado pelo
        // trigger on_auth_user_confirmed quando o cadastro é concluído.
        status: 'pending',
        invite_intent_active: inviteIntentActive,
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
      status: 'pending',
      inviteIntentActive: inviteIntentActive,
    },
    warning: inviteIntentActive
      ? undefined
      : 'O usuário foi convidado com "Usuário ativo" desmarcado: ao concluir o cadastro ele já entrará suspenso.',
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

    // Toda ação desta função é administração de usuários da Loja.
    ensureStoreAdmin(caller);

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
