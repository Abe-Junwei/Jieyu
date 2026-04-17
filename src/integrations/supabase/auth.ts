import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './client';

export type SupabaseAuthStateListener = (event: AuthChangeEvent, session: Session | null) => void;

function resolveEmailRedirectTo(override?: string): string | undefined {
  const candidate = override?.trim();
  if (candidate) return candidate;
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/`;
}

export async function getSupabaseSession(): Promise<Session | null> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getSupabaseUserId(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.user?.id ?? null;
}

export async function signInWithEmailOtp(email: string, redirectTo?: string): Promise<void> {
  const client = getSupabaseBrowserClient();
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    throw new Error('Email is required for OTP sign-in');
  }

  const emailRedirectTo = resolveEmailRedirectTo(redirectTo);
  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });

  if (error) throw error;
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseBrowserClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export function onSupabaseAuthStateChange(listener: SupabaseAuthStateListener): () => void {
  const client = getSupabaseBrowserClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    listener(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
