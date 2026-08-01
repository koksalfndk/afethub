// Supabase Edge Function: contact-submit
// ---------------------------------------------------------------------------
// The gate in front of the public contact form.
//
// It does two things and nothing else:
//   1. asks Cloudflare whether the Turnstile token is real;
//   2. calls submit_contact_message() and returns the new message id.
//
// Why the browser no longer calls the RPC directly: a bot check that only exists in the
// page is not a check. The token has to be verified where the secret lives, and the row
// has to be written by the same request that passed the check — otherwise the front door
// is guarded and the side door is open (rules/03 §Server-Side Authorization).
//
// About the service-role key: this is the one function that uses it, because the caller
// is anonymous by design — there is no visitor token to forward, and the whole point is
// that anon must NOT be able to write this row without passing Turnstile. The key is used
// for exactly one RPC call with the caller's own fields and nothing else. A leak of it
// would be a full-database compromise, which is why nothing else was built on top of it
// here (rules/03 §Secrets).
//
// If TURNSTILE_SECRET is not configured the function still writes the message and says
// so in the response (`turnstile: "off"`). That is deliberate: a form that silently
// refuses everyone until a secret is set is worse than one that is honest about not
// being protected yet. The response field is what makes it visible instead of assumed.
//
// Deploy: supabase functions deploy contact-submit   (verify_jwt = false)
// Secrets: SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET (optional until Cloudflare is set up)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: 'missing-supabase-env' }, 500);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }

  // ---- 1) The bot check -----------------------------------------------------
  if (TURNSTILE_SECRET) {
    const token = str(body.token, 2048);
    if (!token) return json({ ok: false, error: 'captcha-missing' }, 400);

    const form = new FormData();
    form.append('secret', TURNSTILE_SECRET);
    form.append('response', token);
    // Cloudflare's own header; it is the visitor's address as seen by the edge, not
    // anything the caller can set. Sent when present, skipped when not.
    const ip = req.headers.get('CF-Connecting-IP');
    if (ip) form.append('remoteip', ip);

    let ok = false;
    try {
      const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
      const out = await res.json().catch(() => ({}));
      ok = out?.success === true;
    } catch {
      // Cloudflare unreachable. Refuse rather than wave it through: this branch only
      // runs when the operator has turned the check ON, so failing open would quietly
      // disable the thing they switched on.
      return json({ ok: false, error: 'captcha-unavailable' }, 503);
    }
    if (!ok) return json({ ok: false, error: 'captcha-failed' }, 403);
  }

  // ---- 2) The write ---------------------------------------------------------
  // Every field is still validated and rate-limited inside the function; passing the
  // captcha does not grant an exemption from any of it.
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_contact_message`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_name: str(body.name, 200),
      p_email: str(body.email, 200),
      p_topic: str(body.topic, 40),
      p_message: str(body.message, 4000),
      p_phone: str(body.phone, 32),
      p_province: str(body.province, 60),
      p_district: str(body.district, 60),
      p_website: str(body.website, 200),
    }),
  });

  const text = await rpc.text();
  if (!rpc.ok) {
    // The RPC's own words ("rate limited", "message too short", …) are passed back so the
    // form can say something true. They contain no schema detail (rules/03 §Error Handling).
    const reason = /rate limited/.test(text) ? 'rate-limited'
      : /message too short|message too long|name required|email invalid|website invalid/.exec(text)?.[0] ?? 'submit-failed';
    return json({ ok: false, error: reason }, 400);
  }

  // PostgREST returns the scalar as a JSON string.
  const id = text.replace(/^"|"$/g, '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: 'submit-failed' }, 502);

  return json({ ok: true, id, turnstile: TURNSTILE_SECRET ? 'on' : 'off' });
});
