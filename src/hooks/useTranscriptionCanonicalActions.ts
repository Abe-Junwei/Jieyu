import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { useTranscriptionTokenActions } from './useTranscriptionTokenActions';
import { createLogger } from '../observability/logger';

type Params = {
  runWithDbMutex: <T>(task: () => Promise<T>) => Promise<T>;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
};

const log = createLogger('useTranscriptionCanonicalActions');

export function useTranscriptionCanonicalActions({
  runWithDbMutex,
  setUnits,
}: Params) {
  const getCanonicalTokensForUnit = useCallback(async (unitId: string) => {
    try {
      return await LinguisticService.getTokensByUnitId(unitId);
    } catch (err) {
      log.error('error fetching tokens for unit', { unitId, err });
      return [];
    }
  }, []);

  const getCanonicalMorphemesForToken = useCallback(async (tokenId: string) => {
    try {
      return await LinguisticService.getMorphemesByTokenId(tokenId);
    } catch (err) {
      log.error('error fetching morphemes for token', { tokenId, err });
      return [];
    }
  }, []);

  const {
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  } = useTranscriptionTokenActions({
    runWithDbMutex,
    setUnits,
  });

  return {
    getCanonicalTokensForUnit,
    getCanonicalMorphemesForToken,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  };
}