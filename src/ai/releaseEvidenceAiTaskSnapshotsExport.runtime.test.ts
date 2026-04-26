// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type AiTaskDoc } from '../db';
import { completeAgentLoopCheckpointTask, persistAgentLoopCheckpointTask } from './chat/agentLoopCheckpoint';
import { WorkspaceReadModelService } from '../services/WorkspaceReadModelService';

const DEFAULT_OUTPUT_RELATIVE_PATH = 'docs/execution/audits/ai-task-snapshots-export-v1.json';
const NOW = '2026-04-27T00:00:00.000Z';

function resolveExportOutputPath(): string {
  const configured = String(process.env.RELEASE_EVIDENCE_AI_TASK_SNAPSHOTS ?? '').trim();
  if (!configured) {
    return path.join(process.cwd(), DEFAULT_OUTPUT_RELATIVE_PATH);
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function makeAiTask(input: Partial<AiTaskDoc> & Pick<AiTaskDoc, 'id' | 'taskType' | 'status'>): AiTaskDoc {
  return {
    targetId: 'release-evidence-target',
    createdAt: NOW,
    updatedAt: '2026-04-27T00:00:10.000Z',
    ...input,
  };
}

async function clearAiTaskTables(): Promise<void> {
  await Promise.all([
    db.ai_tasks.clear(),
    db.ai_task_snapshots.clear(),
  ]);
}

describe('release evidence AI task snapshots export runtime', () => {
  beforeEach(async () => {
    await db.open();
    await clearAiTaskTables();
  });

  afterEach(async () => {
    await clearAiTaskTables();
  });

  it('writes ai_task_snapshots JSON from the WorkspaceReadModelService runtime projection', async () => {
    const outputPath = resolveExportOutputPath();
    const resumableTaskId = await persistAgentLoopCheckpointTask({
      targetId: 'release-evidence-target',
      modelId: 'runtime-export-model',
      checkpoint: {
        kind: 'token_budget_warning',
        taskId: 'task-release-agent-loop-resumable',
        originalUserText: 'resume long agent loop later',
        continuationInput: '__LOCAL_TOOL_RESULT__',
        step: 2,
        estimatedRemainingTokens: 12000,
        createdAt: NOW,
      },
    });

    const doneTaskId = await persistAgentLoopCheckpointTask({
      targetId: 'release-evidence-target',
      modelId: 'runtime-export-model',
      checkpoint: {
        kind: 'token_budget_warning',
        taskId: 'task-release-agent-loop-done',
        originalUserText: 'resume and complete long agent loop',
        continuationInput: '__LOCAL_TOOL_RESULT__',
        step: 3,
        estimatedRemainingTokens: 4000,
        createdAt: NOW,
      },
    });
    await completeAgentLoopCheckpointTask(doneTaskId);

    await db.ai_tasks.put(
      makeAiTask({
        id: 'task-release-embed-failed',
        taskType: 'embed',
        status: 'failed',
        targetType: 'unit',
        modelId: 'embed-runtime-export',
        errorMessage: 'runtime export seeded failure',
        updatedAt: '2026-04-27T00:00:04.000Z',
      }),
    );

    const rows = await WorkspaceReadModelService.rebuildAiTaskSnapshots();
    expect(rows).toHaveLength(3);

    const normalizedRows = [...rows].sort((left, right) => left.taskId.localeCompare(right.taskId));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      ai_task_snapshots: normalizedRows,
    }, null, 2)}\n`, 'utf8');

    const exportedText = await readFile(outputPath, 'utf8');
    const exported = JSON.parse(exportedText) as {
      ai_task_snapshots?: Array<Record<string, unknown>>;
    };
    expect(exported.ai_task_snapshots).toHaveLength(3);

    const resumable = exported.ai_task_snapshots?.find((row) => row.taskId === 'task-release-agent-loop-resumable');
    expect(resumable).toMatchObject({
      taskId: resumableTaskId,
      taskType: 'agent_loop',
      status: 'pending',
      targetType: 'ai_chat_agent_loop',
      hasCheckpoint: true,
      resumable: true,
      handoffReason: 'token_budget_warning',
    });

    const completed = exported.ai_task_snapshots?.find((row) => row.taskId === 'task-release-agent-loop-done');
    expect(completed).toMatchObject({
      taskId: doneTaskId,
      taskType: 'agent_loop',
      status: 'done',
      targetType: 'ai_chat_agent_loop',
      hasCheckpoint: true,
      resumable: false,
    });

    const failed = exported.ai_task_snapshots?.find((row) => row.taskId === 'task-release-embed-failed');
    expect(failed).toMatchObject({
      taskType: 'embed',
      status: 'failed',
      hasError: true,
      isTerminal: true,
    });
  });
});