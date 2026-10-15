/**
 * 工作台载入的提交结果。`void` 留给尚未返回该结果的测试替身。
 * Outcome of a workspace snapshot load. `void` stays for test doubles that do not report one.
 */
export type WorkspaceSnapshotLoadResult =
  | { committed: true }
  | { committed: false; reason: 'superseded' };

export type LoadTranscriptionSnapshot = (
  textId: string,
) => Promise<WorkspaceSnapshotLoadResult | void>;

export function snapshotLoadWasSuperseded(result: WorkspaceSnapshotLoadResult | void): boolean {
  return result !== undefined && result.committed === false;
}

export type LinguisticAnnotationLoadResult =
  | { applied: true }
  | { applied: false; reason: 'superseded' };
