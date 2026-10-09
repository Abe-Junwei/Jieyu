/**
 * 转写域应用服务 — 页面与底层之间的编排层
 * Transcription domain application service — orchestration layer between pages and infrastructure
 *
 * 职责 | Responsibilities:
 * 1. 语段 CRUD（创建、拆分、合并、删除）的统一入口
 * 2. 转写持久化与冲突守卫
 * 3. 导入导出编排
 * 4. 时间线与选区管理
 *
 * 限制 | Constraints:
 * - 不持有 React 状态（无 useState/useEffect）
 * - 仅依赖 db 层和 services 层
 * - 页面通过 hook 调用本服务，不直接操作底层
 */
import { LinguisticService } from '../services/LinguisticService';
import type {
  ProjectRemovalMode,
  ProjectRemovalPlan,
  RemoveProjectOptions,
} from '../services/projectRemoval';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import {
  buildAutoSegmentationProvenance,
  type AutoSegmentationRun,
} from '../services/vad/autoSegmentationProvenance';
import {
  ensureVadCacheForMedia,
  VAD_AUTO_WARM_MAX_BYTES,
} from '../services/vad/VadMediaCacheService';
import type { AppServiceMeta, AppServiceResult } from './contracts';
import type { MediaItemDocType, ProvenanceEnvelope, TextDocType } from '../db';

export const TranscriptionAppServiceMeta: AppServiceMeta = {
  domain: 'transcription',
  version: 1,
} as const;

// ── 语段操作契约 | Segment operation contracts ──

export interface CreateSegmentRequest {
  textId: string;
  mediaId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  parentUnitId?: string;
  speakerId?: string;
}

export interface SplitSegmentRequest {
  segmentId: string;
  splitTime: number;
  layerId: string;
}

export interface MergeSegmentsRequest {
  segmentIds: string[];
  layerId: string;
}

export interface DeleteSegmentRequest {
  segmentId: string;
  layerId: string;
}

// ── 导入导出契约 | Import/export contracts ──

export type ExportFormat = 'json' | 'eaf' | 'textgrid' | 'flex' | 'toolbox';

export interface ExportRequest {
  textId: string;
  format: ExportFormat;
}

// ── 应用服务接口（M4 绞杀迁移逐步实现） | Application service interface (implemented incrementally during M4 strangler migration) ──

export interface ITranscriptionAppService {
  createSegment(request: CreateSegmentRequest): Promise<AppServiceResult<{ segmentId: string }>>;
  splitSegment(
    request: SplitSegmentRequest,
  ): Promise<AppServiceResult<{ leftId: string; rightId: string }>>;
  mergeSegments(request: MergeSegmentsRequest): Promise<AppServiceResult<{ mergedId: string }>>;
  deleteSegment(request: DeleteSegmentRequest): Promise<AppServiceResult>;
  exportText(request: ExportRequest): Promise<AppServiceResult<Blob>>;
}

// ── M4 首批迁移可执行契约 | M4 first-batch executable contracts ──

export interface ResolveAutoSegmentCandidatesRequest {
  mediaId?: string;
  mediaUrl: string;
  mediaBlobSize?: number;
}

export interface AutoSegmentRunResult {
  segments: Array<{ start: number; end: number }>;
  run: AutoSegmentationRun;
  /** 写入这批句段的来源记录（含参数）| Provenance (with params) for rows created from this run */
  provenance: ProvenanceEnvelope;
}

export interface CreateProjectRequest {
  primaryTitle: string;
  englishFallbackTitle: string;
  primaryLanguageId: string;
  objectLanguageIds?: readonly string[];
  workingLanguageIds?: readonly string[];
  primaryOrthographyId?: string;
}

export interface ImportAudioRequest {
  textId: string;
  audioBlob: Blob;
  filename: string;
  duration: number;
  importMode?: 'default' | 'replace' | 'add';
  replaceMediaId?: string;
  /** Relink 时 sha256 不符、用户已确认 | User confirmed a relink sha256 mismatch (rev5 T20) */
  acknowledgeContentMismatch?: boolean;
}

export interface ExpandTextLogicalDurationRequest {
  textId: string;
  minLogicalDurationSec: number;
}

export interface CreatePlaceholderMediaRequest {
  textId: string;
  duration?: number;
  filename?: string;
}

export interface TranscriptionSplitResult {
  first: { id: string };
  second: { id: string };
}

export interface TranscriptionMergeResult {
  id: string;
}

