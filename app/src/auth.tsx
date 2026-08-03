import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EmailOtpType, Session, User } from '@supabase/supabase-js';
import { supabase, hasSupabaseEnv } from './data/supabaseClient';
import type { Profile, ProfileInput, UserRole } from './types';
import { tr } from './i18n/strings';

export interface AuthApi {
  enabled: boolean;          // true when Supabase is configured
  ready: boolean;            // initial session check finished
  user: User | null;
  profile: Profile | null;
  isCoordinator: boolean;    // profile role is coordinator or admin
  emailVerified: boolean;    // Supabase email_confirmed_at is set
  working: boolean;
  error: string;
  modalOpen: boolean;
  modalMode: 'signIn' | 'signUp';   // which tab the modal opens on
  // True while the user is in a password-recovery session (arrived from a reset link).
  // The modal takes over with a "set a new password" view until it is cleared.
  recovery: boolean;
  // Address to pre-fill on the sign-up tab, set when someone arrives from an invite link.
  // It is a convenience only: the role is claimed by verifying the address, not by having
  // the link (see migration 0015).
  prefillEmail: string;
  openModal: (mode?: 'signIn' | 'signUp', prefillEmail?: string) => void;
  closeModal: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, fullName: string) => Promise<'ok' | 'confirm' | 'error'>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<boolean>;
  // Password reset. requestPasswordReset sends the email; updatePassword sets the new
  // one while in a recovery session; changePassword is the signed-in self-service flow
  // (re-verifies the current password first so an unattended session can't be hijacked).
  requestPasswordReset: (email: string) => Promise<boolean>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<'ok' | 'bad-current' | 'error'>;
  clearRecovery: () => void;
  setAvatar: (url: string) => Promise<void>;
  // Profile self-service. Role and membership verification are NOT writable here —
  // RLS rejects them too, so a crafted request cannot self-promote (rules/03).
  updateProfile: (input: ProfileInput) => Promise<boolean>;
  clearError: () => void;
}

