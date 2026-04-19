/**
 * Stable primary key for `track_entities` rows (text-scoped, avoids legacy `track_${media}` collisions).
 */
export function trackEntityDocumentId(textId: string, trackKey: string): string {
  return `te:${textId}:${trackKey}`;
}
