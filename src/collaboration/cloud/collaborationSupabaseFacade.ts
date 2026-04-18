/**
 * Single re-export surface so React hooks avoid direct `integrations/supabase` imports
 * (enforced by architecture-guard).
 */
export { getSupabaseBrowserClient, hasSupabaseBrowserClientConfig } from '../../integrations/supabase/client';
export { getSupabaseUserId } from '../../integrations/supabase/auth';
