import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Reads Vite env vars. When both are present the app talks to a real Supabase
// project; otherwise it falls back to the in-memory LocalRepo.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseEnv = Boolean(url && key);

export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(url as string, key as string)
  : null;