export interface ITranscriptionAppServiceGateway {
  resolveAutoSegmentCandidates(
    request: ResolveAutoSegmentCandidatesRequest,
  ): Promise<Array<{ start: number; end: number }>>;
  /** 同上，并带回生成这批候选的引擎与来源（写入来源记录）| Same, plus the engine/source for provenance */
  resolveAutoSegmentRun(
    request: ResolveAutoSegmentCandidatesRequest,
  ): Promise<AutoSegmentRunResult>;
  createProject(request: CreateProjectRequest): Promise<{ textId: string }>;
  createPlaceholderMedia(request: CreatePlaceholderMediaRequest): Promise<MediaItemDocType>;
  importAudio(request: ImportAudioRequest): Promise<{ mediaId: string }>;
  expandTextLogicalDurationToAtLeast(request: ExpandTextLogicalDurationRequest): Promise<void>;
  setTextLogicalDurationSec(request: { textId: string; logicalDurationSec: number }): Promise<void>;
  updateTextTimeMapping(
    request: Parameters<typeof LinguisticService.timeline.updateTimeMapping>[0],
  ): Promise<TextDocType>;
  previewTextTimeMapping(
    request: Parameters<typeof LinguisticService.timeline.previewTimeMapping>[0],
  ): ReturnType<typeof LinguisticService.timeline.previewTimeMapping>;
  /** 从未协作的项目删除；协作过的只从本机移除（rev5 9.1）| Delete, or remove from this device only */
  deleteProject(textId: string, options?: RemoveProjectOptions): Promise<ProjectRemovalMode>;
  /** 删除前判断方式与未同步修改数 | Removal mode and unsynced change count */
  planDeleteProject(textId: string): ProjectRemovalPlan;
  deleteAudio(mediaId: string): Promise<void>;
  deleteSegments(segmentIds: readonly string[]): Promise<void>;
  splitSegment(segmentId: string, splitTime: number): Promise<TranscriptionSplitResult>;
  mergeAdjacentSegments(keepId: string, removeId: string): Promise<TranscriptionMergeResult>;
  deleteSegment(segmentId: string): Promise<void>;
}

export interface TranscriptionAppServiceDeps {
  createProject: typeof LinguisticService.projects.create;
  createPlaceholderMedia: typeof LinguisticService.media.createPlaceholder;
  importAudio: typeof LinguisticService.media.importAudio;
  expandTextLogicalDurationToAtLeast: typeof LinguisticService.media.expandTextLogicalDurationToAtLeast;
  setTextLogicalDurationSec: typeof LinguisticService.media.setTextLogicalDurationSec;
  updateTextTimeMapping: typeof LinguisticService.timeline.updateTimeMapping;
  previewTextTimeMapping: typeof LinguisticService.timeline.previewTimeMapping;
  deleteProject: typeof LinguisticService.cleanup.deleteProject;
  deleteAudio: typeof LinguisticService.cleanup.deleteAudio;
  deleteSegments: typeof LayerSegmentationV2Service.deleteSegmentsBatch;
  splitSegment: (segmentId: string, splitTime: number) => Promise<TranscriptionSplitResult>;
  mergeAdjacentSegments: (keepId: string, removeId: string) => Promise<TranscriptionMergeResult>;
  deleteSegment: typeof LayerSegmentationV2Service.deleteSegment;
  ensureVadCacheForMedia: typeof ensureVadCacheForMedia;
  loadAudioBuffer: typeof loadAudioBuffer;
  detectVadSegments: typeof detectVadSegments;
  vadAutoWarmMaxBytes: number;
}

const defaultDeps: TranscriptionAppServiceDeps = {
  createProject: LinguisticService.projects.create.bind(LinguisticService),
  createPlaceholderMedia: LinguisticService.media.createPlaceholder.bind(LinguisticService),
  importAudio: LinguisticService.media.importAudio.bind(LinguisticService),
  expandTextLogicalDurationToAtLeast:
    LinguisticService.media.expandTextLogicalDurationToAtLeast.bind(LinguisticService),
  setTextLogicalDurationSec:
    LinguisticService.media.setTextLogicalDurationSec.bind(LinguisticService),
  updateTextTimeMapping: LinguisticService.timeline.updateTimeMapping.bind(LinguisticService),
  previewTextTimeMapping: LinguisticService.timeline.previewTimeMapping.bind(LinguisticService),
  deleteProject: LinguisticService.cleanup.deleteProject.bind(LinguisticService),
  deleteAudio: LinguisticService.cleanup.deleteAudio.bind(LinguisticService),
  deleteSegments: LayerSegmentationV2Service.deleteSegmentsBatch.bind(LayerSegmentationV2Service),
  splitSegment: LayerSegmentationV2Service.splitSegment.bind(LayerSegmentationV2Service),
  mergeAdjacentSegments: LayerSegmentationV2Service.mergeAdjacentSegments.bind(
    LayerSegmentationV2Service,
  ),
  deleteSegment: LayerSegmentationV2Service.deleteSegment.bind(LayerSegmentationV2Service),
  ensureVadCacheForMedia,
  loadAudioBuffer,
  detectVadSegments,
  vadAutoWarmMaxBytes: VAD_AUTO_WARM_MAX_BYTES,
};