const Ctx = createContext<AuthApi | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
};

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, avatar_url, phone, city, district, organization_id, org_title, org_verified')
    .eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id), fullName: String(data.full_name ?? ''),
    role: (data.role as UserRole) ?? 'volunteer', avatarUrl: data.avatar_url ?? null,
    phone: String(data.phone ?? ''), city: String(data.city ?? ''), district: String(data.district ?? ''),
    orgId: data.organization_id ? String(data.organization_id) : null,
    orgTitle: String(data.org_title ?? ''),
    // Membership verification is coordinator-set; the client only reads it.
    orgVerified: data.org_verified === true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const enabled = hasSupabaseEnv;
  const [ready, setReady] = useState(!enabled);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'signIn' | 'signUp'>('signIn');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const apply = async (session: Session | null) => {
      const u = session?.user ?? null;
      if (!active) return;
      setUser(u);
      setProfile(u ? await loadProfile(u.id) : null);
      setReady(true);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Default recovery links arrive as a URL hash and surface as this event: take
      // over the modal so the user can set a new password.
      if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setError(''); setModalMode('signIn'); setModalOpen(true); }
      void apply(session);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // Own-domain email confirmation. Our Supabase email templates point users to
  //   https://afethub.com/?token_hash=...&type=signup
  // instead of the supabase.co verify URL, so the link matches the sending domain
  // (better deliverability, no cross-domain spam flag). The token arrives here as
  // query params: exchange it for a session with verifyOtp, then strip it from the
  // URL so a refresh cannot reuse a spent token. onAuthStateChange (above) applies
  // the resulting session, so we only handle the failure case here.
  useEffect(() => {
    if (!supabase) return;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (!tokenHash || !type) return;

    void supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
      .then(({ error: e }) => {
        if (e) {
          // e.g. an expired or already-used link — surface it in the sign-in modal.
          setModalMode('signIn');
          setModalOpen(true);
          setError(e.message);
        } else if (type === 'recovery') {
          // A valid reset link (own-domain template): the session is now a recovery
          // session — open the modal so the user picks a new password.
          setRecovery(true);
          setModalMode('signIn');
          setModalOpen(true);
        }
        // Remove token_hash/type/etc. from the address bar either way.
        window.history.replaceState({}, '', window.location.pathname);
      });
  }, []);

  const api: AuthApi = useMemo(() => ({
    enabled, ready, user, profile,
    isCoordinator: profile?.role === 'coordinator' || profile?.role === 'admin',
    emailVerified: !!user?.email_confirmed_at,
    working, error,
    modalOpen, modalMode, recovery,
    prefillEmail,
    openModal: (mode, prefill) => {
      setError(''); setModalMode(mode ?? 'signIn');
      setPrefillEmail(prefill ?? ''); setModalOpen(true);
    },
    closeModal: () => { setModalOpen(false); setRecovery(false); },
    clearError: () => setError(''),
    clearRecovery: () => setRecovery(false),
    signIn: async (email, password) => {
      if (!supabase) return false;
      setWorking(true); setError('');
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setWorking(false);
      if (e) { setError(e.message); return false; }
      setModalOpen(false);
      return true;
    },
    signUp: async (email, password, fullName) => {
      if (!supabase) return 'error';
      setWorking(true); setError('');
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: redirectTo },
      });
      setWorking(false);
      if (e) { setError(e.message); return 'error'; }
      // If email confirmation is required, there is no active session yet.
      return data.session ? 'ok' : 'confirm';
    },
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
    resendVerification: async () => {
      if (!supabase || !user?.email) return false;
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error: e } = await supabase.auth.resend({ type: 'signup', email: user.email, options: { emailRedirectTo: redirectTo } });
      return !e;
    },
    requestPasswordReset: async (email) => {
      if (!supabase) return false;
      setWorking(true); setError('');
      const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      setWorking(false);
      // Don't reveal whether an address is registered (anti-enumeration, rules/03):
      // only a real server fault is surfaced; the UI otherwise shows a neutral notice.
      if (e && typeof e.status === 'number' && e.status >= 500) { setError(e.message); return false; }
      return true;
    },
    updatePassword: async (newPassword) => {
      if (!supabase) return false;
      setWorking(true); setError('');
      const { error: e } = await supabase.auth.updateUser({ password: newPassword });
      setWorking(false);
      if (e) { setError(e.message); return false; }
      setRecovery(false);
      return true;
    },
    changePassword: async (current, next) => {
      if (!supabase || !user?.email) return 'error';
      setWorking(true); setError('');
      // Re-verify the current password before changing it, so an unlocked, unattended
      // session cannot have its password silently reset (rules/03).
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (e1) { setWorking(false); return 'bad-current'; }
      const { error: e2 } = await supabase.auth.updateUser({ password: next });
      setWorking(false);
      if (e2) { setError(e2.message); return 'error'; }
      return 'ok';
    },
    setAvatar: async (url) => {
      if (!supabase || !user) return;
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
    },
    updateProfile: async (input) => {
      if (!supabase || !user) return false;
      setWorking(true); setError('');
      // Only these five columns are sent. `role` and `org_verified` are absent by
      // design and RLS forbids them regardless of what the client asks for.
      const { error: e } = await supabase.from('profiles').update({
        full_name: input.fullName.trim(), phone: input.phone.trim(),
        city: input.city.trim(), district: input.district.trim(),
        organization_id: input.orgId, org_title: input.orgTitle.trim(),
      }).eq('id', user.id);
      setWorking(false);
      if (e) { setError(tr.auth.genericError); return false; }
      // A changed membership drops back to unverified: a coordinator confirmed the
      // previous organization, not this one.
      setProfile((p) => (p ? {
        ...p, fullName: input.fullName.trim(), phone: input.phone.trim(),
        city: input.city.trim(), district: input.district.trim(),
        orgId: input.orgId, orgTitle: input.orgTitle.trim(),
        orgVerified: p.orgId === input.orgId ? p.orgVerified : false,
      } : p));
      return true;
    },
  }), [enabled, ready, user, profile, working, error, modalOpen, modalMode, recovery]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
