/**
 * PR-20: A2A 协议数据结构预留
 *
 * 当前仅类型定义 + 空检查，无 runtime 实现。
 * 用于未来评估 Supabase 协作云与 A2A 任务生命周期的映射可行性。
 */

interface A2aAgentRole {
  roleId: string;
  displayName: string;
  capabilities: readonly string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

interface A2aTaskReservation {
  taskId: string;
  agentRoleId: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

/** Reserved field in VerticalWorkflowRegistry for future A2A mapping. */
export interface A2aSchemaReservation {
  agentRoles: readonly A2aAgentRole[];
  taskReservations: readonly A2aTaskReservation[];
}

/**
 * Verify that the A2A reservation fields exist and are well-typed.
 * Returns true if the reservation structure is intact.
 */
export function verifyA2aSchemaReservation(reservation: A2aSchemaReservation): boolean {
  if (!reservation) return false;
  if (!Array.isArray(reservation.agentRoles)) return false;
  if (!Array.isArray(reservation.taskReservations)) return false;
  for (const role of reservation.agentRoles) {
    if (typeof role.roleId !== 'string' || role.roleId.length === 0) return false;
    if (typeof role.displayName !== 'string') return false;
    if (!Array.isArray(role.capabilities)) return false;
  }
  for (const task of reservation.taskReservations) {
    if (typeof task.taskId !== 'string' || task.taskId.length === 0) return false;
    if (typeof task.agentRoleId !== 'string') return false;
    if (!['pending', 'assigned', 'running', 'completed', 'failed'].includes(task.status)) return false;
  }
  return true;
}
