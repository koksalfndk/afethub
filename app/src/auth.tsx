import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, hasSupabaseEnv } from './data/supabaseClient';
import type { Profile, UserRole } from './types';

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
  openModal: () => void;
  closeModal: () => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, fullName: string) => Promise<'ok' | 'confirm' | 'error'>;
  signOut: () => Promise<void>;
  resendVerification: () => Promise<boolean>;
  setAvatar: (url: string) => Promise<void>;
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
  const { data } = await supabase.from('profiles').select('id, full_name, role, avatar_url').eq('id', userId).maybeSingle();
  if (!data) return null;
  return { id: String(data.id), fullName: String(data.full_name ?? ''), role: (data.role as UserRole) ?? 'volunteer', avatarUrl: data.avatar_url ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const enabled = hasSupabaseEnv;
  const [ready, setReady] = useState(!enabled);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { void apply(session); });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const api: AuthApi = useMemo(() => ({
    enabled, ready, user, profile,
    isCoordinator: profile?.role === 'coordinator' || profile?.role === 'admin',
    emailVerified: !!user?.email_confirmed_at,
    working, error,
    modalOpen,
    openModal: () => { setError(''); setModalOpen(true); },
    closeModal: () => setModalOpen(false),
    clearError: () => setError(''),
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
    setAvatar: async (url) => {
      if (!supabase || !user) return;
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
    },
  }), [enabled, ready, user, profile, working, error, modalOpen]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
