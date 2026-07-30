// Supabase Edge Function: send-staff-invite
// ---------------------------------------------------------------------------
// Sends one of two fixed e-mails:
//   * an invite, to an address that has no account yet
//   * a notification, to an account whose role was just changed
//
// Why this is a separate function and not a call to `send-email`:
// `send-email` takes client-supplied `to`, `subject` and `html`, which makes it an open
// relay for anyone holding the public anon key (its own source says so). Nothing here
// accepts HTML. The caller sends only an address, a role and an optional organization id;
// the body is rendered below, server-side.
//
// Authorisation: the caller's own access token is forwarded to the database and
// `staff_invite_context()` is called with it. That function is `security definer` behind
// `is_admin()`, so a non-admin gets no rows back and this function refuses. No
// service-role key is used or needed.
//
// NOTE ON THE LINK: the invite URL is not a secret and carries no token. What claims the
// role is control of the mailbox, enforced by Supabase's own e-mail confirmation.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev';
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://afethub.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

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

// Everything interpolated into the HTML goes through this. The values come from our own
// database, but an organization name is ultimately visitor-submitted text and an e-mail
// client is an HTML renderer.
function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const ROLE_TR: Record<string, string> = { coordinator: 'Koordinatör', admin: 'Yönetici' };

interface Ctx {
  account_exists: boolean;
  full_name: string;
  org_name: string; org_kind: string; org_province: string; org_district: string;
  org_phone: string; org_email: string; org_website: string; org_logo: string;
}

// Logo: only a path we host. A remote URL out of the database would be a tracking pixel
// with extra steps, and mail clients load images from anywhere.
function logoUrl(logo: string): string {
  if (!logo) return '';
  if (logo.startsWith('/')) return `${APP_ORIGIN}${logo}`;
  if (logo.startsWith('upload:')) {
    return `${SUPABASE_URL}/storage/v1/object/public/organization-logos/${logo.slice('upload:'.length)}`;
  }
  return '';
}

