import { featureFlags } from '../../ai/config/featureFlags';
import { hasSupabaseBrowserClientConfig } from './collaborationSupabaseFacade';

/** Runtime kill switch + Supabase env gate for collaboration cloud surfaces. */
export function isCollaborationCloudSurfaceActive(): boolean {
  return featureFlags.collaborationCloudEnabled && hasSupabaseBrowserClientConfig();
}
