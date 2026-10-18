import { useCallback } from 'react';
import type { AnchorDocType, LayerUnitDocType } from '../../db/types';
import {
  deleteTranscriptionAnchor,
  putTranscriptionAnchor,
} from '../../db/storagePortTranscriptionAnchors';
import { newId } from '../../utils/transcriptionFormatters';

type Params = {
  anchorsRef: React.MutableRefObject<AnchorDocType[]>;
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  setAnchors: React.Dispatch<React.SetStateAction<AnchorDocType[]>>;
};

export function useTranscriptionAnchorActions({ anchorsRef, unitsRef, setAnchors }: Params) {
  const createAnchor = useCallback(
    async (mediaId: string, time: number): Promise<AnchorDocType> => {
      const anchor: AnchorDocType = {
        id: newId('anc'),
        mediaId,
        time,
        createdAt: new Date().toISOString(),
      };
      const stored = await putTranscriptionAnchor(anchor);
      setAnchors((prev) => [...prev, stored]);
      return stored;
    },
    [setAnchors],
  );

  const pruneOrphanAnchors = useCallback(
    async (excludeUnitIds?: Set<string>) => {
      const referenced = new Set<string>();
      for (const unit of unitsRef.current) {
        if (excludeUnitIds?.has(unit.id)) continue;
        const startAnchorId = unit.startAnchorId ?? '';
        const endAnchorId = unit.endAnchorId ?? '';
        if (startAnchorId.length > 0) referenced.add(startAnchorId);
        if (endAnchorId.length > 0) referenced.add(endAnchorId);
      }
      const orphans = anchorsRef.current.filter((anchor) => !referenced.has(anchor.id));
      if (orphans.length === 0) return;

      for (const orphan of orphans) {
        await deleteTranscriptionAnchor(orphan.id);
      }
      const orphanIds = new Set(orphans.map((anchor) => anchor.id));
      setAnchors((prev) => prev.filter((anchor) => !orphanIds.has(anchor.id)));
    },
    [anchorsRef, setAnchors, unitsRef],
  );

  const updateAnchorTime = useCallback(
    async (anchorId: string, newTime: number) => {
      const anchor = anchorsRef.current.find((item) => item.id === anchorId);
      if (!anchor) return;

      const updated: AnchorDocType = { ...anchor, time: newTime };
      const stored = await putTranscriptionAnchor(updated);
      setAnchors((prev) => prev.map((item) => (item.id === anchorId ? stored : item)));
    },
    [anchorsRef, setAnchors],
  );

  return {
    createAnchor,
    pruneOrphanAnchors,
    updateAnchorTime,
  };
}
