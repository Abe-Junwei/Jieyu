/** A model or preview confidence that fits `units.confidence`. Anything else is absent. */
export function storedSegmentConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

/** Text color for a stored machine-transcription confidence. Absent stays ink. */
export function segmentConfidenceClass(confidence: number | undefined): string {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return '';
  if (confidence < 0.5) return 'timeline-annotation-confidence-low';
  if (confidence < 0.75) return 'timeline-annotation-confidence-mid';
  return 'timeline-annotation-confidence-high';
}
