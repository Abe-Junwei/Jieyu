import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { LayerUnitDocType, Transcription } from '../../db';
import { t, useOptionalLocale } from '../../i18n';
import { parseCharacterVariantLines } from '../../pages/annotation/annotationCharacterVariants';
import type { AnnotationSearchMode } from '../../pages/annotation/annotationRowSearch';
import { requestPlayUnitRange } from '../../pages/transcription/playUnitRange';
import { searchTranscriptionUnits } from '../../pages/transcription/searchTranscriptionUnits';
import {
  LinguisticService,
  loadCharacterVariantLines,
  saveCharacterVariantLines,
} from '../../app/languageAssetPageAccess';

function formText(form: Transcription): string {
  const direct = (form.default ?? '').trim();
  if (direct.length > 0) return direct;
  for (const value of Object.values(form)) {
    const text = value.trim();
    if (text.length > 0) return text;
  }
  return '';
}

export function TranscriptionUnitSearch({
  units,
  sentenceLayerId,
  getUnitText,
  onSelectUnit,
}: {
  units: readonly LayerUnitDocType[];
  sentenceLayerId: string;
  getUnitText?: (unit: LayerUnitDocType, layerId?: string) => string;
  onSelectUnit: (unit: LayerUnitDocType) => void;
}) {
  const locale = useOptionalLocale() ?? 'zh-CN';
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<AnnotationSearchMode>('surface');
  const [excludeUngrammatical, setExcludeUngrammatical] = useState(false);
  const [variantText, setVariantText] = useState('');
  const textId = units.find((unit) => unit.textId.trim().length > 0)?.textId ?? '';
  const queryClient = useQueryClient();
  const variantQuery = useQuery({
    queryKey: ['project-character-variants', textId],
    enabled: textId.length > 0,
    queryFn: () => loadCharacterVariantLines(textId),
  });
  useEffect(() => {
    if (variantQuery.data !== undefined) setVariantText(variantQuery.data);
  }, [variantQuery.data]);
  const variantGroups = useMemo(() => parseCharacterVariantLines(variantText), [variantText]);
  const unitIds = useMemo(
    () => units.map((unit) => unit.id).filter((id) => id.length > 0),
    [units],
  );
  const formsQuery = useQuery({
    queryKey: ['transcription-unit-search-forms', unitIds.join('|')],
    enabled: query.trim().length > 0 && unitIds.length > 0 && mode !== 'surface',
    queryFn: async () => {
      const tokens = await LinguisticService.units.listTokensByUnitIds(unitIds);
      const morphemes = await LinguisticService.units.listMorphemesByTokenIds(
        tokens.map((token) => token.id),
      );
      const wordFormsByUnit = new Map<string, string[]>();
      for (const token of tokens) {
        const text = formText(token.form);
        if (text.length === 0) continue;
        const forms = wordFormsByUnit.get(token.unitId) ?? [];
        forms.push(text);
        wordFormsByUnit.set(token.unitId, forms);
      }
      const morphemeFormsByUnit = new Map<string, string[]>();
      for (const morpheme of morphemes) {
        const text = formText(morpheme.form);
        if (text.length === 0) continue;
        const forms = morphemeFormsByUnit.get(morpheme.unitId) ?? [];
        forms.push(text);
        morphemeFormsByUnit.set(morpheme.unitId, forms);
      }
      return { wordFormsByUnit, morphemeFormsByUnit };
    },
  });
  const hits = useMemo(() => {
    const rows = units.map((unit) => ({
      id: unit.id,
      surface: getUnitText?.(unit, sentenceLayerId) ?? '',
      ...(unit.ungrammatical === true ? { ungrammatical: true } : {}),
      startTime: unit.startTime,
      endTime: unit.endTime,
    }));
    return searchTranscriptionUnits(rows, {
      query,
      mode,
      excludeUngrammatical,
      wordFormsByUnit: formsQuery.data?.wordFormsByUnit ?? new Map(),
      morphemeFormsByUnit: formsQuery.data?.morphemeFormsByUnit ?? new Map(),
      variantGroups,
    });
  }, [
    excludeUngrammatical,
    formsQuery.data,
    getUnitText,
    mode,
    query,
    sentenceLayerId,
    units,
    variantGroups,
  ]);

  return (
    <div className="transcription-unit-search" data-testid="transcription-unit-search">
      <label className="annotation-document-tools-field">
        <span>{t(locale, 'workspace.annotation.find')}</span>
        <span className="annotation-document-tools-row">
          <select
            data-testid="transcription-search-mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as AnnotationSearchMode)}
          >
            <option value="surface">{t(locale, 'workspace.annotation.searchSurface')}</option>
            <option value="word">{t(locale, 'workspace.annotation.searchWord')}</option>
            <option value="morpheme">{t(locale, 'workspace.annotation.searchMorpheme')}</option>
          </select>
          <input
            className="panel-input"
            data-testid="transcription-search"
            aria-label={t(locale, 'workspace.annotation.find')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </span>
      </label>
      <label className="annotation-document-tools-check">
        <input
          type="checkbox"
          data-testid="transcription-exclude-ungrammatical"
          checked={excludeUngrammatical}
          onChange={(event) => setExcludeUngrammatical(event.target.checked)}
        />
        {t(locale, 'workspace.annotation.excludeUngrammatical')}
      </label>
      <label className="annotation-document-tools-field">
        <span>{t(locale, 'workspace.annotation.characterVariants')}</span>
        <input
          className="panel-input"
          data-testid="transcription-character-variants"
          aria-label={t(locale, 'workspace.annotation.characterVariants')}
          value={variantText}
          placeholder="ʔ='"
          onChange={(event) => setVariantText(event.target.value)}
          onBlur={() => {
            if (textId.length === 0) return;
            void saveCharacterVariantLines(textId, variantText).then(() =>
              queryClient.invalidateQueries({ queryKey: ['project-character-variants', textId] }),
            );
          }}
        />
      </label>
      {hits.length > 0 ? (
        <ul className="transcription-unit-search-results">
          {hits.map((hit) => (
            <li key={hit.unitId}>
              <button
                type="button"
                data-testid={`transcription-search-hit-${hit.unitId}`}
                onClick={() => {
                  const unit = units.find((item) => item.id === hit.unitId);
                  if (!unit) return;
                  onSelectUnit(unit);
                  requestPlayUnitRange(hit.startTime, hit.endTime);
                }}
              >
                <span>{hit.sentence}</span>
                {hit.match.length > 0 ? <span>{hit.match}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
