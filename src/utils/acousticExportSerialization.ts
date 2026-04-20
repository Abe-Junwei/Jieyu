import {
  serializeAcousticPanelBatchDetailCsv,
  serializeAcousticPanelBatchDetailJson,
  serializeAcousticPanelBatchDetailJsonResearch,
  serializeAcousticPanelDetailCsv,
  serializeAcousticPanelDetailJson,
  serializeAcousticPanelDetailJsonResearch,
  serializeAcousticPitchTierText,
  type AcousticPanelBatchDetail,
  type AcousticPanelDetail,
} from './acousticPanelDetail';

export type AcousticExportFormat = 'csv' | 'json' | 'json_research' | 'pitchtier';

export type AcousticExportWorkerRequest = {
  requestId: string;
  type: 'serialize';
  scope: 'single' | 'batch';
  format: AcousticExportFormat;
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[];
};

export type AcousticExportWorkerResponse = {
  requestId: string;
  ok: boolean;
  content?: string;
  error?: string;
};

/** Worker 与单测共用的序列化入口（无 DOM / 无 postMessage）。 */
export function serializeAcousticExportPayload(
  scope: 'single' | 'batch',
  format: AcousticExportFormat,
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[],
): string {
  if (scope === 'batch') {
    const items = payload as AcousticPanelBatchDetail[];
    if (format === 'pitchtier') {
      throw new Error('PitchTier export does not support batch scope');
    }
    if (format === 'csv') return serializeAcousticPanelBatchDetailCsv(items);
    if (format === 'json_research') return serializeAcousticPanelBatchDetailJsonResearch(items);
    return serializeAcousticPanelBatchDetailJson(items);
  }

  const detail = payload as AcousticPanelDetail;
  if (format === 'csv') return serializeAcousticPanelDetailCsv(detail);
  if (format === 'pitchtier') return serializeAcousticPitchTierText(detail);
  if (format === 'json_research') return serializeAcousticPanelDetailJsonResearch(detail);
  return serializeAcousticPanelDetailJson(detail);
}
