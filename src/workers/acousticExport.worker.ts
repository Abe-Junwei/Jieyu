import { serializeAcousticExportPayload, type AcousticExportWorkerRequest, type AcousticExportWorkerResponse } from '../utils/acousticExportSerialization';

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
    const content = serializeAcousticExportPayload(request.scope, request.format, request.payload);
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
