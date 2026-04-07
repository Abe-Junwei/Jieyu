export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.85) return 'var(--voice-confidence-high, var(--state-success-solid))';
  if (confidence >= 0.6) return 'var(--voice-confidence-mid, var(--state-warning-solid))';
  return 'var(--voice-confidence-low, var(--state-danger-solid))';
}