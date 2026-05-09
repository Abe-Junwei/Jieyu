import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface SupabaseBrowserClientConfig {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;

function resolveSupabaseBrowserClientConfig(
  env: ImportMetaEnv = import.meta.env,
): SupabaseBrowserClientConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url === undefined || url.length === 0 || anonKey === undefined || anonKey.length === 0)
    return null;
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

export type SupabaseBrowserClientHealth =
  | { ok: true; kind: 'not_configured' }
  | { ok: true; kind: 'client_ready'; hasCachedClient: boolean };

/** 轻量、无网络，用于 UI / 调试 / 集成诊断（ARCH-4）。| Non-network, for UI and diagnostics. */
export function getSupabaseBrowserClientHealth(
  env: ImportMetaEnv = import.meta.env,
): SupabaseBrowserClientHealth {
  if (!hasSupabaseBrowserClientConfig(env)) {
    return { ok: true, kind: 'not_configured' };
  }
  return { ok: true, kind: 'client_ready', hasCachedClient: cachedClient != null };
}
