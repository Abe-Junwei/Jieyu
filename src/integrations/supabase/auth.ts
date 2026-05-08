import type { Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './client';

async function getSupabaseSession(): Promise<Session | null> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getSupabaseUserId(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.user?.id ?? null;
}
