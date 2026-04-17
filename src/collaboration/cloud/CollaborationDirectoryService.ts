import type {
  CollaborationCloudDirectoryMember,
  CollaborationCloudDirectoryProject,
} from './collaborationSyncDerived';
import { getSupabaseBrowserClient, hasSupabaseBrowserClientConfig } from './collaborationSupabaseFacade';

export async function listAccessibleCloudProjects(): Promise<CollaborationCloudDirectoryProject[]> {
  if (!hasSupabaseBrowserClientConfig()) return [];
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from('projects')
    .select('id, name, visibility, updated_at, latest_revision')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    visibility: String(row.visibility ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    latestRevision: typeof row.latest_revision === 'number'
      ? row.latest_revision
      : Number(row.latest_revision) || 0,
  }));
}

export async function listCloudProjectMembers(projectId: string): Promise<CollaborationCloudDirectoryMember[]> {
  if (!hasSupabaseBrowserClientConfig()) return [];
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from('project_members')
    .select('user_id, role, joined_at, disabled_at')
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id ?? ''),
    role: String(row.role ?? ''),
    joinedAt: String(row.joined_at ?? ''),
    disabledAt: row.disabled_at == null ? null : String(row.disabled_at),
  }));
}
