// Supabase Edge Function: send-email
// ---------------------------------------------------------------------------
// Sends transactional email through Resend. The RESEND_API_KEY secret lives
// ONLY here, in the function's server-side environment — it is never shipped to
// the browser. This is why the Resend call must NOT be placed in the React app.
//
//   Set secret:  supabase secrets set RESEND_API_KEY=re_your_real_key
//   (optional)   supabase secrets set RESEND_FROM="AfetHUB <bildirim@afethub.com>"
//
// NOTE: deployed with verify_jwt=false because this project uses the new
// publishable API keys (sb_publishable_*), which are not JWTs and are rejected
// by the gateway's JWT check. The function is therefore reachable by anyone
// with the public anon key.
//
// SECURITY (AfetHUB priority #3, abuse prevention): as written this is an open
// email relay. Before production, restrict it — e.g. verify the caller's
// coordinator role, and/or ignore the client-supplied `to`/`html` in favour of
// fixed server-side templates — so it cannot be used to send spam in AfetHUB's
// name.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // CORS preflight — required so the browser SPA can invoke this function.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY is not configured on the server' }, 500);
  }

  let payload: { to?: string; subject?: string; html?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { to, subject, html } = payload;
  if (!to || !subject || !html) {
    return json({ error: 'Missing required fields: to, subject, html' }, 400);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });

  const data = await res.json();
  if (!res.ok) {
    // Surface Resend's error so the caller can see e.g. unverified-domain issues.
    return json({ error: 'Resend rejected the request', detail: data }, res.status);
  }

  return json({ ok: true, id: data.id });
});
