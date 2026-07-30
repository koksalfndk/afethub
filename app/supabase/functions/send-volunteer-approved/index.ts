// Supabase Edge Function: send-volunteer-approved
// ---------------------------------------------------------------------------
// One fixed e-mail: "your volunteer application was approved", with the application's
// reference number, what was approved, and — carefully — what approval does and does not
// mean.
//
// Authorisation: the caller's own access token is forwarded to the database and
// `volunteer_approval_context()` is called with it. That function is SECURITY DEFINER
// behind is_coordinator(), so a visitor's token gets no rows and no mail is sent. The
// recipient address is read from the row, never taken from the request, and the row is
// marked on the way out so one approval yields one e-mail. No service-role key is used
// or needed (rules/03 §Secrets).
//
// Nothing about the message comes from the caller: not the address, not the subject, not
// a line of HTML. The only free text is the coordinator's own review note, escaped and
// capped below.
//
// Deploy: supabase functions deploy send-volunteer-approved   (verify_jwt = true)

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

function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface Ctx {
  email: string;
  full_name: string;
  code: string;
  disaster_name: string;
  province: string;
  district: string;
  skills: string[];
  availability: string;
  review_note: string;
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

function summary(c: Ctx): string {
  const place = [c.district, c.province].filter(Boolean).join(', ');
  const rows: [string, string][] = ([
    ['Başvuru no', c.code],
    ['Operasyon', c.disaster_name || 'Genel gönüllü havuzu'],
    ['Konum', place],
    ['Destek alanları', (c.skills ?? []).join(', ')],
    ['Uygunluk', c.availability],
  ] as [string, string][]).filter(([, v]) => String(v ?? '').trim() !== '');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #E2E8F0;border-radius:12px;background:#F6F8FA;">
  <tr><td style="padding:16px 18px;">
    <p style="${S.eyebrow}">Onaylanan başvurunuz</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows.map(([k, v]) => `<tr>
        <td valign="top" style="padding:4px 12px 4px 0;font-size:13px;line-height:1.6;color:#829AB1;white-space:nowrap;">${esc(k)}</td>
        <td valign="top" style="padding:4px 0;font-size:13.5px;line-height:1.6;color:#102A43;font-weight:600;">${esc(v)}</td>
      </tr>`).join('')}
    </table>
  </td></tr>
</table>`;
}

// The coordinator's own words, if they left any. Escaped and capped: it is a message
// they chose to send, not markup they get to inject.
function noteBlock(note: string): string {
  const n = (note ?? '').trim().slice(0, 500);
  if (!n) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-left:3px solid #102A43;background:#F6F8FA;">
  <tr><td style="padding:14px 16px;">
    <p style="${S.eyebrow}">Koordinatör notu</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#334E68;white-space:pre-wrap;">${esc(n)}</p>
  </td></tr>
</table>`;
}

// The same four steps as the receipt, with the first two behind us. Repeating the whole
// picture is deliberate: this may be the only AfetHUB e-mail the person still has.
const STEPS: { title: string; body: string; done: boolean }[] = [
  { title: 'Başvurunuz alındı', body: 'Kaydınız koordinasyon ekibine ulaştı.', done: true },
  { title: 'Koordinatör incelemesi', body: 'Başvurunuz bir koordinatör tarafından incelendi.', done: true },
  {
    title: 'Onaylandı',
    body: 'Onay, “ihtiyaç oluştuğunda size ulaşabiliriz” demektir. Görev ataması değildir ve sizi şu an bir yere gitmeye çağırmaz.',
    done: true,
  },
  {
    title: 'İhtiyaç oluştuğunda iletişim',
    body: 'Bölgenizde ve becerinizle eşleşen bir ihtiyaç çıktığında bıraktığınız telefondan veya e-postadan aranırsınız. Ne zaman olacağı ihtiyaca bağlıdır; bir tarih veremiyoruz.',
    done: false,
  },
];

function steps(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
  <tr><td style="padding:0 0 10px;"><p style="${S.eyebrow}">Süreç nerede?</p></td></tr>
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

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ ok: false, error: 'no-token' }, 401);

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

  // The caller's own token — this is the authorisation check.
  const ctxRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/volunteer_approval_context`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_app: applicationId }),
  });
  if (ctxRes.status === 401 || ctxRes.status === 403) {
    return json({ ok: false, error: 'not-authorized' }, 403);
  }
  if (!ctxRes.ok) {
    const detail = await ctxRes.text().catch(() => '');
    // A non-coordinator trips the raise inside the function, which surfaces as 400.
    if (detail.includes('not authorized')) return json({ ok: false, error: 'not-authorized' }, 403);
    return json({ ok: false, error: `context-failed:${ctxRes.status}` }, 502);
  }
  const rows = (await ctxRes.json()) as Ctx[];
  const c = Array.isArray(rows) ? rows[0] : null;
  // Not approved, already mailed, or no address: nothing to do, and not an error the
  // panel should shout about.
  if (!c || !c.email) return json({ ok: true, skipped: true });

  const html = shell(`
    <h1 style="${S.h1}">Gönüllü başvurunuz onaylandı</h1>
    <p style="${S.p}">
      Merhaba ${esc(c.full_name || 'gönüllü')}, ${esc(c.code)} numaralı gönüllü başvurunuz bir koordinatör
      tarafından incelendi ve onaylandı. Teşekkür ederiz.
    </p>
    ${summary(c)}
    ${noteBlock(c.review_note)}
    ${steps()}
    ${btn(`${APP_ORIGIN}/gonullu`, 'Başvurumu görüntüle')}
    <p style="${S.faint}">
      Bilgileriniz değiştiyse veya artık uygun değilseniz, aynı e-posta ile giriş yapıp başvurunuzu
      geri çekebilirsiniz. Onaylanmış bir başvuru düzenlenemez. Bilgileriniz herkese açık hiçbir
      sayfada görünmez; yalnızca koordinatörler görebilir.
    </p>
  `);

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [c.email],
      subject: 'Gönüllü başvurunuz onaylandı · AfetHUB',
      html,
    }),
  });
  const out = await send.json().catch(() => ({}));
  if (!send.ok) {
    // The approval itself is already recorded; a failed e-mail must never read as a
    // failed approval.
    return json({ ok: false, error: out?.message ?? `resend-${send.status}` }, 502);
  }
  return json({ ok: true, id: out?.id ?? '' });
});
