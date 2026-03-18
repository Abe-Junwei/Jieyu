import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UtteranceDocType } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { useTranscriptionTokenActions } from './useTranscriptionTokenActions';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
};

export function useTranscriptionCanonicalActions({
  runWithDbMutex,
  setUtterances,
}: Params) {
  const getCanonicalTokensForUtterance = useCallback(async (utteranceId: string) => {
    try {
      return await LinguisticService.getTokensByUtteranceId(utteranceId);
    } catch (err) {
      console.error(`Error fetching tokens for utterance ${utteranceId}:`, err);
      return [];
    }
  }, []);

  const getCanonicalMorphemesForToken = useCallback(async (tokenId: string) => {
    try {
      return await LinguisticService.getMorphemesByTokenId(tokenId);
    } catch (err) {
      console.error(`Error fetching morphemes for token ${tokenId}:`, err);
      return [];
    }
  }, []);

  const {
    updateTokenPos,
    batchUpdateTokenPosByForm,
  } = useTranscriptionTokenActions({
    runWithDbMutex,
    setUtterances,
  });

  return {
    getCanonicalTokensForUtterance,
    getCanonicalMorphemesForToken,
    updateTokenPos,
    batchUpdateTokenPosByForm,
  };
}