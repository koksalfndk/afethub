// Supabase Edge Function: send-contact
// ---------------------------------------------------------------------------
// Two fixed e-mails for one contact-form message:
//   1) the notification to the AfetHUB inbox, with the writer's address as reply-to;
//   2) the acknowledgement to the writer, quoting what they sent.
//
// The message is already in the database by the time this runs (submit_contact_message,
// migration 0025). This function only tells people about it — so a provider failure
// loses a notification, never the message.
//
// Why this is not `send-email`: that function takes `to`, `subject` and `html` from the
// caller, which makes it an open relay for anyone holding the anon key. Here the only
// input is a message id. The team address is an environment value; the writer's address
// is read from the row. Neither can be chosen by the request.
//
// Attachments are NOT mailed. The names travel; the files stay in the private bucket and
// are opened from the panel through a short-lived signed URL (migration 0026). Mailing a
// stranger's document would copy it into an inbox and a backup we do not control.
//
// Replay and amplification: contact_message_context() answers once per message and only
// within 15 minutes of it being written, and submit_contact_message() caps one address
// at 3 messages per 15 minutes. Those two together are what bound how much mail a
// stranger can make us send to a third party (rules/03 §Abuse Prevention).
//
// Every value that reaches the HTML is escaped: the message body is a stranger's text
// and an e-mail client is an HTML renderer.
//
// Deploy: supabase functions deploy send-contact   (verify_jwt = false)
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_ORIGIN, CONTACT_TO

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev';
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://afethub.com';
const CONTACT_TO = Deno.env.get('CONTACT_TO') ?? 'info@afethub.com';
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
  name: string;
  email: string;
  topic: string;
  message: string;
  phone: string;
  province: string;
  district: string;
  website: string;
  // Names and sizes only. The files themselves stay in the private bucket and are opened
  // from the panel through a signed URL — mailing them out would put a stranger's
  // document into an inbox and a backup we do not control (migration 0026).
  files: string[];
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

function btn(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
  <tr><td style="background:#D9363E;border-radius:10px;">
    <a href="${href}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`;
}

