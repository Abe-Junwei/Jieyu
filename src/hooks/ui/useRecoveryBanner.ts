import { useCallback, useEffect, useRef, useState } from 'react';
import { fireAndForget } from '../../utils/fireAndForget';
import type { RecoveryData } from '../../services/SnapshotService';
import {
  getRecoveryLayerContents,
  getRecoveryLayers,
  getRecoveryLayerUnits,
} from '../../services/SnapshotService';

type UseRecoveryBannerParams = {
  phase: string;
  unitsLength: number;
  translationsLength: number;
  layersLength: number;
  checkRecovery: () => Promise<RecoveryData | null>;
  applyRecovery?: (snapshot: RecoveryData) => Promise<boolean>;
  dismissRecovery?: () => Promise<void>;
};

export function useRecoveryBanner({
  phase,
  unitsLength,
  translationsLength,
  layersLength,
  checkRecovery,
  applyRecovery,
  dismissRecovery,
}: UseRecoveryBannerParams) {
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryDiffSummary, setRecoveryDiffSummary] = useState<{
    units: number;
    translations: number;
    layers: number;
  } | null>(null);
  const recoveryDataRef = useRef<RecoveryData | null>(null);
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
    fireAndForget(
      checkRecovery().then((snap) => {
        if (cancelled || !snap) return;
        const currentLengths = currentLengthsRef.current;
        const recoveryUnits = getRecoveryLayerUnits(snap);
        const recoveryTranslations = getRecoveryLayerContents(snap);
        const recoveryLayers = getRecoveryLayers(snap);
        recoveryDataRef.current = snap;
        setRecoveryDiffSummary({
          units: Math.max(0, recoveryUnits.length - currentLengths.units),
          translations: Math.max(0, recoveryTranslations.length - currentLengths.translations),
          layers: Math.max(0, recoveryLayers.length - currentLengths.layers),
        });
        setRecoveryAvailable(true);
      }),
      { context: 'src/hooks/ui/useRecoveryBanner.ts:L59', policy: 'user-visible' },
    );
    return () => {
      cancelled = true;
    };
  }, [checkRecovery, phase]);

  const hideRecoveryBanner = (): void => {
    dismissedRef.current = true;
    setRecoveryAvailable(false);
  };

  const applyRecoveryBanner = useCallback((): void => {
    if (!applyRecovery) return;
    const snap = recoveryDataRef.current;
    if (!snap) return;

    fireAndForget(
      (async () => {
        const ok = await applyRecovery(snap);
        if (ok) hideRecoveryBanner();
      })(),
      { context: 'src/hooks/ui/useRecoveryBanner.ts:L83', policy: 'user-visible' },
    );
  }, [applyRecovery]);

  const dismissRecoveryBanner = useCallback((): void => {
    if (dismissRecovery) {
      fireAndForget(dismissRecovery(), {
        context: 'src/hooks/ui/useRecoveryBanner.ts:L91',
        policy: 'user-visible',
      });
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
