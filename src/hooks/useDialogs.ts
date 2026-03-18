import { useCallback, useEffect, useState } from 'react';
import { LinguisticService } from '../../services/LinguisticService';
import type { UtteranceDocType } from '../../db';

type DialogUtterance = Pick<UtteranceDocType, 'textId'>;

export function useDialogs(utterances: DialogUtterance[]) {
  const [showProjectSetup, setShowProjectSetup] = useState(false);
  const [showAudioImport, setShowAudioImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);

  const getActiveTextId = useCallback(async (): Promise<string | null> => {
    if (activeTextId) return activeTextId;
    const texts = await LinguisticService.getAllTexts();
    const first = texts[0];
    if (first) {
      setActiveTextId(first.id);
      return first.id;
    }
    return null;
  }, [activeTextId]);

  useEffect(() => {
    if (activeTextId) return;
    const firstTextId = utterances[0]?.textId;
    if (firstTextId) setActiveTextId(firstTextId);
  }, [utterances, activeTextId]);

  return {
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    getActiveTextId,
  };
}