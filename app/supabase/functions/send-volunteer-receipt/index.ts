// Supabase Edge Function: send-volunteer-receipt
// ---------------------------------------------------------------------------
// One fixed e-mail: the receipt for a volunteer application, with what the person
// submitted, its reference number, and where the application now sits in the process.
//
// Why it can be called without a session: the volunteer form itself requires no account
// (CLAUDE.md §Primary Product Rule), so the confirmation for it cannot require one
// either. What keeps this from being a mailer for anyone who asks is that it accepts
// ONLY an application id and reads everything else — including the recipient address —
// from the database through `volunteer_receipt_context()` (migrations 0018/0019), which:
//   * answers only for an application created in the last 15 minutes,
//   * marks receipt_sent_at on the way out, so one application yields one e-mail,
//   * returns nothing at all for an id that does not exist.
// No HTML, no address and no subject come from the caller. No service-role key is used.
//
// Deploy: supabase functions deploy send-volunteer-receipt --no-verify-jwt
//
// Layout mirrors send-staff-invite and the Supabase "Confirm signup" template, so every
// message AfetHUB sends looks like the same product.

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
// database, but they are text a visitor typed — an e-mail client is an HTML renderer.
function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface Ctx {
  email: string;
  full_name: string;
  disaster_name: string;
  province: string;
  district: string;
  skills: string[];
  availability: string;
  note: string;
  phone: string;
  code: string;
  created_at: string;
}

