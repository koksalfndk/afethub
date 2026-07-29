import type { Repo } from './repo';
import { LocalRepo } from './localRepo';
import { SupabaseRepo } from './supabaseRepo';
import { supabase } from './supabaseClient';

// Selected backend (live binding — reassigned by fallbackToLocal). Add
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env for live Supabase.
export let repo: Repo = supabase ? new SupabaseRepo(supabase) : new LocalRepo();

// If Supabase is configured but the schema/seed isn't applied yet (or the
// request fails), drop back to the in-memory seed so the UI is never empty.
export function fallbackToLocal(): Repo {
  repo = new LocalRepo();
  return repo;
}

export * from './repo';
