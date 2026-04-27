/**
 * 转写域服务转发 — 供 `src/pages/*` 使用（M3：页面不直连 `../services`）。
 * Transcription-domain service re-exports for pages.
 */

export { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
export {
  getTrackEntityState,
  loadTrackEntityStateMapFromDb,
  saveTrackEntityStateToDb,
  upsertTrackEntityState,
} from '../services/TrackEntityStore';
export { AcousticAnalysisService } from '../services/acoustic/AcousticAnalysisService';
export { vadCache } from '../services/vad/VadCacheService';
export {
  getUnitDocProjectionById,
  restoreLayerSegmentGraphSnapshot,
  snapshotLayerSegmentGraphByLayerIds,
} from '../services/LayerSegmentGraphService';
export { LayerUnitService } from '../services/LayerUnitService';
export { snapToZeroCrossing } from '../services/AudioAnalysisService';
export { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';
export { saveTierDefinition } from '../services/LinguisticService.tiers';