export function createTranscriptionAppService(
  overrides: Partial<TranscriptionAppServiceDeps> = {},
): ITranscriptionAppServiceGateway {
  const deps: TranscriptionAppServiceDeps = {
    ...defaultDeps,
    ...overrides,
  };

  const withProvenance = (
    segments: Array<{ start: number; end: number }>,
    run: AutoSegmentationRun,
  ): AutoSegmentRunResult => ({
    segments,
    run,
    provenance: buildAutoSegmentationProvenance(run, new Date().toISOString()),
  });

  const resolveAutoSegmentRun = async (
    request: ResolveAutoSegmentCandidatesRequest,
  ): Promise<AutoSegmentRunResult> => {
    const cachedEntry = await deps.ensureVadCacheForMedia({
      ...(request.mediaId !== undefined ? { mediaId: request.mediaId } : {}),
      mediaUrl: request.mediaUrl,
      ...(request.mediaBlobSize !== undefined ? { mediaBlobSize: request.mediaBlobSize } : {}),
    });
    if (cachedEntry) {
      return withProvenance(cachedEntry.segments, { engine: cachedEntry.engine, source: 'cache' });
    }
    const freshEnergyRun: AutoSegmentationRun = { engine: 'energy', source: 'fresh' };

    if (request.mediaBlobSize !== undefined && request.mediaBlobSize > deps.vadAutoWarmMaxBytes) {
      return withProvenance([], freshEnergyRun);
    }

    if (request.mediaBlobSize === undefined && request.mediaUrl.startsWith('blob:')) {
      return withProvenance([], freshEnergyRun);
    }

    const audioBuffer = await deps.loadAudioBuffer(request.mediaUrl);
    return withProvenance(deps.detectVadSegments(audioBuffer), freshEnergyRun);
  };

  return {
    async resolveAutoSegmentCandidates(
      request: ResolveAutoSegmentCandidatesRequest,
    ): Promise<Array<{ start: number; end: number }>> {
      return (await resolveAutoSegmentRun(request)).segments;
    },

    async resolveAutoSegmentRun(
      request: ResolveAutoSegmentCandidatesRequest,
    ): Promise<AutoSegmentRunResult> {
      return resolveAutoSegmentRun(request);
    },

    async createProject(request: CreateProjectRequest): Promise<{ textId: string }> {
      return deps.createProject(request);
    },

    async createPlaceholderMedia(
      request: CreatePlaceholderMediaRequest,
    ): Promise<MediaItemDocType> {
      return deps.createPlaceholderMedia(request);
    },

    async importAudio(request: ImportAudioRequest): Promise<{ mediaId: string }> {
      return deps.importAudio(request);
    },

    async expandTextLogicalDurationToAtLeast(
      request: ExpandTextLogicalDurationRequest,
    ): Promise<void> {
      await deps.expandTextLogicalDurationToAtLeast(request);
    },

    async setTextLogicalDurationSec(request: {
      textId: string;
      logicalDurationSec: number;
    }): Promise<void> {
      await deps.setTextLogicalDurationSec(request);
    },

    async updateTextTimeMapping(
      request: Parameters<typeof LinguisticService.timeline.updateTimeMapping>[0],
    ): Promise<TextDocType> {
      return deps.updateTextTimeMapping(request);
    },

    previewTextTimeMapping(
      request: Parameters<typeof LinguisticService.timeline.previewTimeMapping>[0],
    ): ReturnType<typeof LinguisticService.timeline.previewTimeMapping> {
      return deps.previewTextTimeMapping(request);
    },

    async deleteProject(
      textId: string,
      options?: RemoveProjectOptions,
    ): Promise<ProjectRemovalMode> {
      return options === undefined
        ? deps.deleteProject(textId)
        : deps.deleteProject(textId, options);
    },

    planDeleteProject(textId: string): ProjectRemovalPlan {
      return LinguisticService.cleanup.planDeleteProject(textId);
    },

    async deleteAudio(mediaId: string): Promise<void> {
      await deps.deleteAudio(mediaId);
    },

    async deleteSegments(segmentIds: readonly string[]): Promise<void> {
      await deps.deleteSegments(segmentIds);
    },

    async splitSegment(segmentId: string, splitTime: number) {
      return deps.splitSegment(segmentId, splitTime);
    },

    async mergeAdjacentSegments(keepId: string, removeId: string) {
      return deps.mergeAdjacentSegments(keepId, removeId);
    },

    async deleteSegment(segmentId: string): Promise<void> {
      await deps.deleteSegment(segmentId);
    },
  };
}

let transcriptionAppServiceSingleton: ITranscriptionAppServiceGateway | null = null;

export function getTranscriptionAppService(): ITranscriptionAppServiceGateway {
  if (transcriptionAppServiceSingleton) return transcriptionAppServiceSingleton;
  transcriptionAppServiceSingleton = createTranscriptionAppService();
  return transcriptionAppServiceSingleton;
}

/** 页面通过应用层拿到这个错误类型（M3：页面不直连 services）| Pages reach the error via the app layer */
export { ProjectHasUnsyncedChangesError } from '../services/projectRemoval';
