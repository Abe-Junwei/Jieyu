import { useCallback, useEffect, useRef, useState } from 'react';
import { fireAndForget } from '../utils/fireAndForget';

type UseRecoveryBannerParams = {
  phase: string;
  unitsLength: number;
  translationsLength: number;
  layersLength: number;
  checkRecovery: () => Promise<{
    units: unknown[];
    translations: unknown[];
    layers: unknown[];
  } | null>;
};

export function useRecoveryBanner<TSnapshot extends {
  units: unknown[];
  translations: unknown[];
  layers: unknown[];
} | null>({
  phase,
  unitsLength,
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
  const [recoveryDiffSummary, setRecoveryDiffSummary] = useState<{ units: number; translations: number; layers: number } | null>(null);
  const recoveryDataRef = useRef<TSnapshot>(null as TSnapshot);
  const dismissedRef = useRef(false);
  const currentLengthsRef = useRef({
    units: unitsLength,
    translations: translationsLength,
    layers: layersLength,
  });

  useEffect(() => {
    currentLengthsRef.current = {
      units: unitsLength,
      translations: translationsLength,
      layers: layersLength,
    };
  }, [layersLength, translationsLength, unitsLength]);

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
        units: Math.max(0, snap.units.length - currentLengths.units),
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
