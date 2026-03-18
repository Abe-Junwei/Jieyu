import { useCallback } from 'react';
import { getDb } from '../../db';
import type { AnchorDocType, UtteranceDocType } from '../../db';
import { newId } from '../utils/transcriptionFormatters';

type Params = {
  anchorsRef: React.MutableRefObject<AnchorDocType[]>;
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  setAnchors: React.Dispatch<React.SetStateAction<AnchorDocType[]>>;
};

export function useTranscriptionAnchorActions({
  anchorsRef,
  utterancesRef,
  setAnchors,
}: Params) {
  const createAnchor = useCallback(async (
    db: Awaited<ReturnType<typeof getDb>>,
    mediaId: string,
    time: number,
  ): Promise<AnchorDocType> => {
    const anchor: AnchorDocType = {
      id: newId('anc'),
      mediaId,
      time,
      createdAt: new Date().toISOString(),
    };
    await db.collections.anchors.insert(anchor);
    setAnchors((prev) => [...prev, anchor]);
    return anchor;
  }, [setAnchors]);

  const pruneOrphanAnchors = useCallback(async (
    db: Awaited<ReturnType<typeof getDb>>,
    excludeUtteranceIds?: Set<string>,
  ) => {
    const referenced = new Set<string>();
    for (const u of utterancesRef.current) {
      if (excludeUtteranceIds?.has(u.id)) continue;
      if (u.startAnchorId) referenced.add(u.startAnchorId);
      if (u.endAnchorId) referenced.add(u.endAnchorId);
    }
    const orphans = anchorsRef.current.filter((a) => !referenced.has(a.id));
    if (orphans.length === 0) return;

    for (const orphan of orphans) {
      await db.collections.anchors.remove(orphan.id);
    }
    const orphanIds = new Set(orphans.map((a) => a.id));
    setAnchors((prev) => prev.filter((a) => !orphanIds.has(a.id)));
  }, [anchorsRef, setAnchors, utterancesRef]);

  const updateAnchorTime = useCallback(async (
    db: Awaited<ReturnType<typeof getDb>>,
    anchorId: string,
    newTime: number,
  ) => {
    const anchor = anchorsRef.current.find((a) => a.id === anchorId);
    if (!anchor) return;

    const updated: AnchorDocType = { ...anchor, time: newTime };
    await db.collections.anchors.insert(updated);
    setAnchors((prev) => prev.map((a) => (a.id === anchorId ? updated : a)));
  }, [anchorsRef, setAnchors]);

  return {
    createAnchor,
    pruneOrphanAnchors,
    updateAnchorTime,
  };
}