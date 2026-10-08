import { useEffect, useState } from 'react';
import { mediaIdsRecordedForFilename } from '../../utils/eafImportAlign';
import { listSourceRecords } from '../../services/sourceRecordService';

/**
 * Other media ids that hold this recording's sentences: same filename, or an
 * import file that names this recording but was stamped onto a different item.
 */
export function useRecordedMediaIds(
  selectedMediaId: string | undefined,
  mediaItems: ReadonlyArray<{ id: string; textId: string; filename: string }>,
): readonly string[] {
  const [ids, setIds] = useState<readonly string[]>([]);

  useEffect(() => {
    const selectedId = selectedMediaId?.trim() ?? '';
    const selected = mediaItems.find((item) => item.id === selectedId);
    if (!selected) {
      setIds([]);
      return;
    }
    const twins = mediaIdsRecordedForFilename({
      selectedMediaId: selected.id,
      selectedFilename: selected.filename,
      mediaItems,
      sources: [],
    });
    setIds(twins);
    let cancelled = false;
    void (async () => {
      try {
        const sources = (await listSourceRecords(selected.textId)).map((record) => ({
          name: record.displayName,
          ...(record.mediaId ? { mediaId: record.mediaId } : {}),
          ...(record.linkedMediaFilename
            ? { linkedMediaFilename: record.linkedMediaFilename }
            : {}),
        }));
        const next = mediaIdsRecordedForFilename({
          selectedMediaId: selected.id,
          selectedFilename: selected.filename,
          mediaItems,
          sources,
        });
        if (!cancelled) setIds(next);
      } catch {
        if (!cancelled) setIds(twins);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaItems, selectedMediaId]);

  return ids;
}
