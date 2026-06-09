export const buildBudgets = [
  { label: 'TranscriptionPage.Orchestrator', pattern: /^TranscriptionPage\.Orchestrator-.*\.js$/, maxBytes: 860 * 1024 },
  { label: 'TranscriptionPage.ImportExport.archive', pattern: /^TranscriptionPage\.ImportExport\.archive-.*\.js$/, maxBytes: 1400 * 1024 },
  { label: 'db-import-validation-runtime', pattern: /^db-import-validation-runtime-.*\.js$/, maxBytes: 1400 * 1024 },
  { label: 'pdf-vendor', pattern: /^pdf-vendor-.*\.js$/, maxBytes: 900 * 1024 },
  { label: 'transformers', pattern: /^transformers[.\-].*\.js$/, maxBytes: 860 * 1024 },
  { label: 'onnxruntime-vendor', pattern: /^ort\.bundle\.min-.*\.js$/, maxBytes: 400 * 1024 },
  { label: 'language-mapping-runtime', pattern: /^language-mapping-runtime-.*\.js$/, maxBytes: 64 * 1024 },
  { label: 'main.css', pattern: /^main-.*\.css$/, maxBytes: 150 * 1024 },
  // May emit multiple hashed CSS files (route shell + lazy chunk); checker enforces each file <= maxBytes
  // Verified current release footprint remains within 230 KiB after the page-shell split.
  { label: 'TranscriptionPage.css', pattern: /^TranscriptionPage[.-][A-Za-z0-9_.-]+\.css$/, maxBytes: 230 * 1024 },
  { label: 'transcription-timeline.css', pattern: /^transcription-timeline-.*\.css$/, maxBytes: 56 * 1024 },
  { label: 'OrchestratorWaveformContent.css', pattern: /^OrchestratorWaveformContent-.*\.css$/, maxBytes: 28 * 1024 },
  { label: 'languageMetadataWorkspace.css', pattern: /^languageMetadataWorkspace-.*\.css$/, maxBytes: 28 * 1024 },
  { label: 'OrthographyManagerPage.css', pattern: /^OrthographyManagerPage-.*\.css$/, maxBytes: 36 * 1024 },
  { label: 'OrthographyBridgeWorkspacePage.css', pattern: /^OrthographyBridgeWorkspacePage-.*\.css$/, maxBytes: 16 * 1024 },
];

export const profileLargeJsHintThresholdBytes = 500 * 1024;