import { getDb } from '../../db';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../../db';
import { invalidateUnitEmbeddings } from '../../ai/embeddings/EmbeddingInvalidationService';
import { t, type Locale } from '../../i18n';
import {
  listUnitTextsByUnit,
  removeUnitTextFromSegmentationV2,
  syncUnitTextToSegmentationV2,
} from '../../services/LayerSegmentationTextService';
import {
  withUnitTextLayerId,
  type UnitTextWithoutLayerId,
} from '../../services/LayerIdBridgeService';
import { newId } from '../../utils/transcriptionFormatters';
import { reportValidationError } from '../../utils/validationErrorReporter';
import {
  getUndoLabel,
  stripSpeakerAssociationFromTranslationText,
} from './useTranscriptionUnitActions.helpers';
import type { SaveState } from './transcriptionTypes';

export interface TextWriteDeps {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  locale: Locale;
  pushUndo: (label: string) => void;
  resolveUnitById: (
    db: Awaited<ReturnType<typeof getDb>>,
    unitId: string,
  ) => Promise<LayerUnitDocType | null>;
  setSaveState: (s: SaveState) => void;
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function createSaveUnitText(deps: TextWriteDeps) {
  const {
    defaultTranscriptionLayerId,
    layerById,
    locale,
    pushUndo,
    resolveUnitById,
    setSaveState,
    setTranslations,
    setUnitDrafts,
  } = deps;

  return async (unitId: string, value: string, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    const targetLayer = resolvedLayerId ? layerById.get(resolvedLayerId) : undefined;
    const isDefaultLayer =
      !targetLayer ||
      (targetLayer.layerType === 'transcription' &&
        (targetLayer.isDefault === true || targetLayer.id === defaultTranscriptionLayerId));

    pushUndo(getUndoLabel(locale, 'editUnitText'));
    const db = await getDb();
    const now = new Date().toISOString();
    const normalizedValue = value.trim();
    let shouldInvalidateEmbeddings = false;

    if (targetLayer) {
      const allTexts = await listUnitTextsByUnit(db, unitId);
      const existing = allTexts
        .filter(
          (item) =>
            item.layerId === targetLayer.id &&
            (item.modality === 'text' || item.modality === 'mixed'),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

      if (!normalizedValue) {
        if (existing) {
          await removeUnitTextFromSegmentationV2(db, existing);
          setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
          shouldInvalidateEmbeddings = isDefaultLayer;
        }
      } else if (existing) {
        const didTextChange = (existing.text ?? '').trim() !== normalizedValue;
        const updatedTranslation: LayerUnitContentDocType = {
          ...existing,
          text: normalizedValue,
          updatedAt: now,
        } as LayerUnitContentDocType;
        const unit = await resolveUnitById(db, unitId);
        if (unit) {
          await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
        }
        setTranslations((prev) =>
          prev.map((item) => (item.id === existing.id ? updatedTranslation : item)),
        );
        shouldInvalidateEmbeddings = isDefaultLayer && didTextChange;
      } else {
        const newTranslation: LayerUnitContentDocType = {
          ...withUnitTextLayerId(
            {
              id: newId('utr'),
              unitId,
              modality: 'text',
              text: normalizedValue,
              sourceType: 'human',
              createdAt: now,
              updatedAt: now,
            } as UnitTextWithoutLayerId,
            { layerId: targetLayer.id },
          ),
        } as LayerUnitContentDocType;
        const unit = await resolveUnitById(db, unitId);
        if (unit) {
          await syncUnitTextToSegmentationV2(db, unit, newTranslation);
        }
        setTranslations((prev) => [...prev, newTranslation]);
        shouldInvalidateEmbeddings = isDefaultLayer;
      }
    }

    if (shouldInvalidateEmbeddings) {
      await invalidateUnitEmbeddings(db, [unitId]);
    }

    if (isDefaultLayer) {
      setUnitDrafts((prev) => ({ ...prev, [unitId]: value }));
    }

    setSaveState({
      kind: 'done',
      message: t(locale, 'transcription.unitAction.done.textUpdated'),
    });
  };
}

export function createSaveUnitLayerText(deps: TextWriteDeps) {
  const { layerById, locale, pushUndo, resolveUnitById, setSaveState, setTranslations } = deps;

  return async (unitId: string, value: string, layerId: string) => {
    if (!layerId) {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.translationLayerRequired'),
        i18nKey: 'transcription.error.validation.translationLayerRequired',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const targetLayer = layerById.get(layerId);
    if (!targetLayer || targetLayer.layerType !== 'translation') {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.translationLayerInvalid'),
        i18nKey: 'transcription.error.validation.translationLayerInvalid',
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const trimmed = value.trim();

    const allTexts = await listUnitTextsByUnit(db, unitId);
    const candidates = allTexts.filter(
      (item) => item.layerId === layerId && (item.modality === 'text' || item.modality === 'mixed'),
    );

    if (!trimmed) {
      const existing = candidates[0];
      if (existing) {
        pushUndo(getUndoLabel(locale, 'clearTranslationText'));
        await removeUnitTextFromSegmentationV2(db, existing);
        setTranslations((prev) => prev.filter((item) => item.id !== existing.id));
        setSaveState({
          kind: 'done',
          message: t(locale, 'transcription.unitAction.done.translationCleared'),
        });
      }
      return;
    }

    pushUndo(getUndoLabel(locale, 'editTranslationText'));
    const existing = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    if (existing) {
      const sanitizedExisting = stripSpeakerAssociationFromTranslationText(existing);
      const updatedTranslation: LayerUnitContentDocType = {
        ...sanitizedExisting,
        text: trimmed,
        modality: sanitizedExisting.modality,
        updatedAt: now,
      } as LayerUnitContentDocType;
      const unit = await resolveUnitById(db, unitId);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, updatedTranslation);
      }
      setTranslations((prev) =>
        prev.map((item) => (item.id === existing.id ? updatedTranslation : item)),
      );
    } else {
      const newTranslation: LayerUnitContentDocType = {
        ...withUnitTextLayerId(
          {
            id: newId('utr'),
            unitId,
            modality: 'text',
            text: trimmed,
            sourceType: 'human',
            createdAt: now,
            updatedAt: now,
          } as UnitTextWithoutLayerId,
          { layerId },
        ),
      } as LayerUnitContentDocType;
      const unit = await resolveUnitById(db, unitId);
      if (unit) {
        await syncUnitTextToSegmentationV2(db, unit, newTranslation);
      }
      setTranslations((prev) => [...prev, newTranslation]);
    }

    setSaveState({
      kind: 'done',
      message: t(locale, 'transcription.unitAction.done.translationUpdated'),
    });
  };
}
