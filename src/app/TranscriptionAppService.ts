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
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import { ensureVadCacheForMedia, VAD_AUTO_WARM_MAX_BYTES } from '../services/vad/VadMediaCacheService';
import type { AppServiceMeta, AppServiceResult } from './contracts';
import type { MediaItemDocType, TextDocType } from '../db';

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
  splitSegment(request: SplitSegmentRequest): Promise<AppServiceResult<{ leftId: string; rightId: string }>>;
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

export interface CreateProjectRequest {
  primaryTitle: string;
  englishFallbackTitle: string;
  primaryLanguageId: string;
  primaryOrthographyId?: string;
}

export interface ImportAudioRequest {
  textId: string;
  audioBlob: Blob;
  filename: string;
  duration: number;
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
  resolveAutoSegmentCandidates(request: ResolveAutoSegmentCandidatesRequest): Promise<Array<{ start: number; end: number }>>;
  createProject(request: CreateProjectRequest): Promise<{ textId: string }>;
  createPlaceholderMedia(request: CreatePlaceholderMediaRequest): Promise<MediaItemDocType>;
  importAudio(request: ImportAudioRequest): Promise<{ mediaId: string }>;
  updateTextTimeMapping(request: Parameters<typeof LinguisticService.updateTextTimeMapping>[0]): Promise<TextDocType>;
  previewTextTimeMapping(request: Parameters<typeof LinguisticService.previewTextTimeMapping>[0]): ReturnType<typeof LinguisticService.previewTextTimeMapping>;
  deleteProject(textId: string): Promise<void>;
  deleteAudio(mediaId: string): Promise<void>;
  deleteSegments(segmentIds: readonly string[]): Promise<void>;
  splitSegment(segmentId: string, splitTime: number): Promise<TranscriptionSplitResult>;
  mergeAdjacentSegments(keepId: string, removeId: string): Promise<TranscriptionMergeResult>;
  deleteSegment(segmentId: string): Promise<void>;
}

export interface TranscriptionAppServiceDeps {
  createProject: typeof LinguisticService.createProject;
  createPlaceholderMedia: typeof LinguisticService.createPlaceholderMedia;
  importAudio: typeof LinguisticService.importAudio;
  updateTextTimeMapping: typeof LinguisticService.updateTextTimeMapping;
  previewTextTimeMapping: typeof LinguisticService.previewTextTimeMapping;
  deleteProject: typeof LinguisticService.deleteProject;
  deleteAudio: typeof LinguisticService.deleteAudio;
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
  createProject: LinguisticService.createProject.bind(LinguisticService),
  createPlaceholderMedia: LinguisticService.createPlaceholderMedia.bind(LinguisticService),
  importAudio: LinguisticService.importAudio.bind(LinguisticService),
  updateTextTimeMapping: LinguisticService.updateTextTimeMapping.bind(LinguisticService),
  previewTextTimeMapping: LinguisticService.previewTextTimeMapping.bind(LinguisticService),
  deleteProject: LinguisticService.deleteProject.bind(LinguisticService),
  deleteAudio: LinguisticService.deleteAudio.bind(LinguisticService),
  deleteSegments: LayerSegmentationV2Service.deleteSegmentsBatch.bind(LayerSegmentationV2Service),
  splitSegment: LayerSegmentationV2Service.splitSegment.bind(LayerSegmentationV2Service),
  mergeAdjacentSegments: LayerSegmentationV2Service.mergeAdjacentSegments.bind(LayerSegmentationV2Service),
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

  return {
    async resolveAutoSegmentCandidates(request: ResolveAutoSegmentCandidatesRequest): Promise<Array<{ start: number; end: number }>> {
      const cachedEntry = await deps.ensureVadCacheForMedia({
        ...(request.mediaId !== undefined ? { mediaId: request.mediaId } : {}),
        mediaUrl: request.mediaUrl,
        ...(request.mediaBlobSize !== undefined ? { mediaBlobSize: request.mediaBlobSize } : {}),
      });
      if (cachedEntry) {
        return cachedEntry.segments;
      }

      if (request.mediaBlobSize !== undefined && request.mediaBlobSize > deps.vadAutoWarmMaxBytes) {
        return [];
      }

      if (request.mediaBlobSize === undefined && request.mediaUrl.startsWith('blob:')) {
        return [];
      }

      const audioBuffer = await deps.loadAudioBuffer(request.mediaUrl);
      return deps.detectVadSegments(audioBuffer);
    },

    async createProject(request: CreateProjectRequest): Promise<{ textId: string }> {
      return deps.createProject(request);
    },

    async createPlaceholderMedia(request: CreatePlaceholderMediaRequest): Promise<MediaItemDocType> {
      return deps.createPlaceholderMedia(request);
    },

    async importAudio(request: ImportAudioRequest): Promise<{ mediaId: string }> {
      return deps.importAudio(request);
    },

    async updateTextTimeMapping(request: Parameters<typeof LinguisticService.updateTextTimeMapping>[0]): Promise<TextDocType> {
      return deps.updateTextTimeMapping(request);
    },

    previewTextTimeMapping(request: Parameters<typeof LinguisticService.previewTextTimeMapping>[0]): ReturnType<typeof LinguisticService.previewTextTimeMapping> {
      return deps.previewTextTimeMapping(request);
    },

    async deleteProject(textId: string): Promise<void> {
      await deps.deleteProject(textId);
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
