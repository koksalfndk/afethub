// Supabase Edge Function: send-staff-invite
// ---------------------------------------------------------------------------
// Sends one of two fixed e-mails:
//   * an invite, to an address that has no account yet
//   * a notification, to an account whose role was just changed
//
// Why this is a separate function and not a call to `send-email`:
// `send-email` takes client-supplied `to`, `subject` and `html`, which makes it an open
// relay for anyone holding the public anon key (its own source says so). Nothing here
// accepts HTML. The caller sends only an address, a role, an optional organization id and
// a short plain-text note; the body is rendered below, server-side.
//
// Authorisation: the caller's own access token is forwarded to the database and
// `staff_invite_context()` is called with it. That function is `security definer` behind
// `is_admin()`, so a non-admin gets no rows back and this function refuses. No
// service-role key is used or needed.
//
// NOTE ON THE LINK: the invite URL is not a secret and carries no token. What claims the
// role is control of the mailbox, enforced by Supabase's own e-mail confirmation.
//
// Layout mirrors the "Confirm signup" template in Supabase -> Authentication -> Email
// Templates, so both messages look like the same product.

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

// Everything interpolated into the HTML goes through this. Values come from our own
// database, but an organization name is ultimately visitor-submitted text and the note is
// typed by a person — an e-mail client is an HTML renderer.
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

// Only an asset we host, and only PNG. The directory logos are WebP, which Outlook does
// not render at all, so the mail links to the PNG copies in /logos/email/. A remote URL
// out of the database would be a tracking pixel with extra steps.
function logoUrl(logo: string): string {
  const m = /^\/logos\/([A-Za-z0-9._-]+)\.webp$/.exec(logo);
  if (m) return `${APP_ORIGIN}/logos/email/${m[1]}.png`;
  if (/^\/[A-Za-z0-9._/-]+\.png$/.test(logo)) return `${APP_ORIGIN}${logo}`;
  return '';
}

const S = {
  page: 'background:#F6F8FA;padding:28px 12px;font-family:Inter,Arial,Helvetica,sans-serif;',
  card: 'max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;',
  head: 'padding:22px 28px;border-bottom:1px solid #EEF2F6;',
  body: 'padding:28px;',
  h1: 'margin:0 0 8px;font-size:22px;line-height:1.25;color:#102A43;font-weight:700;',
  p: 'margin:0 0 18px;font-size:15px;line-height:1.6;color:#486581;',
  small: 'margin:0 0 6px;font-size:13px;line-height:1.6;color:#627D98;',
  faint: 'margin:0;font-size:13px;line-height:1.6;color:#829AB1;',
  url: 'margin:0 0 18px;font-size:12.5px;line-height:1.5;color:#829AB1;word-break:break-all;',
  foot: 'padding:16px 28px;border-top:1px solid #EEF2F6;background:#F6F8FA;',
  footText: 'margin:0;font-size:12px;line-height:1.6;color:#9FB3C8;',
};

function shell(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${S.page}">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="${S.card}">
      <tr><td style="${S.head}">
        <img src="${APP_ORIGIN}/logo-email.png" alt="AfetHUB" height="50" style="height:50px;display:block;border:0;" />
      </td></tr>
      <tr><td style="${S.body}">${inner}</td></tr>
      <tr><td style="${S.foot}">
        <p style="${S.footText}">
          AfetHUB · Afet yardım koordinasyonu ·
          <a href="${APP_ORIGIN}" style="color:#627D98;text-decoration:none;">afethub.com</a><br>
          Acil ve hayati tehlike durumlarında 112’yi arayın.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const btn = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">
  <tr><td style="border-radius:10px;background:#102A43;">
    <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr>
</table>`;

function orgCard(c: Ctx): string {
  if (!c.org_name) return '';
  const img = logoUrl(c.org_logo);
  const place = [c.org_district, c.org_province].filter(Boolean).join(', ');
  const lines = [
    [c.org_kind, place].filter(Boolean).join(' · '),
    c.org_phone, c.org_email, c.org_website,
  ].filter(Boolean);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #E2E8F0;border-radius:12px;background:#F6F8FA;">
  <tr><td style="padding:16px;">
    <p style="margin:0 0 10px;font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#627D98;font-weight:700;">Bağlı olduğunuz kurum</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${img ? `<td valign="top" style="padding-right:12px;">
        <img src="${esc(img)}" alt="" width="48" style="width:48px;display:block;border:1px solid #E2E8F0;border-radius:10px;background:#FFFFFF;" />
      </td>` : ''}
      <td valign="top">
        <p style="margin:0 0 2px;font-size:16px;line-height:1.3;color:#102A43;font-weight:700;">${esc(c.org_name)}</p>
        ${lines.map((l) => `<p style="margin:0;font-size:13px;line-height:1.6;color:#627D98;">${esc(l)}</p>`).join('')}
      </td>
    </tr></table>
  </td></tr>
</table>`;
}

