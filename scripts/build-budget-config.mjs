export const buildBudgets = [
  { label: 'TranscriptionPage.Orchestrator', pattern: /^TranscriptionPage\.Orchestrator-.*\.js$/, maxBytes: 860 * 1024 },
  { label: 'voice-agent-core', pattern: /^voice-agent-core-.*\.js$/, maxBytes: 760 * 1024 },
  { label: 'pdf-vendor', pattern: /^pdf-vendor-.*\.js$/, maxBytes: 900 * 1024 },
  { label: 'transformers', pattern: /^(transformers|transformers-vendor)-.*\.js$/, maxBytes: 860 * 1024 },
  { label: 'onnxruntime-vendor', pattern: /^onnxruntime-vendor-.*\.js$/, maxBytes: 300 * 1024 },
  { label: 'index.css', pattern: /^index-.*\.css$/, maxBytes: 88 * 1024 },
  // May emit multiple hashed CSS files (route shell + lazy chunk); checker enforces each file <= maxBytes
  // Verified current release footprint remains within 230 KiB after the page-shell split.
  { label: 'TranscriptionPage.css', pattern: /^TranscriptionPage[.-][A-Za-z0-9_.-]+\.css$/, maxBytes: 230 * 1024 },
  { label: 'transcription-timeline.css', pattern: /^transcription-timeline-.*\.css$/, maxBytes: 48 * 1024 },
  { label: 'OrchestratorWaveformContent.css', pattern: /^OrchestratorWaveformContent-.*\.css$/, maxBytes: 28 * 1024 },
  { label: 'LanguageMetadataWorkspacePage.css', pattern: /^LanguageMetadataWorkspacePage-.*\.css$/, maxBytes: 28 * 1024 },
  { label: 'OrthographyManagerPage.css', pattern: /^OrthographyManagerPage-.*\.css$/, maxBytes: 33 * 1024 },
  { label: 'OrthographyBridgeWorkspacePage.css', pattern: /^OrthographyBridgeWorkspacePage-.*\.css$/, maxBytes: 16 * 1024 },
];

export const profileLargeJsHintThresholdBytes = 500 * 1024;