function orgCard(c: Ctx): string {
  if (!c.org_name) return '';
  const img = logoUrl(c.org_logo);
  const place = [c.org_district, c.org_province].filter(Boolean).join(', ');
  const lines = [
    [c.org_kind, place].filter(Boolean).join(' · '),
    c.org_phone, c.org_email, c.org_website,
  ].filter(Boolean);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="margin:20px 0;border:1px solid #DDE6EF;border-radius:12px;background:#F7FAFC">
    <tr>
      <td style="padding:16px">
        <div style="font:700 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;
                    text-transform:uppercase;color:#5B7182;margin-bottom:10px">Bağlı olduğunuz kurum</div>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            ${img ? `<td valign="top" style="padding-right:12px">
              <img src="${esc(img)}" alt="" width="48" height="48"
                   style="width:48px;height:48px;object-fit:contain;border-radius:10px;
                          background:#fff;border:1px solid #DDE6EF;display:block">
            </td>` : ''}
            <td valign="top">
              <div style="font:700 16px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#102A43">
                ${esc(c.org_name)}
              </div>
              ${lines.map((l) => `<div style="font:400 13px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#5B7182">${esc(l)}</div>`).join('')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function shell(inner: string): string {
  return `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#EEF3F8">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto">
    <tr><td style="background:#fff;border:1px solid #DDE6EF;border-radius:14px;padding:28px">
      <div style="font:700 18px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#102A43;margin-bottom:4px">AfetHUB</div>
      <div style="font:400 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#5B7182;margin-bottom:20px">
        Bağımsız sivil afet koordinasyon platformu
      </div>
      ${inner}
      <div style="margin-top:24px;padding-top:14px;border-top:1px solid #EDF1F5;
                  font:400 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#8A9BA8">
        Bu e-postayı beklemiyorduysanız yapmanız gereken bir şey yok; bağlantıyı kullanmadığınız
        sürece hiçbir değişiklik olmaz.<br>
        Acil ve hayati tehlike durumlarında 112’yi arayın.
      </div>
    </td></tr>
  </table></body></html>`;
}

const btn = (href: string, label: string) => `
  <a href="${esc(href)}" style="display:inline-block;background:#102A43;color:#fff;text-decoration:none;
     border-radius:10px;padding:13px 22px;font:600 15px/1 -apple-system,Segoe UI,Roboto,sans-serif">${esc(label)}</a>`;

const p = (text: string) =>
  `<p style="font:400 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#334E68;margin:0 0 12px">${text}</p>`;

function inviteBody(email: string, role: string, c: Ctx): { subject: string; html: string } {
  const roleTr = ROLE_TR[role] ?? role;
  const link = `${APP_ORIGIN}/kayit?davet=${encodeURIComponent(email)}`;
  return {
    subject: `AfetHUB · ${roleTr} yetkisi için davet`,
    html: shell(`
      <div style="font:700 21px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#102A43;margin-bottom:14px">
        AfetHUB’a ${esc(roleTr.toLowerCase())} olarak davet edildiniz
      </div>
      ${p(`Aşağıdaki bağlantıdan <strong>${esc(email)}</strong> adresiyle hesap oluşturduğunuzda
           <strong>${esc(roleTr)}</strong> yetkiniz otomatik olarak tanımlanacak.`)}
      ${orgCard(c)}
      <div style="margin:18px 0">${btn(link, 'Hesap oluştur ve yetkiyi al')}</div>
      ${p(`Yetki, hesabı <strong>bu e-posta adresiyle</strong> açmanıza bağlı. Başka bir adresle
           kayıt olursanız yetki tanımlanmaz.`)}
      ${p(`<span style="color:#5B7182;font-size:13px">Bu bağlantı bir şifre ya da gizli anahtar değildir;
           yalnızca kayıt formunda adresinizi hazır getirir. Yetkinin tanımlanması, e-posta adresinizin
           doğrulanmasına bağlıdır.</span>`)}
    `),
  };
}

function grantedBody(email: string, role: string, c: Ctx): { subject: string; html: string } {
  const roleTr = ROLE_TR[role] ?? role;
  const who = c.full_name ? esc(c.full_name) : esc(email);
  return {
    subject: `AfetHUB · ${roleTr} yetkiniz tanımlandı`,
    html: shell(`
      <div style="font:700 21px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#102A43;margin-bottom:14px">
        ${roleTr} yetkiniz tanımlandı
      </div>
      ${p(`Merhaba ${who}, AfetHUB hesabınıza <strong>${esc(roleTr)}</strong> yetkisi tanımlandı.
           Bir sonraki girişinizde koordinasyon paneli açılacak.`)}
      ${orgCard(c)}
      <div style="margin:18px 0">${btn(`${APP_ORIGIN}/koordinasyon`, 'Koordinasyon paneline git')}</div>
      ${p(`<span style="color:#5B7182;font-size:13px">Bu yetkiyi beklemiyorduysanız bir yöneticiyle
           iletişime geçin. Yetkiler yalnızca yöneticiler tarafından verilir ve her değişiklik denetim
           kaydına yazılır.</span>`)}
    `),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not configured on the server' }, 500);
  if (!SUPABASE_URL || !ANON_KEY) return json({ error: 'Supabase env is not configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

  let body: { email?: string; role?: string; orgId?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const orgId = body.orgId ? String(body.orgId) : null;
  if (!email.includes('@') || !['coordinator', 'admin'].includes(role)) {
    return json({ error: 'Invalid email or role' }, 400);
  }

  // Authorisation + data in one call: staff_invite_context() returns rows only when the
  // caller's own token belongs to an admin.
  const ctxRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/staff_invite_context`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_email: email, p_org: orgId }),
  });
  if (!ctxRes.ok) {
    return json({ error: 'Could not read invite context', detail: await ctxRes.text() }, 502);
  }
  const rows = (await ctxRes.json()) as Ctx[];
  if (!Array.isArray(rows) || rows.length === 0) {
    // No rows means is_admin() was false. Deliberately the same shape as any other
    // refusal — no hint about whether the address exists.
    return json({ error: 'not authorized' }, 403);
  }
  const ctx = rows[0];

  const mail = ctx.account_exists ? grantedBody(email, role, ctx) : inviteBody(email, role, ctx);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: email, subject: mail.subject, html: mail.html }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: 'Resend rejected the request', detail: data }, res.status);

  return json({ ok: true, id: data.id, kind: ctx.account_exists ? 'granted' : 'invited' });
});
