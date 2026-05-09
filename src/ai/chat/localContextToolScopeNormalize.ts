export type LocalUnitScope = 'project' | 'current_track' | 'current_scope';

export function normalizeUnitScope(value: unknown, fallback: LocalUnitScope = 'project'): LocalUnitScope {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return fallback;
  if (normalized === 'project' || normalized === 'global' || normalized === 'all') return 'project';
  if (normalized === 'current_track' || normalized === 'current-track' || normalized === 'track' || normalized === 'current_audio' || normalized === 'current-audio') return 'current_track';
  if (normalized === 'current_scope' || normalized === 'current-scope' || normalized === 'scope' || normalized === 'current') return 'current_scope';
  return fallback;
}

export function normalizeProjectMetric(value: unknown):
  | 'unit_count'
  | 'speaker_count'
  | 'translation_layer_count'
  | 'ai_confidence_avg'
  | 'untranscribed_count'
  | 'missing_speaker_count'
  | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'unit_count' || normalized === 'unitcount' || normalized === 'unit' || normalized === 'units') return 'unit_count';
  if (normalized === 'speaker_count' || normalized === 'speakercount' || normalized === 'speaker' || normalized === 'speakers') return 'speaker_count';
  if (normalized === 'translation_layer_count' || normalized === 'translationlayercount' || normalized === 'translation_layers' || normalized === 'layers') return 'translation_layer_count';
  if (normalized === 'ai_confidence_avg' || normalized === 'confidence' || normalized === 'avg_confidence') return 'ai_confidence_avg';
  if (normalized === 'untranscribed_count' || normalized === 'untranscribed' || normalized === 'unfinished' || normalized === 'remaining') return 'untranscribed_count';
  if (normalized === 'missing_speaker_count' || normalized === 'missing_speaker' || normalized === 'speaker_missing') return 'missing_speaker_count';
  return undefined;
}
