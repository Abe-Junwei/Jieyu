import { useCallback } from 'react';
import { LinguisticService } from '../services/LinguisticService';
import type { UtteranceDocType } from '../db';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
};

export function useTranscriptionTokenActions({
  runWithDbMutex,
  setUtterances,
}: Params) {
  const updateTokenPos = useCallback(async (tokenId: string, pos: string | null) => {
    await runWithDbMutex(() => LinguisticService.updateTokenPos(tokenId, pos));
    const nextPos = (pos ?? '').trim();
    setUtterances((prev) => prev.map((utterance) => {
      if (!Array.isArray(utterance.words) || utterance.words.length === 0) return utterance;

      let changed = false;
      const nextWords = utterance.words.map((word) => {
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

      if (!changed) return utterance;
      return {
        ...utterance,
        words: nextWords,
      };
    }));
  }, [runWithDbMutex, setUtterances]);

  const batchUpdateTokenPosByForm = useCallback(async (
    utteranceId: string,
    form: string,
    pos: string | null,
    orthographyKey = 'default',
  ) => {
    const updated = await runWithDbMutex(() => LinguisticService.batchUpdateTokenPosByForm(utteranceId, form, pos, orthographyKey));
    if (updated <= 0) return 0;

    const normalizedForm = form.trim();
    const nextPos = (pos ?? '').trim();
    setUtterances((prev) => prev.map((utterance) => {
      if (utterance.id !== utteranceId || !Array.isArray(utterance.words) || utterance.words.length === 0) {
        return utterance;
      }

      const nextWords = utterance.words.map((word) => {
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
        ...utterance,
        words: nextWords,
      };
    }));

    return updated;
  }, [runWithDbMutex, setUtterances]);

  const updateTokenGloss = useCallback(async (tokenId: string, gloss: string | null, lang = 'eng') => {
    await runWithDbMutex(() => LinguisticService.updateTokenGloss(tokenId, gloss, lang));
    const trimmed = (gloss ?? '').trim();
    setUtterances((prev) => prev.map((utterance) => {
      if (!Array.isArray(utterance.words) || utterance.words.length === 0) return utterance;

      let changed = false;
      const nextWords = utterance.words.map((word) => {
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

      if (!changed) return utterance;
      return { ...utterance, words: nextWords };
    }));
  }, [runWithDbMutex, setUtterances]);

  return {
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  };
}
