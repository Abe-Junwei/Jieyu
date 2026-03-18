import { useCallback, useEffect, useRef, useState } from 'react';
import { db as dexieDb } from '../../db';
import type { UserNoteDocType, NoteTargetType, NoteCategory, MultiLangString } from '../../db';
import { newId } from '../utils/transcriptionFormatters';
import { normalizeUserNoteDocForStorage } from '../utils/camDataUtils';

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
      const existingToken = await dexieDb.utterance_tokens.get(input.targetId);
      if (existingToken) {
        return { targetType: 'token', targetId: existingToken.id };
      }

      if (typeof input.targetIndex === 'number') {
        const utteranceCandidates = [input.parentTargetId, input.targetId]
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        for (const utteranceId of utteranceCandidates) {
          const tokenByIndex = await dexieDb.utterance_tokens
            .where('[utteranceId+tokenIndex]')
            .equals([utteranceId, input.targetIndex])
            .first();
          if (tokenByIndex) {
            return { targetType: 'token', targetId: tokenByIndex.id, parentTargetId: utteranceId };
          }
        }
      }

      return input;
    }

    if (input.targetType === 'morpheme') {
      const existingMorpheme = await dexieDb.utterance_morphemes.get(input.targetId);
      if (existingMorpheme) {
        return { targetType: 'morpheme', targetId: existingMorpheme.id, parentTargetId: existingMorpheme.tokenId };
      }

      if (typeof input.targetIndex === 'number') {
        const tokenCandidates = [input.parentTargetId, input.targetId]
          .filter((value): value is string => typeof value === 'string' && value.length > 0);

        for (const tokenId of tokenCandidates) {
          const morphByIndex = await dexieDb.utterance_morphemes
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
    } catch {
      if (ticket === ticketRef.current) {
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
      await fetchNotes();
      setVersion(v => v + 1);
    },
    [target, resolveCanonicalTarget, fetchNotes],
  );

  const updateNote = useCallback(
    async (id: string, updates: { content?: MultiLangString; category?: NoteCategory }) => {
      await dexieDb.user_notes.update(id, { ...updates, updatedAt: new Date().toISOString() });
      await fetchNotes();
      setVersion(v => v + 1);
    },
    [fetchNotes],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await dexieDb.user_notes.delete(id);
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

  useEffect(() => {
    if (targetIds.length === 0) {
      setCounts(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const map = new Map<string, number>();
      const results = await dexieDb.user_notes
        .where('[targetType+targetId]')
        .anyOf(targetIds.map((id) => [targetType, id]))
        .toArray();
      for (const note of results) {
        map.set(note.targetId, (map.get(note.targetId) ?? 0) + 1);
      }
      if (!cancelled) setCounts(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, idsKey, refreshKey]);

  return counts;
}
