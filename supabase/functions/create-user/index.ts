// supabase/functions/create-user/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) return json({ error: 'Missing auth token' }, 401);

    // Verify the caller by passing the JWT explicitly (required in Deno/Edge)
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) {
      return json({ error: 'Invalid token: ' + (userErr?.message ?? 'no user') }, 401);
    }

    // Use service role for admin checks + user creation
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: prof, error: profErr } = await adminClient
      .from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (profErr) return json({ error: 'Profile lookup failed: ' + profErr.message }, 500);
    if (!prof)     return json({ error: 'No profile row for this user' }, 403);
    if (prof.role !== 'admin') {
      return json({ error: `Not admin (role=${prof.role}, id=${user.id})` }, 403);
    }

    const body = await req.json();
    const action = body.action ?? 'create';

    if (action === 'create') {
      const { email, password } = body;
      if (!email || !password) return json({ error: 'Email and password required' }, 400);
      if (password.length < 8)  return json({ error: 'Password must be at least 8 characters' }, 400);

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // Profile row: signup trigger usually fires, but insert only if missing
      const { data: existing } = await adminClient
        .from('profiles').select('id').eq('id', created.user.id).maybeSingle();
      if (!existing) {
        await adminClient.from('profiles').insert({
          id: created.user.id,
          username: email.split('@')[0],
          role: 'user',
        });
      }

      return json({ ok: true, user_id: created.user.id, email });
    }

    if (action === 'delete') {
      const { user_id } = body;
      if (!user_id)             return json({ error: 'user_id required' }, 400);
      if (user_id === user.id)  return json({ error: "Can't delete yourself" }, 400);

      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return json({ error: 'Caught: ' + String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}