import { useCallback, useEffect, useState } from 'react';
import { LinguisticService } from '../services/LinguisticService';
import type { TextDocType, UtteranceDocType } from '../db';

type DialogUtterance = Pick<UtteranceDocType, 'textId'>;

function resolvePrimaryLanguageId(text: TextDocType): string | null {
  const metadataLang = (text.metadata as { primaryLanguageId?: unknown } | undefined)?.primaryLanguageId;
  if (typeof metadataLang === 'string' && metadataLang.trim()) {
    return metadataLang.trim();
  }
  if (typeof text.languageCode === 'string' && text.languageCode.trim()) {
    return text.languageCode.trim();
  }
  return null;
}

function resolvePrimaryOrthographyId(text: TextDocType): string | null {
  const metadataOrthography = (text.metadata as { primaryOrthographyId?: unknown } | undefined)?.primaryOrthographyId;
  if (typeof metadataOrthography === 'string' && metadataOrthography.trim()) {
    return metadataOrthography.trim();
  }
  return null;
}

export function useDialogs(utterances: DialogUtterance[]) {
  const [showProjectSetup, setShowProjectSetup] = useState(false);
  const [showAudioImport, setShowAudioImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [activeTextPrimaryLanguageId, setActiveTextPrimaryLanguageId] = useState<string | null>(null);
  const [activeTextPrimaryOrthographyId, setActiveTextPrimaryOrthographyId] = useState<string | null>(null);

  const getActiveTextId = useCallback(async (): Promise<string | null> => {
    if (activeTextId) return activeTextId;
    const texts = await LinguisticService.getAllTexts();
    const first = texts[0];
    if (first) {
      setActiveTextId(first.id);
      setActiveTextPrimaryLanguageId(resolvePrimaryLanguageId(first));
      setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(first));
      return first.id;
    }
    return null;
  }, [activeTextId]);

  const getActiveTextPrimaryLanguageId = useCallback(async (): Promise<string | null> => {
    if (activeTextPrimaryLanguageId) return activeTextPrimaryLanguageId;
    const texts = await LinguisticService.getAllTexts();
    const resolvedTextId = activeTextId ?? texts[0]?.id;
    if (!resolvedTextId) return null;
    const activeText = texts.find((text) => text.id === resolvedTextId);
    if (!activeText) return null;
    const languageId = resolvePrimaryLanguageId(activeText);
    setActiveTextPrimaryLanguageId(languageId);
    setActiveTextPrimaryOrthographyId(resolvePrimaryOrthographyId(activeText));
    if (!activeTextId) setActiveTextId(activeText.id);
    return languageId;
  }, [activeTextId, activeTextPrimaryLanguageId]);

  useEffect(() => {
    if (activeTextId) return;
    const firstTextId = utterances[0]?.textId;
    if (firstTextId) setActiveTextId(firstTextId);
  }, [utterances, activeTextId]);

  useEffect(() => {
    if (!activeTextId) {
      setActiveTextPrimaryLanguageId(null);
      setActiveTextPrimaryOrthographyId(null);
      return;
    }
    let cancelled = false;
    void LinguisticService.getAllTexts().then((texts) => {
      if (cancelled) return;
      const activeText = texts.find((text) => text.id === activeTextId);
      setActiveTextPrimaryLanguageId(activeText ? resolvePrimaryLanguageId(activeText) : null);
      setActiveTextPrimaryOrthographyId(activeText ? resolvePrimaryOrthographyId(activeText) : null);
    });
    return () => { cancelled = true; };
  }, [activeTextId]);

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
    activeTextPrimaryLanguageId,
    activeTextPrimaryOrthographyId,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
  };
}
