import { useCallback, useEffect, useRef, useState } from 'react';
import { fireAndForget } from '../utils/fireAndForget';

type UseRecoveryBannerParams = {
  phase: string;
  utterancesLength: number;
  translationsLength: number;
  layersLength: number;
  checkRecovery: () => Promise<{
    utterances: unknown[];
    translations: unknown[];
    layers: unknown[];
  } | null>;
};

export function useRecoveryBanner<TSnapshot extends {
  utterances: unknown[];
  translations: unknown[];
  layers: unknown[];
} | null>({
  phase,
  utterancesLength,
  translationsLength,
  layersLength,
  checkRecovery,
  applyRecovery,
  dismissRecovery,
}: Omit<UseRecoveryBannerParams, 'checkRecovery'> & {
  checkRecovery: () => Promise<TSnapshot>;
  applyRecovery?: (snapshot: NonNullable<TSnapshot>) => Promise<boolean>;
  dismissRecovery?: () => Promise<void>;
}) {
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryDiffSummary, setRecoveryDiffSummary] = useState<{ utterances: number; translations: number; layers: number } | null>(null);
  const recoveryDataRef = useRef<TSnapshot>(null as TSnapshot);
  const dismissedRef = useRef(false);
  const currentLengthsRef = useRef({
    utterances: utterancesLength,
    translations: translationsLength,
    layers: layersLength,
  });

  useEffect(() => {
    currentLengthsRef.current = {
      utterances: utterancesLength,
      translations: translationsLength,
      layers: layersLength,
    };
  }, [layersLength, translationsLength, utterancesLength]);

  useEffect(() => {
    if (phase === 'ready') return;
    dismissedRef.current = false;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'ready' || dismissedRef.current) return;
    let cancelled = false;
    fireAndForget(checkRecovery().then((snap) => {
      if (cancelled || !snap) return;
      const currentLengths = currentLengthsRef.current;
      recoveryDataRef.current = snap;
      setRecoveryDiffSummary({
        utterances: Math.max(0, snap.utterances.length - currentLengths.utterances),
        translations: Math.max(0, snap.translations.length - currentLengths.translations),
        layers: Math.max(0, snap.layers.length - currentLengths.layers),
      });
      setRecoveryAvailable(true);
    }));
    return () => { cancelled = true; };
  }, [checkRecovery, phase]);

  const hideRecoveryBanner = (): void => {
    dismissedRef.current = true;
    setRecoveryAvailable(false);
  };

  const applyRecoveryBanner = useCallback((): void => {
    if (!applyRecovery) return;
    const snap = recoveryDataRef.current;
    if (!snap) return;

    fireAndForget((async () => {
      const ok = await applyRecovery(snap as NonNullable<TSnapshot>);
      if (ok) hideRecoveryBanner();
    })());
  }, [applyRecovery]);

  const dismissRecoveryBanner = useCallback((): void => {
    if (dismissRecovery) {
      fireAndForget(dismissRecovery());
    }
    hideRecoveryBanner();
  }, [dismissRecovery]);

  return {
    recoveryAvailable,
    recoveryDiffSummary,
    recoveryDataRef,
    hideRecoveryBanner,
    applyRecoveryBanner,
    dismissRecoveryBanner,
  };
}