function fields(c: Ctx): string {
  const when = (() => {
    try {
      return new Date(c.created_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    } catch {
      return '';
    }
  })();
  const place = [c.district, c.province].filter((v) => String(v ?? '').trim() !== '').join(' / ');
  const rows: [string, string][] = ([
    ['Gönderen', c.name],
    ['E-posta', c.email],
    ['Telefon', c.phone],
    ['Konum', place],
    ['Web', c.website],
    ['Konu', c.topic],
    ['Tarih', when],
  ] as [string, string][]).filter(([, v]) => String(v ?? '').trim() !== '');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #E2E8F0;border-radius:12px;background:#F6F8FA;">
  <tr><td style="padding:16px 18px;">
    <p style="${S.eyebrow}">Mesaj bilgileri</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${rows.map(([k, v]) => `<tr>
        <td valign="top" style="padding:4px 12px 4px 0;font-size:13px;line-height:1.6;color:#829AB1;white-space:nowrap;">${esc(k)}</td>
        <td valign="top" style="padding:4px 0;font-size:13.5px;line-height:1.6;color:#102A43;font-weight:600;">${esc(v)}</td>
      </tr>`).join('')}
    </table>
  </td></tr>
</table>`;
}

// The writer's own words. Escaped, kept as written (white-space:pre-wrap) and capped —
// the database already limits the field to 4000 characters.
function quote(message: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-left:3px solid #102A43;background:#F6F8FA;">
  <tr><td style="padding:14px 16px;">
    <p style="${S.eyebrow}">Mesaj</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#334E68;white-space:pre-wrap;">${esc((message ?? '').slice(0, 4000))}</p>
  </td></tr>
</table>`;
}

// The list is a heads-up, not a delivery: the files are reachable only from the panel.
function attachments(files: string[]): string {
  const list = Array.isArray(files) ? files.filter(Boolean).slice(0, 5) : [];
  if (list.length === 0) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border:1px solid #E2E8F0;border-radius:12px;background:#FFFFFF;">
  <tr><td style="padding:14px 16px;">
    <p style="${S.eyebrow}">Ekler (${list.length})</p>
    ${list.map((f) => `<p style="margin:0 0 4px;font-size:13.5px;line-height:1.6;color:#334E68;">${esc(f)}</p>`).join('')}
    <p style="margin:8px 0 0;font-size:12.5px;line-height:1.6;color:#829AB1;">
      Dosyalar e-postaya eklenmedi. Panelde açabilirsiniz; herkese açık bir adresleri yok.
    </p>
  </td></tr>
</table>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method-not-allowed' }, 405);
  if (!RESEND_API_KEY) return json({ ok: false, error: 'missing-resend-key' }, 500);
  if (!SUPABASE_URL || !ANON_KEY) return json({ ok: false, error: 'missing-supabase-env' }, 500);

  let messageId = '';
  try {
    const body = await req.json();
    messageId = String(body?.messageId ?? '');
  } catch {
    return json({ ok: false, error: 'bad-json' }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
    return json({ ok: false, error: 'bad-message-id' }, 400);
  }

  const ctxRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/contact_message_context`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: messageId }),
  });
  if (!ctxRes.ok) return json({ ok: false, error: `context-failed:${ctxRes.status}` }, 502);
  const rows = (await ctxRes.json()) as Ctx[];
  const c = Array.isArray(rows) ? rows[0] : null;
  // Already notified, or older than the window: not an error the form should shout about.
  if (!c || !c.email) return json({ ok: true, skipped: true });

  const teamHtml = shell(`
    <h1 style="${S.h1}">İletişim formundan yeni mesaj</h1>
    <p style="${S.p}">
      afethub.com iletişim sayfasından bir mesaj geldi. Yanıtla dediğinizde doğrudan gönderene
      gider; mesajın kendisi panelde de duruyor.
    </p>
    ${fields(c)}
    ${quote(c.message)}
    ${attachments(c.files)}
    ${btn(`${APP_ORIGIN}/koordinasyon/iletisim`, 'Panelde aç')}
    <p style="${S.faint}">
      Bu adres bir gönderi takibi değildir. Yardım bildirimleri ve ihtiyaç talepleri kendi
      akışlarından ilerler.
    </p>
  `);

  const ackHtml = shell(`
    <h1 style="${S.h1}">Mesajınız bize ulaştı</h1>
    <p style="${S.p}">
      Merhaba ${esc(c.name)}, yazdığınız için teşekkür ederiz. Mesajınız koordinasyon ekibine
      iletildi. Aşağıda ne gönderdiğinizin bir kopyası var.
    </p>
    ${quote(c.message)}
    ${attachments(c.files)}
    <p style="${S.p}">
      Yanıtlama süresi konuya ve o anki operasyon yoğunluğuna göre değişir; bir süre
      veremiyoruz. <strong>Acil ve hayati tehlike durumlarında bu formu beklemeyin, 112’yi
      arayın.</strong>
    </p>
    ${btn(`${APP_ORIGIN}`, 'Aktif afetlere dön')}
    <p style="${S.faint}">
      Bu mesajı siz göndermediyseniz yapmanız gereken bir şey yok: adresiniz yalnızca bu
      bildirimi almak için kullanıldı, bir hesap açılmadı ve listeye eklenmediniz.
    </p>
  `);

  const send = (to: string, subject: string, html: string, replyTo?: string) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });

  // The notification is the one that matters: it is how a human finds out. The
  // acknowledgement is a courtesy, so it is sent after and its failure is reported
  // separately rather than turning the whole call into an error.
  const teamRes = await send(CONTACT_TO, `[İletişim] ${c.topic} · ${c.name}`, teamHtml, c.email);
  const teamOut = await teamRes.json().catch(() => ({}));
  if (!teamRes.ok) {
    return json({ ok: false, error: teamOut?.message ?? `resend-${teamRes.status}` }, 502);
  }

  let ackOk = false;
  try {
    const ackRes = await send(c.email, 'Mesajınız alındı · AfetHUB', ackHtml);
    ackOk = ackRes.ok;
  } catch {
    ackOk = false;
  }

  return json({ ok: true, id: teamOut?.id ?? '', ack: ackOk });
});
