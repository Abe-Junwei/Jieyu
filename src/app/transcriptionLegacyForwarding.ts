/**
 * M4 旧入口转发层 | M4 legacy entrypoint forwarding layer
 *
 * 说明 | Notes:
 * - 仅用于绞杀迁移过渡期，统一把旧页面入口转发到 app 服务层。
 * - 计划在 2026-06-30 前移除，调用方请改用 getTranscriptionAppService()/createTranscriptionAppService()。
 */

import {
  getTranscriptionAppService,
  type CreateProjectRequest,
  type ImportAudioRequest,
  type ResolveAutoSegmentCandidatesRequest,
} from './TranscriptionAppService';

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().resolveAutoSegmentCandidates | Legacy forwarding: use getTranscriptionAppService().resolveAutoSegmentCandidates */
export async function legacyResolveAutoSegmentCandidates(request: ResolveAutoSegmentCandidatesRequest): Promise<Array<{ start: number; end: number }>> {
  return getTranscriptionAppService().resolveAutoSegmentCandidates(request);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().createProject | Legacy forwarding: use getTranscriptionAppService().createProject */
export async function legacyCreateProject(request: CreateProjectRequest): Promise<{ textId: string }> {
  return getTranscriptionAppService().createProject(request);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().importAudio | Legacy forwarding: use getTranscriptionAppService().importAudio */
export async function legacyImportAudio(request: ImportAudioRequest): Promise<{ mediaId: string }> {
  return getTranscriptionAppService().importAudio(request);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().deleteProject | Legacy forwarding: use getTranscriptionAppService().deleteProject */
export async function legacyDeleteProject(textId: string): Promise<void> {
  await getTranscriptionAppService().deleteProject(textId);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().deleteAudio | Legacy forwarding: use getTranscriptionAppService().deleteAudio */
export async function legacyDeleteAudio(mediaId: string): Promise<void> {
  await getTranscriptionAppService().deleteAudio(mediaId);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().deleteSegments | Legacy forwarding: use getTranscriptionAppService().deleteSegments */
export async function legacyDeleteSegments(segmentIds: readonly string[]): Promise<void> {
  await getTranscriptionAppService().deleteSegments(segmentIds);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().splitSegment | Legacy forwarding: use getTranscriptionAppService().splitSegment */
export async function legacySplitSegment(segmentId: string, splitTime: number) {
  return getTranscriptionAppService().splitSegment(segmentId, splitTime);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().mergeAdjacentSegments | Legacy forwarding: use getTranscriptionAppService().mergeAdjacentSegments */
export async function legacyMergeAdjacentSegments(keepId: string, removeId: string) {
  return getTranscriptionAppService().mergeAdjacentSegments(keepId, removeId);
}

/** @deprecated 旧入口转发：请改用 getTranscriptionAppService().deleteSegment | Legacy forwarding: use getTranscriptionAppService().deleteSegment */
export async function legacyDeleteSegment(segmentId: string): Promise<void> {
  await getTranscriptionAppService().deleteSegment(segmentId);
}
