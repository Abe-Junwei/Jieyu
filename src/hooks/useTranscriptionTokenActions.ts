import { useCallback } from 'react';
import { LinguisticService } from '../services/LinguisticService';
import type { LayerUnitDocType } from '../db';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
};

export function useTranscriptionTokenActions({
  runWithDbMutex,
  setUnits,
}: Params) {
  const updateTokenPos = useCallback(async (tokenId: string, pos: string | null) => {
    await runWithDbMutex(() => LinguisticService.updateTokenPos(tokenId, pos));
    const nextPos = (pos ?? '').trim();
    setUnits((prev) => prev.map((unit) => {
      if (!Array.isArray(unit.words) || unit.words.length === 0) return unit;

      let changed = false;
      const nextWords = unit.words.map((word) => {
        if (word.id !== tokenId) return word;
        changed = true;
        if (nextPos.length === 0) {
          const { pos: _oldPos, ...rest } = word;
          return rest;
        }
        return {
          ...word,
          pos: nextPos,
        };
      });

      if (!changed) return unit;
      return {
        ...unit,
        words: nextWords,
      };
    }));
  }, [runWithDbMutex, setUnits]);

  const batchUpdateTokenPosByForm = useCallback(async (
    unitId: string,
    form: string,
    pos: string | null,
    orthographyKey = 'default',
  ) => {
    const updated = await runWithDbMutex(() => LinguisticService.batchUpdateTokenPosByForm(unitId, form, pos, orthographyKey));
    if (updated <= 0) return 0;

    const normalizedForm = form.trim();
    const nextPos = (pos ?? '').trim();
    setUnits((prev) => prev.map((unit) => {
      if (unit.id !== unitId || !Array.isArray(unit.words) || unit.words.length === 0) {
        return unit;
      }

      const nextWords = unit.words.map((word) => {
        const match = word.form[orthographyKey] === normalizedForm
          || Object.values(word.form).some((v) => v === normalizedForm);
        if (!match) return word;

        if (nextPos.length === 0) {
          const { pos: _oldPos, ...rest } = word;
          return rest;
        }
        return {
          ...word,
          pos: nextPos,
        };
      });

      return {
        ...unit,
        words: nextWords,
      };
    }));

    return updated;
  }, [runWithDbMutex, setUnits]);

  const updateTokenGloss = useCallback(async (tokenId: string, gloss: string | null, lang = 'eng') => {
    await runWithDbMutex(() => LinguisticService.updateTokenGloss(tokenId, gloss, lang));
    const trimmed = (gloss ?? '').trim();
    setUnits((prev) => prev.map((unit) => {
      if (!Array.isArray(unit.words) || unit.words.length === 0) return unit;

      let changed = false;
      const nextWords = unit.words.map((word) => {
        if (word.id !== tokenId) return word;
        changed = true;
        if (trimmed.length === 0) {
          if (!word.gloss) return word;
          const { [lang]: _removed, ...rest } = word.gloss;
          const nextGloss = Object.keys(rest).length > 0 ? rest : undefined;
          if (nextGloss) return { ...word, gloss: nextGloss };
          const { gloss: _g, ...wordRest } = word;
          return wordRest;
        }
        return { ...word, gloss: { ...(word.gloss ?? {}), [lang]: trimmed } };
      });

      if (!changed) return unit;
      return { ...unit, words: nextWords };
    }));
  }, [runWithDbMutex, setUnits]);

  return {
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  };
}
