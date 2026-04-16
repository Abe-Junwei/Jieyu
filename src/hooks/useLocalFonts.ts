/**
 * 本地字体枚举 Hook（渐进增强）| Local font enumeration hook (progressive enhancement)
 * Chrome/Edge 103+ 支持 queryLocalFonts() | Supported in Chrome/Edge 103+
 */

import { useCallback, useRef, useState } from 'react';
import { getCachedFontCoverageVerification, isLocalFontAccessSupported, queryLocalFontFamilies, verifyFontCoverage, type FontCoverageVerification, type LocalFontState, type OrthographyRenderPolicy } from '../utils/layerDisplayStyle';

export function useLocalFonts() {
  const [state, setState] = useState<LocalFontState>({
    status: isLocalFontAccessSupported() ? 'idle' : 'unsupported',
    fonts: [],
  });
  const [showAllFonts, setShowAllFonts] = useState(false);
  const [searchQueryByLayerId, setSearchQueryByLayerId] = useState<Record<string, string>>({});
  const [coverageByKey, setCoverageByKey] = useState<Record<string, FontCoverageVerification>>({});
  const pendingCoverageByKeyRef = useRef<Record<string, Promise<FontCoverageVerification>>>({});

  const loadLocalFonts = useCallback(async () => {
    if (!isLocalFontAccessSupported()) return;
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const fonts = await queryLocalFontFamilies();
      setState({ status: 'loaded', fonts });
    } catch (err: unknown) {
      const isDenied = err instanceof DOMException && err.name === 'NotAllowedError';
      setState({ status: isDenied ? 'denied' : 'idle', fonts: [] });
    }
  }, []);

  const toggleShowAllFonts = useCallback(() => {
    setShowAllFonts((prev) => !prev);
  }, []);

  const getSearchQuery = useCallback((layerId: string) => {
    return searchQueryByLayerId[layerId] ?? '';
  }, [searchQueryByLayerId]);

  const setSearchQuery = useCallback((layerId: string, nextValue: string) => {
    setSearchQueryByLayerId((prev) => {
      if (!nextValue) {
        if (!(layerId in prev)) return prev;
        const next = { ...prev };
        delete next[layerId];
        return next;
      }
      if (prev[layerId] === nextValue) return prev;
      return { ...prev, [layerId]: nextValue };
    });
  }, []);

  const getCoverage = useCallback((fontFamily: string, renderPolicy: OrthographyRenderPolicy) => {
    const cacheKey = [fontFamily, renderPolicy.scriptTag, renderPolicy.coverageSummary.exemplarSample, renderPolicy.coverageSummary.exemplarCharacterCount, renderPolicy.ipaMode ? 'ipa' : 'plain'].join('\u0000');
    return coverageByKey[cacheKey] ?? getCachedFontCoverageVerification(fontFamily, renderPolicy);
  }, [coverageByKey]);

  const ensureCoverage = useCallback(async (fontFamily: string, renderPolicy: OrthographyRenderPolicy) => {
    if (!fontFamily || fontFamily === '\u7cfb\u7edf\u9ed8\u8ba4') return undefined;
    const cacheKey = [fontFamily, renderPolicy.scriptTag, renderPolicy.coverageSummary.exemplarSample, renderPolicy.coverageSummary.exemplarCharacterCount, renderPolicy.ipaMode ? 'ipa' : 'plain'].join('\u0000');
    const existing = coverageByKey[cacheKey] ?? getCachedFontCoverageVerification(fontFamily, renderPolicy);
    if (existing) {
      setCoverageByKey((prev) => (prev[cacheKey] ? prev : { ...prev, [cacheKey]: existing }));
      return existing;
    }
    const pending = pendingCoverageByKeyRef.current[cacheKey];
    if (pending) return pending;

    const task = verifyFontCoverage(fontFamily, renderPolicy)
      .then((result) => {
        setCoverageByKey((prev) => ({ ...prev, [cacheKey]: result }));
        delete pendingCoverageByKeyRef.current[cacheKey];
        return result;
      })
      .catch((error) => {
        delete pendingCoverageByKeyRef.current[cacheKey];
        throw error;
      });
    pendingCoverageByKeyRef.current[cacheKey] = task;
    return task;
  }, [coverageByKey]);

  return {
    ...state,
    loadLocalFonts,
    showAllFonts,
    setShowAllFonts,
    toggleShowAllFonts,
    getSearchQuery,
    setSearchQuery,
    getCoverage,
    ensureCoverage,
  } as const;
}