// The admin's own words. Escaped and capped: it is a message they chose to send, not
// markup they get to inject.
function noteBlock(note: string): string {
  const n = note.trim().slice(0, 500);
  if (!n) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-left:3px solid #102A43;background:#F6F8FA;">
  <tr><td style="padding:12px 14px;">
    <p style="margin:0 0 4px;font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#627D98;font-weight:700;">Yöneticinin notu</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#334E68;white-space:pre-wrap;">${esc(n)}</p>
  </td></tr>
</table>`;
}

function inviteBody(email: string, role: string, note: string, c: Ctx): { subject: string; html: string } {
  const roleTr = ROLE_TR[role] ?? role;
  const link = `${APP_ORIGIN}/kayit?davet=${encodeURIComponent(email)}`;
  return {
    subject: `AfetHUB · ${roleTr} yetkisi için davet`,
    html: shell(`<h1 style="${S.h1}">AfetHUB’a ${esc(roleTr.toLowerCase())} olarak davet edildiniz</h1>
<p style="${S.p}">Aşağıdaki butondan <strong style="color:#102A43;">${esc(email)}</strong> adresiyle hesap oluşturduğunuzda <strong style="color:#102A43;">${esc(roleTr)}</strong> yetkiniz otomatik olarak tanımlanacak.</p>
${noteBlock(note)}
${orgCard(c)}
${btn(link, 'Hesap oluştur ve yetkiyi al')}
<p style="${S.small}">Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:</p>
<p style="${S.url}">${esc(link)}</p>
<p style="${S.small}">Yetki, hesabı <strong style="color:#486581;">bu e-posta adresiyle</strong> açmanıza bağlı. Başka bir adresle kayıt olursanız yetki tanımlanmaz.</p>
<p style="${S.faint}">Bu bağlantı bir şifre ya da gizli anahtar değildir; yalnızca kayıt formunda adresinizi hazır getirir. Yetkinin tanımlanması, e-posta adresinizin doğrulanmasına bağlıdır. Bu e-postayı beklemiyorduysanız yapmanız gereken bir şey yok.</p>`),
  };
}

function grantedBody(email: string, role: string, note: string, c: Ctx): { subject: string; html: string } {
  const roleTr = ROLE_TR[role] ?? role;
  const who = c.full_name ? esc(c.full_name) : esc(email);
  const link = `${APP_ORIGIN}/koordinasyon`;
  return {
    subject: `AfetHUB · ${roleTr} yetkiniz tanımlandı`,
    html: shell(`<h1 style="${S.h1}">${esc(roleTr)} yetkiniz tanımlandı</h1>
<p style="${S.p}">Merhaba ${who}, AfetHUB hesabınıza <strong style="color:#102A43;">${esc(roleTr)}</strong> yetkisi tanımlandı. Bir sonraki girişinizde koordinasyon paneli açılacak.</p>
${noteBlock(note)}
${orgCard(c)}
${btn(link, 'Koordinasyon paneline git')}
<p style="${S.small}">Buton çalışmazsa bu bağlantıyı tarayıcına yapıştır:</p>
<p style="${S.url}">${esc(link)}</p>
<p style="${S.faint}">Bu yetkiyi beklemiyorduysanız bir yöneticiyle iletişime geçin. Yetkiler yalnızca yöneticiler tarafından verilir ve her değişiklik denetim kaydına yazılır.</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not configured on the server' }, 500);
  if (!SUPABASE_URL || !ANON_KEY) return json({ error: 'Supabase env is not configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Missing bearer token' }, 401);

  let body: { email?: string; role?: string; orgId?: string | null; note?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const orgId = body.orgId ? String(body.orgId) : null;
  const note = String(body.note ?? '');
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

  const mail = ctx.account_exists
    ? grantedBody(email, role, note, ctx)
    : inviteBody(email, role, note, ctx);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: email, subject: mail.subject, html: mail.html }),
  });
  const data = await res.json();
  if (!res.ok) return json({ error: 'Resend rejected the request', detail: data }, res.status);

  // `ok` means Resend ACCEPTED the message. Delivery is a separate step that can still
  // fail; the panel says "sağlayıcıya iletildi" for exactly this reason.
  return json({ ok: true, id: data.id, kind: ctx.account_exists ? 'granted' : 'invited' });
});
