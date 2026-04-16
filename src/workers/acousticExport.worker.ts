import { serializeAcousticPanelBatchDetailCsv, serializeAcousticPanelBatchDetailJson, serializeAcousticPanelBatchDetailJsonResearch, serializeAcousticPanelDetailCsv, serializeAcousticPanelDetailJson, serializeAcousticPanelDetailJsonResearch, serializeAcousticPitchTierText, type AcousticPanelBatchDetail, type AcousticPanelDetail } from '../utils/acousticPanelDetail';

type AcousticExportFormat = 'csv' | 'json' | 'json_research' | 'pitchtier';

type AcousticExportWorkerRequest = {
  requestId: string;
  type: 'serialize';
  scope: 'single' | 'batch';
  format: AcousticExportFormat;
  payload: AcousticPanelDetail | AcousticPanelBatchDetail[];
};

type AcousticExportWorkerResponse = {
  requestId: string;
  ok: boolean;
  content?: string;
  error?: string;
};

function serialize(
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

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AcousticExportWorkerRequest>) => void) | null;
  postMessage: (message: AcousticExportWorkerResponse) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  if (!request || request.type !== 'serialize') {
    return;
  }

  try {
    const content = serialize(request.scope, request.format, request.payload);
    workerScope.postMessage({
      requestId: request.requestId,
      ok: true,
      content,
    });
  } catch (error) {
    workerScope.postMessage({
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
