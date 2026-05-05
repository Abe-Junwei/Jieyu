// Browser shim for Node.js worker_threads used by wavesurfer spectrogram plugin.
// Exporting undefined Worker preserves plugin's try/catch fallback path.
export const Worker = undefined;

