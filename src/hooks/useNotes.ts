import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db as dexieDb } from '../db';
import type { UserNoteDocType, NoteTargetType, NoteCategory, MultiLangString } from '../db';
import { createLogger } from '../observability/logger';
import { SegmentMetaService } from '../services/SegmentMetaService';
import { newId } from '../utils/transcriptionFormatters';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';

const log = createLogger('useNotes');

export interface NoteTarget {
  targetType: NoteTargetType;
  targetId: string;
  targetIndex?: number;
  parentTargetId?: string;
}

export function useNotes(target: NoteTarget | null) {
  const [notes, setNotes] = useState<UserNoteDocType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const ticketRef = useRef(0);

  const resolveCanonicalTarget = useCallback(async (input: NoteTarget): Promise<NoteTarget> => {
    if (input.targetType === 'token') {
      const existingToken = await dexieDb.unit_tokens.get(input.targetId);
      if (existingToken) {
        return { targetType: 'token', targetId: existingToken.id };
      }

      if (typeof input.targetIndex === 'number') {
        const unitCandidates = [input.parentTargetId, input.targetId]
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        for (const unitId of unitCandidates) {
          const tokenByIndex = await dexieDb.unit_tokens
            .where('[unitId+tokenIndex]')
            .equals([unitId, input.targetIndex])
            .first();
          if (tokenByIndex) {
            return { targetType: 'token', targetId: tokenByIndex.id, parentTargetId: unitId };
          }
        }
      }

      return input;
    }

    if (input.targetType === 'morpheme') {
      const existingMorpheme = await dexieDb.unit_morphemes.get(input.targetId);
      if (existingMorpheme) {
        return { targetType: 'morpheme', targetId: existingMorpheme.id, parentTargetId: existingMorpheme.tokenId };
      }

      if (typeof input.targetIndex === 'number') {
        const tokenCandidates = [input.parentTargetId, input.targetId]
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        for (const tokenId of tokenCandidates) {
          const morphByIndex = await dexieDb.unit_morphemes
            .where('[tokenId+morphemeIndex]')
            .equals([tokenId, input.targetIndex])
            .first();
          if (morphByIndex) {
            return { targetType: 'morpheme', targetId: morphByIndex.id, parentTargetId: tokenId };
          }
        }
      }

      return input;
    }

    return input;
  }, []);

  const fetchNotes = useCallback(async () => {
    if (!target) {
      setNotes([]);
      return;
    }
    const ticket = ++ticketRef.current;
    setIsLoading(true);
    try {
      const resolvedTarget = await resolveCanonicalTarget(target);
      const results = await dexieDb.user_notes
        .where('[targetType+targetId]')
        .equals([resolvedTarget.targetType, resolvedTarget.targetId])
        .sortBy('updatedAt');
      if (ticket === ticketRef.current) {
        setNotes(results);
        setIsLoading(false);
      }
    } catch (error) {
      if (ticket === ticketRef.current) {
        log.error('Failed to fetch notes', {
          targetType: target.targetType,
          targetId: target.targetId,
          error: error instanceof Error ? error.message : String(error),
        });
        setIsLoading(false);
      }
    }
  }, [resolveCanonicalTarget, target]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = useCallback(
    async (content: MultiLangString, category?: NoteCategory) => {
      if (!target) return;
      const resolvedTarget = await resolveCanonicalTarget(target);
      const now = new Date().toISOString();
      const isCanonicalWordTarget = resolvedTarget.targetType === 'token';
      const isCanonicalMorphemeTarget = resolvedTarget.targetType === 'morpheme';
      const doc: UserNoteDocType = {
        id: newId('note'),
        targetType: resolvedTarget.targetType,
        targetId: resolvedTarget.targetId,
        ...(!isCanonicalWordTarget && !isCanonicalMorphemeTarget && resolvedTarget.targetIndex != null
          ? { targetIndex: resolvedTarget.targetIndex }
          : {}),
        ...(resolvedTarget.parentTargetId ? { parentTargetId: resolvedTarget.parentTargetId } : {}),
        content,
        ...(category && { category }),
        createdAt: now,
        updatedAt: now,
      };
      await dexieDb.user_notes.put(normalizeUserNoteDocForStorage(doc));
      void SegmentMetaService.syncForUnitIds([
        resolvedTarget.targetId,
        ...(resolvedTarget.parentTargetId ? [resolvedTarget.parentTargetId] : []),
      ]).catch(() => {
        // SegmentMeta 为统一读模型，笔记同步失败不应阻塞主流程 | SegmentMeta is a shared read model; note-sync failures must not block the primary flow.
      });
      await fetchNotes();
      setVersion(v => v + 1);
    },
    [target, resolveCanonicalTarget, fetchNotes],
  );

  const updateNote = useCallback(
    async (id: string, updates: { content?: MultiLangString; category?: NoteCategory }) => {
      await dexieDb.user_notes.update(id, { ...updates, updatedAt: new Date().toISOString() });
      if (target) {
        const resolvedTarget = await resolveCanonicalTarget(target);
        void SegmentMetaService.syncForUnitIds([
          resolvedTarget.targetId,
          ...(resolvedTarget.parentTargetId ? [resolvedTarget.parentTargetId] : []),
        ]).catch(() => {
          // SegmentMeta 为统一读模型，笔记同步失败不应阻塞主流程 | SegmentMeta is a shared read model; note-sync failures must not block the primary flow.
        });
      }
      await fetchNotes();
      setVersion(v => v + 1);
    },
    [fetchNotes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await dexieDb.user_notes.delete(id);
      if (target) {
        const resolvedTarget = await resolveCanonicalTarget(target);
        void SegmentMetaService.syncForUnitIds([
          resolvedTarget.targetId,
          ...(resolvedTarget.parentTargetId ? [resolvedTarget.parentTargetId] : []),
        ]).catch(() => {
          // SegmentMeta 为统一读模型，笔记同步失败不应阻塞主流程 | SegmentMeta is a shared read model; note-sync failures must not block the primary flow.
        });
      }
      await fetchNotes();
      setVersion(v => v + 1);
    },
    [fetchNotes],
  );

  return { notes, isLoading, addNote, updateNote, deleteNote, refreshNotes: fetchNotes, version };
}

export function useNoteCounts(targetType: NoteTargetType, targetIds: string[], refreshKey = 0) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const idsKey = targetIds.join(',');
  const stableTargetIds = useMemo(() => targetIds, [idsKey]);

  useEffect(() => {
    if (stableTargetIds.length === 0) {
      setCounts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const map = new Map<string, number>();
        const results = await dexieDb.user_notes
          .where('[targetType+targetId]')
          .anyOf(stableTargetIds.map((id) => [targetType, id]))
          .toArray();
        for (const note of results) {
          map.set(note.targetId, (map.get(note.targetId) ?? 0) + 1);
        }
        if (!cancelled) setCounts(map);
      } catch (error) {
        if (!cancelled) {
          log.error('Failed to fetch note counts', {
            targetType,
            targetCount: stableTargetIds.length,
            error: error instanceof Error ? error.message : String(error),
          });
          setCounts(new Map());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetType, stableTargetIds, refreshKey]);

  return counts;
}
