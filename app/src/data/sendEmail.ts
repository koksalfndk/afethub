import { supabase } from './supabaseClient';

// Client-side helper for sending email. It calls the `send-email` Supabase Edge
// Function, which holds the Resend API key server-side. The key is NEVER present
// in the browser bundle — this module only forwards the message fields.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!supabase) {
    return {
      ok: false,
      error:
        'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).',
    };
  }

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: input,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.ok) {
    return { ok: false, error: data?.error ?? 'Unknown error from send-email' };
  }
  return { ok: true, id: data.id as string };
}

// ---------------------------------------------------------------------------
// Staff invite / role-change notification
// ---------------------------------------------------------------------------
// A separate function from `send-email` on purpose: this one takes no HTML. The body is
// rendered inside the Edge Function, which also re-checks that the caller is an admin
// (`staff_invite_context()` returns nothing otherwise). Passing a template from the
// browser would make the mailer an open relay in AfetHUB's name.
export type StaffInviteResult =
  | { ok: true; kind: 'granted' | 'invited' }
  | { ok: false; error: string };

export async function sendStaffInvite(
  email: string,
  role: 'coordinator' | 'admin',
  orgId: string | null,
): Promise<StaffInviteResult> {
  if (!supabase) return { ok: false, error: 'supabase-not-configured' };
  const { data, error } = await supabase.functions.invoke('send-staff-invite', {
    body: { email, role, orgId },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: String(data?.error ?? 'unknown') };
  return { ok: true, kind: data.kind === 'granted' ? 'granted' : 'invited' };
}
