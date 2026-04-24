/**
 * Single re-export surface so React hooks avoid direct `integrations/supabase` imports
 * (enforced by architecture-guard).
 */
export {
  getSupabaseBrowserClient,
  getSupabaseBrowserClientHealth,
  hasSupabaseBrowserClientConfig,
  resetSupabaseBrowserClientForTest,
  resetSupabaseBrowserClientForTests,
} from '../../integrations/supabase/client';
export { getSupabaseUserId } from '../../integrations/supabase/auth';
export type { SupabaseBrowserClientHealth } from '../../integrations/supabase/client';
