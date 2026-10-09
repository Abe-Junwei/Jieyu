/**
 * JYB 里的项目 AI 记忆与历史：按项目切分（rev5 7.5；用户决定 2026-10-09）。
 * Project AI memory and history in a JYB, split per project (rev5 7.5; user decision 2026-10-09).
 *
 * 归属规则 | Ownership
 * - ai_conversations.textId；ai_messages / ai_session_memories 跟随会话
 * - project_ai_memories.projectId；ai_source_sets.projectId（或 media / layer 属于本项目）
 * - ai_tasks.targetId 是本项目或本项目里的某一行；ai_task_snapshots 跟随任务或同样看 targetId
 * - agent_artifacts 没有归属字段：不进包，记为“不属于任何项目”
 */
import type { ProjectCollections } from './projectPackageIdRemap';
import { rowsOf } from './projectPackageService';

type Row = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 项目 AI 集合里以 projectId 记录归属的集合 | Project-AI collections owned via `projectId` */
export const PROJECT_AI_PROJECT_ID_OWNED: ReadonlySet<string> = new Set([
  'project_ai_memories',
  'ai_source_sets',
]);

/**
 * 取出属于某个项目的 AI 行。`projectCollections` 是这个项目已经切好的内容，用来判定 targetId。
 * Pick the AI rows owned by a project; `projectCollections` (its content rows) resolve targetIds.
 */
export function projectAiCollectionsFor(
  full: ProjectCollections,
  projectId: string,
  projectCollections: ProjectCollections,
): ProjectCollections {
  const ownIds = new Set<string>([projectId]);
  for (const rows of Object.values(projectCollections)) {
    for (const row of rows as Row[]) {
      const id = str(row?.id);
      if (id !== null) ownIds.add(id);
    }
  }
  const conversations = rowsOf(full, 'ai_conversations').filter(
    (row) => str(row.textId) === projectId,
  );
  const conversationIds = new Set(conversations.map((row) => String(row.id)));
  const tasks = rowsOf(full, 'ai_tasks').filter((row) => {
    const target = str(row.targetId);
    return target !== null && ownIds.has(target);
  });
  const taskIds = new Set(tasks.map((row) => String(row.id)));
  const allTaskIds = new Set(rowsOf(full, 'ai_tasks').map((row) => String(row.id)));
  const out: ProjectCollections = {
    ai_conversations: conversations,
    ai_messages: rowsOf(full, 'ai_messages').filter((row) =>
      conversationIds.has(String(row.conversationId)),
    ),
    ai_session_memories: rowsOf(full, 'ai_session_memories').filter((row) =>
      conversationIds.has(String(row.conversationId)),
    ),
    project_ai_memories: rowsOf(full, 'project_ai_memories').filter(
      (row) => str(row.projectId) === projectId,
    ),
    ai_source_sets: rowsOf(full, 'ai_source_sets').filter((row) => {
      const owner = str(row.projectId);
      if (owner !== null) return owner === projectId;
      const media = str(row.mediaId);
      const layer = str(row.layerId);
      return (media !== null && ownIds.has(media)) || (layer !== null && ownIds.has(layer));
    }),
    ai_tasks: tasks,
    ai_task_snapshots: rowsOf(full, 'ai_task_snapshots').filter((row) => {
      const taskId = String(row.taskId);
      if (allTaskIds.has(taskId)) return taskIds.has(taskId);
      const target = str(row.targetId);
      return target !== null && ownIds.has(target);
    }),
  };
  for (const name of Object.keys(out)) {
    if (out[name]!.length === 0) delete out[name];
  }
  return out;
}

/** 项目 AI 行数 | Number of project AI rows */
export function countProjectAiRows(
  collections: ProjectCollections,
  aiTables: readonly string[],
): number {
  return aiTables.reduce((sum, name) => sum + rowsOf(collections, name).length, 0);
}
