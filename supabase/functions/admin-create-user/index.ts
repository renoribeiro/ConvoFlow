// =============================================================================
// admin-create-user — SHIM de retrocompatibilidade
// =============================================================================
// Esta função foi substituída por `manage-user`. Continua disponível por 1
// release para o frontend antigo. Aqui traduzimos o payload legado e
// reencaminhamos para manage-user via fetch interno.
//
// Mapeamentos:
//   POST   { email, firstName, lastName, phone, role, isActive, tenantId, redirectTo }
//                 ->  manage-user action='create' (role legado é convertido)
//   DELETE { userId }
//                 ->  manage-user action='soft_delete' (não apaga auth.users)
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from '../_shared/validation.ts';

type LegacyRole = 'super_admin' | 'tenant_admin' | 'tenant_user' | 'user' | string;
type NewRole = 'superadmin' | 'account_manager' | 'enterprise' | 'user';

function mapRole(legacy: LegacyRole | undefined | null): NewRole {
  switch (legacy) {
    case 'super_admin':
    case 'superadmin':
      return 'superadmin';
    case 'tenant_admin':
    case 'enterprise':
      return 'enterprise';
    case 'account_manager':
      return 'account_manager';
    case 'tenant_user':
    case 'user':
    default:
      return 'user';
  }
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server misconfigured' }, 500, cors);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing authorization header' }, 401, cors);
  }

  const manageUserUrl = `${supabaseUrl}/functions/v1/manage-user`;

  try {
    if (req.method === 'DELETE') {
      // Legado deletava auth.users + profiles direto. Agora viramos soft_delete.
      // Como o legado passava `userId` (auth.users.id), precisamos resolver
      // profile.id correspondente.
      const { userId } = await req.json();
      if (!userId) return json({ error: 'userId é obrigatório' }, 400, cors);

      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (profileErr || !profile) {
        return json({ error: 'Profile não encontrado' }, 404, cors);
      }

      const upstream = await fetch(manageUserUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'soft_delete',
          targetProfileId: profile.id,
        }),
      });
      const data = await upstream.json();
      return json(data, upstream.status, cors);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    const body = await req.json();
    const upstream = await fetch(manageUserUrl, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create',
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        role: mapRole(body.role),
        tenantId: body.tenantId,
        redirectTo: body.redirectTo,
      }),
    });
    const data = await upstream.json();
    return json(data, upstream.status, cors);
  } catch (err) {
    console.error('admin-create-user shim error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      500,
      cors,
    );
  }
});
