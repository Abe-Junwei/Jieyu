export type CoordinationPhase = 'research' | 'synthesis' | 'implementation' | 'verification';
export type CoordinationTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface CoordinationNotification {
  taskId: string;
  status: CoordinationTaskStatus;
  summary: string;
  phase?: CoordinationPhase;
  result?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
  };
}

export interface CoordinationValidationResult {
  ok: boolean;
  notification?: CoordinationNotification;
  reason?: 'invalid-task-id' | 'invalid-status' | 'invalid-summary' | 'invalid-phase';
}

const VALID_STATUSES = new Set<CoordinationTaskStatus>(['pending', 'running', 'completed', 'failed', 'cancelled']);
const VALID_PHASES = new Set<CoordinationPhase>(['research', 'synthesis', 'implementation', 'verification']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateCoordinationNotification(input: unknown): CoordinationValidationResult {
  if (!isRecord(input) || typeof input.taskId !== 'string' || input.taskId.trim().length === 0) {
    return { ok: false, reason: 'invalid-task-id' };
  }
  if (typeof input.status !== 'string' || !VALID_STATUSES.has(input.status as CoordinationTaskStatus)) {
    return { ok: false, reason: 'invalid-status' };
  }
  if (typeof input.summary !== 'string' || input.summary.trim().length === 0) {
    return { ok: false, reason: 'invalid-summary' };
  }
  if (input.phase !== undefined && (typeof input.phase !== 'string' || !VALID_PHASES.has(input.phase as CoordinationPhase))) {
    return { ok: false, reason: 'invalid-phase' };
  }
  return {
    ok: true,
    notification: {
      taskId: input.taskId.trim(),
      status: input.status as CoordinationTaskStatus,
      summary: input.summary.trim(),
      ...(typeof input.phase === 'string' ? { phase: input.phase as CoordinationPhase } : {}),
      ...('result' in input ? { result: input.result } : {}),
      ...(isRecord(input.usage) ? { usage: input.usage } : {}),
    },
  };
}

export function resolveCoordinationParallelPolicy(input: {
  phase: CoordinationPhase;
  includesWrite: boolean;
}): { canRunInParallel: boolean; reason: 'readonly-parallel' | 'write-serialized' | 'verification-parallel' } {
  if (input.includesWrite) return { canRunInParallel: false, reason: 'write-serialized' };
  if (input.phase === 'verification') return { canRunInParallel: true, reason: 'verification-parallel' };
  return { canRunInParallel: true, reason: 'readonly-parallel' };
}

export class CoordinationLiteSession {
  private tasks = new Map<string, CoordinationNotification>();
  private quarantined: Array<{ raw: unknown; reason: NonNullable<CoordinationValidationResult['reason']> }> = [];

  ingest(raw: unknown): CoordinationValidationResult {
    const validation = validateCoordinationNotification(raw);
    if (!validation.ok || !validation.notification) {
      this.quarantined.push({ raw, reason: validation.reason ?? 'invalid-task-id' });
      return validation;
    }
    this.tasks.set(validation.notification.taskId, validation.notification);
    return validation;
  }

  listQuarantined(): readonly { raw: unknown; reason: NonNullable<CoordinationValidationResult['reason']> }[] {
    return this.quarantined;
  }

  endSession(): { residualTaskCount: number; cancelledTaskIds: string[] } {
    const cancellable = Array.from(this.tasks.values()).filter((task) => task.status === 'pending' || task.status === 'running');
    for (const task of cancellable) {
      this.tasks.set(task.taskId, { ...task, status: 'cancelled' });
    }
    return {
      residualTaskCount: 0,
      cancelledTaskIds: cancellable.map((task) => task.taskId),
    };
  }
}