const S = {
  page: 'background:#F6F8FA;padding:28px 12px;font-family:Inter,Arial,Helvetica,sans-serif;',
  card: 'max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;',
  head: 'padding:22px 28px;border-bottom:1px solid #EEF2F6;',
  body: 'padding:28px;',
  h1: 'margin:0 0 8px;font-size:22px;line-height:1.25;color:#102A43;font-weight:700;',
  p: 'margin:0 0 18px;font-size:15px;line-height:1.6;color:#486581;',
  faint: 'margin:0;font-size:13px;line-height:1.6;color:#829AB1;',
  foot: 'padding:16px 28px;border-top:1px solid #EEF2F6;background:#F6F8FA;',
  footText: 'margin:0;font-size:12px;line-height:1.6;color:#9FB3C8;',
  eyebrow: 'margin:0 0 10px;font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:#627D98;font-weight:700;',
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

// What the person actually submitted, read back to them. A receipt that does not repeat
// the content is not a receipt.
function summary(c: Ctx): string {
  const place = [c.district, c.province].filter(Boolean).join(', ');
  const rows: [string, string][] = ([
    ['Başvuru no', c.code],
    ['Operasyon', c.disaster_name || 'Genel gönüllü havuzu'],
    ['Ad Soyad', c.full_name],
    ['Konum', place],
    ['Destek alanları', (c.skills ?? []).join(', ')],
    ['Uygunluk', c.availability],
    ['Telefon', c.phone],
    ['Notunuz', c.note],
  ] as [string, string][]).filter(([, v]) => String(v ?? '').trim() !== '');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #E2E8F0;border-radius:12px;background:#F6F8FA;">
  <tr><td style="padding:16px 18px;">
    <p style="${S.eyebrow}">Başvurunuzun özeti</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows.map(([k, v]) => `<tr>
        <td valign="top" style="padding:4px 12px 4px 0;font-size:13px;line-height:1.6;color:#829AB1;white-space:nowrap;">${esc(k)}</td>
        <td valign="top" style="padding:4px 0;font-size:13.5px;line-height:1.6;color:#102A43;font-weight:600;">${esc(v)}</td>
      </tr>`).join('')}
    </table>
  </td></tr>
</table>`;
}

// The process, stated as steps rather than as a promise. Step 1 is done; the rest are
// what happens next, and the third one is deliberately careful — an approved
// application is not a duty assignment (rules/07 §Critical Distinctions).
const STEPS: { title: string; body: string; done: boolean }[] = [
  {
    title: 'Başvurunuz alındı',
    body: 'Kaydınız koordinasyon ekibine iletildi. Bu e-posta o kaydın makbuzudur.',
    done: true,
  },
  {
    title: 'Koordinatör incelemesi',
    body: 'Bir koordinatör başvuruyu okur. Bilgi eksikse veya bölge uygun değilse başvurunuz beklemeye alınabilir.',
    done: false,
  },
  {
    title: 'Onay',
    body: 'Onay, “ihtiyaç oluştuğunda size ulaşabiliriz” demektir. Görev ataması değildir ve sizi bir yere gitmeye çağırmaz.',
    done: false,
  },
  {
    title: 'İhtiyaç oluştuğunda iletişim',
    body: 'Bölgenizde ve becerinizle eşleşen bir ihtiyaç çıktığında bıraktığınız telefondan veya e-postadan aranırsınız.',
    done: false,
  },
];

// Numbered circles in a table, not a flex row: Outlook has no flexbox and drops
// background images. Colour is never the only signal — every step carries its number
// and its own sentence (rules/04 §Accessibility).
function steps(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
  <tr><td style="padding:0 0 10px;"><p style="${S.eyebrow}">Bundan sonra ne oluyor?</p></td></tr>
  ${STEPS.map((s, i) => {
    const bg = s.done ? '#102A43' : '#FFFFFF';
    const fg = s.done ? '#FFFFFF' : '#627D98';
    const bd = s.done ? '#102A43' : '#D9E2EC';
    return `<tr><td style="padding:0 0 ${i === STEPS.length - 1 ? 0 : 14}px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" width="34" style="width:34px;padding-right:12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="34" style="width:34px;height:34px;border:1px solid ${bd};border-radius:17px;background:${bg};">
            <tr><td align="center" valign="middle" style="height:34px;font-size:14px;font-weight:700;color:${fg};">${i + 1}</td></tr>
          </table>
        </td>
        <td valign="top">
          <p style="margin:0 0 2px;font-size:14.5px;line-height:1.4;color:#102A43;font-weight:700;">${esc(s.title)}${s.done ? ' <span style="font-size:12px;font-weight:600;color:#159947;">· tamamlandı</span>' : ''}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#627D98;">${esc(s.body)}</p>
        </td>
      </tr></table>
    </td></tr>`;
  }).join('')}
</table>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!RESEND_API_KEY) return json({ ok: false, error: 'missing-resend-key' }, 500);
  if (!SUPABASE_URL || !ANON_KEY) return json({ ok: false, error: 'missing-supabase-env' }, 500);

  let applicationId = '';
  try {
    const body = await req.json();
    applicationId = String(body?.applicationId ?? '');
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)) {
    return json({ ok: false, error: 'bad-application-id' }, 400);
  }

  // The database decides whether this application may still produce a receipt, and hands
  // back the address. Nothing here is trusted from the request beyond the id.
  const ctxRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/volunteer_receipt_context`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_app: applicationId }),
  });
  if (!ctxRes.ok) {
    return json({ ok: false, error: `context-failed:${ctxRes.status}` }, 502);
  }
  const rows = (await ctxRes.json()) as Ctx[];
  const c = Array.isArray(rows) ? rows[0] : null;
  // Already sent, too old, or unknown id — all the same answer, so this cannot be used
  // to probe which application ids exist.
  if (!c || !c.email) return json({ ok: true, skipped: true });

  const html = shell(`
    <h1 style="${S.h1}">Gönüllü başvurunuz alındı</h1>
    <p style="${S.p}">
      Merhaba ${esc(c.full_name || 'gönüllü')}, AfetHUB’a gönüllü başvurusu yaptığınız için teşekkür ederiz.
      Başvuru numaranız <strong style="color:#102A43;">${esc(c.code)}</strong>. Aşağıda başvurunuzun
      bir özetini ve sürecin nasıl ilerlediğini bulacaksınız.
    </p>
    ${summary(c)}
    ${steps()}
    ${btn(`${APP_ORIGIN}/gonullu`, 'Başvurumu görüntüle')}
    <p style="${S.faint}">
      Aynı e-posta ile giriş yaptığınızda başvurunuzu bu adresten görebilir, güncelleyebilir
      veya geri çekebilirsiniz. Onaylanmış bir başvuru düzenlenemez; yalnızca geri çekilebilir.
      Bilgileriniz herkese açık hiçbir sayfada görünmez; yalnızca koordinatörler görebilir.
    </p>
  `);

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [c.email],
      subject: 'Gönüllü başvurunuz alındı · AfetHUB',
      html,
    }),
  });
  const out = await send.json().catch(() => ({}));
  if (!send.ok) {
    // The application itself is already stored; a failed receipt must never read as a
    // failed application.
    return json({ ok: false, error: out?.message ?? `resend-${send.status}` }, 502);
  }
  return json({ ok: true, id: out?.id ?? '' });
});
