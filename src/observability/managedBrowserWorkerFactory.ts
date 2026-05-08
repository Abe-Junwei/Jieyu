import { trackBrowserWorkerLifecycle, type TrackedBrowserWorkerSpec } from './trackBrowserWorkerLifecycle';

export interface ManagedBrowserWorkerFactoryInput {
  url: URL;
  options?: WorkerOptions;
  tracking: TrackedBrowserWorkerSpec;
}

export interface ManagedBrowserWorkerFactoryOutput {
  worker: Worker;
  release: () => void;
}

function resolveWorkerUrlForCsp(url: URL): { workerUrl: URL | string; release: () => void } {
  if (url.protocol !== 'data:') {
    return { workerUrl: url, release: () => {} };
  }
  if (typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') {
    return { workerUrl: url, release: () => {} };
  }

  const commaIndex = url.href.indexOf(',');
  if (commaIndex < 0) {
    return { workerUrl: url, release: () => {} };
  }

  const header = url.href.slice(0, commaIndex);
  const payload = url.href.slice(commaIndex + 1);
  const isBase64 = /;base64$/i.test(header);

  try {
    const blob = isBase64
      ? (() => {
          const binary = atob(payload);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          return new Blob([bytes], { type: 'text/javascript' });
        })()
      : new Blob([decodeURIComponent(payload)], { type: 'text/javascript' });

    const blobUrl = URL.createObjectURL(blob);
    return {
      workerUrl: blobUrl,
      release: () => {
        URL.revokeObjectURL(blobUrl);
      },
    };
  } catch {
    return { workerUrl: url, release: () => {} };
  }
}

export function createManagedBrowserWorker(
  input: ManagedBrowserWorkerFactoryInput,
): ManagedBrowserWorkerFactoryOutput {
  const resolved = resolveWorkerUrlForCsp(input.url);
  const worker = new Worker(resolved.workerUrl, input.options ?? { type: 'module' });
  const trackedRelease = trackBrowserWorkerLifecycle(worker, input.tracking);
  return {
    worker,
    release: () => {
      trackedRelease();
      resolved.release();
    },
  };
}
