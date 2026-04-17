import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseBrowserClientConfig {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;

export function resolveSupabaseBrowserClientConfig(
  env: ImportMetaEnv = import.meta.env,
): SupabaseBrowserClientConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function hasSupabaseBrowserClientConfig(env: ImportMetaEnv = import.meta.env): boolean {
  return resolveSupabaseBrowserClientConfig(env) !== null;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const config = resolveSupabaseBrowserClientConfig();
  if (!config) {
    throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }

  cachedClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

export function resetSupabaseBrowserClientForTest(): void {
  cachedClient = null;
}
