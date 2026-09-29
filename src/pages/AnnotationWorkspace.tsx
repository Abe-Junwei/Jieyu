import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnnotationDocumentToolsSlot } from './annotation/AnnotationDocumentTools';
import { useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../i18n';
import { AnnotationIgtRowView } from './annotation/AnnotationIgtRow';
import { useAnnotationAutoGlossController } from './useAnnotationAutoGlossController';
import { useAnnotationMorphologyController } from './useAnnotationMorphologyController';
import { useAnnotationRetokenizeController } from './useAnnotationRetokenizeController';
import { useAnnotationValidatorPanelController } from './useAnnotationValidatorPanelController';
import { useAnnotationSegmentPlaybackController } from './useAnnotationSegmentPlaybackController';
import { useAnnotationUnitMetaController } from './useAnnotationUnitMetaController';
import { useAnnotationMweController } from './useAnnotationMweController';
import { useAnnotationPosBatchController } from './useAnnotationPosBatchController';
import { useAnnotationRelationController } from './useAnnotationRelationController';
import { useAnnotationAlternativeAnalysisController } from './useAnnotationAlternativeAnalysisController';
import { useAnnotationWorkspaceController } from './useAnnotationWorkspaceController';
import { useAnnotationSentenceAcoustic } from './useAnnotationSentenceAcoustic';
import { glossSuggestionForToken } from './annotation/annotationGlossSuggestion';
import { buildAnnotationSentenceExport } from './annotation/annotationSentenceExport';
import { downloadTextFile } from '../annotation/analysisGraphExport';
import { filterAnnotationUnits } from './annotation/annotationRowSearch';
import { parseCharacterVariantLines } from './annotation/annotationCharacterVariants';

export function AnnotationWorkspace() {
  const locale = useLocale();
  const [showWave, setShowWave] = useState(false);
  const [showSpectrum, setShowSpectrum] = useState(false);
  const [showPitch, setShowPitch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'surface' | 'word' | 'morpheme'>('surface');
  const [excludeUngrammatical, setExcludeUngrammatical] = useState(false);
  const [variantText, setVariantText] = useState('');
  const controller = useAnnotationWorkspaceController();
  const glossSuggestions = useMemo(() => {
    const tokens = controller.rows.flatMap((row) => row.tokens);
    const suggestions: Record<string, string> = {};
    for (const token of tokens) {
      const suggestion = glossSuggestionForToken(
        tokens,
        token.id,
        parseCharacterVariantLines(variantText),
      );
      if (suggestion) suggestions[token.id] = suggestion;
    }
    return suggestions;
  }, [controller.rows, variantText]);
  const focusedRow = controller.rows.find((row) => row.id === controller.focusedUnitId);
  const sentenceAcoustic = useAnnotationSentenceAcoustic({
    textId: controller.textId,
    mediaId: focusedRow?.mediaId ?? '',
    startTime: focusedRow?.startTime ?? 0,
    endTime: focusedRow?.endTime ?? 0,
    enabled: focusedRow !== undefined && !controller.isLoading,
  });
  const morphology = useAnnotationMorphologyController({
    textId: controller.textId,
    rows: controller.rows,
    reloadWorkspace: controller.reload,
  });
  const visibleRows = useMemo(() => {
    const wordFormsByUnit = new Map(
      controller.rows.map((row) => [row.id, row.tokens.map((token) => token.form)] as const),
    );
    const morphemeFormsByUnit = new Map(
      controller.rows.map((row) => [
        row.id,
        row.tokens.flatMap((token) =>
          (morphology.morphsByTokenId[token.id] ?? []).map((morph) => morph.form),
        ),
      ]),
    );
    return filterAnnotationUnits(controller.rows, {
      query: searchQuery,
      mode: searchMode,
      excludeUngrammatical,
      wordFormsByUnit,
      morphemeFormsByUnit,
    });
  }, [controller.rows, excludeUngrammatical, morphology.morphsByTokenId, searchMode, searchQuery]);
  const playback = useAnnotationSegmentPlaybackController(controller.textId);
  const unitMeta = useAnnotationUnitMetaController({
    textId: controller.textId,
    focusedUnitId: controller.focusedUnitId,
    rows: controller.rows,
    reloadWorkspace: controller.reload,
  });
  const autoGloss = useAnnotationAutoGlossController({
    drafts: controller.drafts,
    rows: controller.rows,
    reloadWorkspace: controller.reload,
  });
  const retokenize = useAnnotationRetokenizeController({
    textId: controller.textId,
    languageId: controller.languageId,
    drafts: controller.drafts,
    rows: controller.rows,
    reloadWorkspace: controller.reload,
  });
  const mwe = useAnnotationMweController(controller.textId, controller.reload);
  const posBatch = useAnnotationPosBatchController(controller.reload, controller.clearTokenDrafts);
  const relations = useAnnotationRelationController(controller.textId, controller.reload);
  const alternatives = useAnnotationAlternativeAnalysisController(
    controller.textId,
    controller.reload,
  );
  const validator = useAnnotationValidatorPanelController({
    focusedUnitId: controller.focusedUnitId,
    rows: controller.rows,
    drafts: controller.drafts,
  });

  useRegisterAppSidePane({
    title: t(locale, 'workspace.annotation.sidePaneTitle'),
    subtitle: t(locale, 'workspace.annotation.sidePaneSubtitle'),
    content: null,
  });

  const notices = [
    autoGloss.saveNotice,
    retokenize.saveNotice,
    unitMeta.saveNotice,
    morphology.saveNotice,
    controller.saveNotice,
  ];
  const activeNotice =
    notices.find((notice) => notice.kind === 'error') ??
    notices.find((notice) => notice.kind === 'saving') ??
    notices.find((notice) => notice.kind === 'saved') ??
    controller.saveNotice;
  const saveStatusText =
    activeNotice.kind === 'saving'
      ? t(locale, 'workspace.annotation.saving')
      : activeNotice.kind === 'saved'
        ? t(locale, 'workspace.annotation.saveSaved')
        : activeNotice.kind === 'error'
          ? tf(locale, 'workspace.annotation.saveFailed', {
              message: activeNotice.message,
            })
          : playback.lastOutcome === 'skipped'
            ? t(locale, 'workspace.annotation.playbackSkipped')
            : '';

  return (
    <section
      className="panel annotation-workspace"
      data-testid="annotation-workspace"
      aria-labelledby="annotation-workspace-title"
      tabIndex={0}
      onKeyDown={(event) => {
        const action = controller.onKeyDown(event);
        if (action === 'playToggle') {
          void playback.onPlayToggle(controller.focusedUnitId, controller.rows);
        }
      }}
    >
      <header className="annotation-workspace-hero">
        <span className="annotation-workspace-badge">
          {t(locale, 'workspace.annotation.badge')}
        </span>
        <h2 id="annotation-workspace-title">{t(locale, 'workspace.annotation.title')}</h2>
        <p className="annotation-workspace-summary">{t(locale, 'workspace.annotation.summary')}</p>
        <Link className="annotation-workspace-return" to={controller.transcriptionHref}>
          {t(locale, 'workspace.annotation.openTranscription')}
        </Link>
        {controller.translationLayers.length > 1 ? (
          <label className="annotation-translation-layer">
            {t(locale, 'workspace.annotation.translationLayer')}
            <select
              data-testid="annotation-translation-layer"
              value={controller.activeTranslationLayerId}
              onChange={(event) => controller.onSelectTranslationLayer(event.target.value)}
            >
              {controller.translationLayers.map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {controller.isEmpty ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.empty')}</p>
      ) : controller.isLoading ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.loading')}</p>
      ) : controller.loadError.length > 0 ? (
        <p className="annotation-workspace-empty">
          {t(locale, 'workspace.annotation.errorPrefix')} {controller.loadError}
        </p>
      ) : controller.rows.length === 0 ? (
        <p className="annotation-workspace-empty">{t(locale, 'workspace.annotation.emptyList')}</p>
      ) : (
        <div className="annotation-workspace-body">
          <p
            className={
              saveStatusText.length === 0
                ? 'annotation-workspace-keyboard annotation-workspace-keyboard-quiet'
                : 'annotation-workspace-keyboard'
            }
            data-testid="annotation-keyboard-status"
            data-mode={controller.keyboardMode}
            data-action={controller.lastAction}
            data-save={activeNotice.kind}
            data-playback={playback.lastOutcome}
          >
            {saveStatusText}
          </p>
          <AnnotationDocumentToolsSlot
            isEmpty={controller.isEmpty}
            unitCount={controller.unitCount}
            transcriptionHref={controller.transcriptionHref}
            structuralProfilesHref={morphology.structuralProfilesHref}
            validatorProfileId={morphology.validatorProfileId}
            searchQuery={searchQuery}
            searchMode={searchMode}
            excludeUngrammatical={excludeUngrammatical}
            variantText={variantText}
            showWave={showWave}
            showSpectrum={showSpectrum}
            showPitch={showPitch}
            onSearchQuery={setSearchQuery}
            onSearchMode={setSearchMode}
            onExcludeUngrammatical={setExcludeUngrammatical}
            onVariantText={setVariantText}
            onToggleWave={() => setShowWave((current) => !current)}
            onToggleSpectrum={() => setShowSpectrum((current) => !current)}
            onTogglePitch={() => setShowPitch((current) => !current)}
            focused={
              focusedRow
                ? {
                    row: focusedRow,
                    unitMeta,
                    autoGloss,
                    retokenize,
                    validator,
                    mweReady: (mwe.selectedByUnit[focusedRow.id] ?? []).length >= 2,
                    onConfirmMwe: () => {
                      void mwe.confirm({
                        row: focusedRow,
                        tokenDrafts: controller.drafts,
                        morphDrafts: morphology.drafts,
                        morphsByTokenId: morphology.morphsByTokenId,
                        linksByTokenId: morphology.linksByTokenId,
                      });
                    },
                    onExportSentence: () => {
                      const record = buildAnnotationSentenceExport({
                        textId: controller.textId,
                        unitId: focusedRow.id,
                        ...(focusedRow.speakerName ? { speakerId: focusedRow.speakerName } : {}),
                        startTime: focusedRow.startTime,
                        endTime: focusedRow.endTime,
                        surface: focusedRow.surface,
                        translation: focusedRow.translation,
                        tokens: focusedRow.tokens.map((token) => {
                          const senseId = morphology.linksByTokenId[token.id]?.senseId;
                          return {
                            id: token.id,
                            form: token.form,
                            gloss: token.gloss,
                            pos: token.pos,
                            ...(senseId ? { senseId } : {}),
                          };
                        }),
                      });
                      downloadTextFile(
                        `${focusedRow.id}.sentence.json`,
                        JSON.stringify(record, null, 2),
                        'application/json',
                      );
                    },
                    onExportAnalysis: (kind) => {
                      mwe.exportAnalysis(
                        {
                          row: focusedRow,
                          tokenDrafts: controller.drafts,
                          morphDrafts: morphology.drafts,
                          morphsByTokenId: morphology.morphsByTokenId,
                          linksByTokenId: morphology.linksByTokenId,
                        },
                        kind,
                      );
                    },
                    onFocusInput: controller.onFocusInput,
                  }
                : null
            }
          />
          <ul className="annotation-igt-list">
            {visibleRows.map((row) => (
              <AnnotationIgtRowView
                key={row.id}
                row={row}
                focused={row.id === controller.focusedUnitId}
                {...(row.id === controller.focusedUnitId ? { sentenceAcoustic } : {})}
                acousticLayers={{ showWave, showSpectrum, showPitch }}
                textLanguageId={controller.languageId}
                glossSuggestions={glossSuggestions}
                onAcceptGlossSuggestion={controller.onAcceptGlossSuggestion}
                onCiteOccurrence={controller.onCiteOccurrence}
                onSaveTokenLanguage={controller.onSaveTokenLanguage}
                inputFocused={controller.keyboardMode === 'inputFocused'}
                drafts={controller.drafts}
                morphology={morphology}
                unitMeta={unitMeta}
                autoGloss={autoGloss}
                retokenize={retokenize}
                validator={validator}
                playing={playback.playingUnitId === row.id}
                onPlay={(unitId) => {
                  void playback.onPlayToggle(unitId, controller.rows);
                }}
                onFocusRow={controller.onFocusRow}
                onFocusInput={controller.onFocusInput}
                onTokenDraftChange={controller.onTokenDraftChange}
                mweSelectedIds={mwe.selectedByUnit[row.id] ?? []}
                mweError={row.id === controller.focusedUnitId ? mwe.error : ''}
                onToggleMweToken={mwe.toggle}
                onApplyPosByForm={(unitId, tokenId, pos) => {
                  const target = controller.rows.find((item) => item.id === unitId);
                  if (
                    target === undefined ||
                    !target.tokens.some((token) => token.id === tokenId)
                  ) {
                    return;
                  }
                  void posBatch.apply({
                    rows: controller.rows,
                    drafts: controller.drafts,
                    sourceTokenId: tokenId,
                    pos,
                  });
                }}
                relationError={row.id === controller.focusedUnitId ? relations.error : ''}
                alternativeError={row.id === controller.focusedUnitId ? alternatives.error : ''}
                posError={row.id === controller.focusedUnitId ? posBatch.error : ''}
                onAddAlternative={(unitId, tokenId, pos) => {
                  const target = controller.rows.find((item) => item.id === unitId);
                  if (!target) return;
                  void alternatives.addPos({
                    row: target,
                    tokenDrafts: controller.drafts,
                    morphDrafts: morphology.drafts,
                    morphsByTokenId: morphology.morphsByTokenId,
                    linksByTokenId: morphology.linksByTokenId,
                    tokenId,
                    pos,
                  });
                }}
                onSelectAlternative={(unitId, relationId) => {
                  const target = controller.rows.find((item) => item.id === unitId);
                  if (!target) return;
                  void alternatives.select({
                    row: target,
                    tokenDrafts: controller.drafts,
                    morphDrafts: morphology.drafts,
                    morphsByTokenId: morphology.morphsByTokenId,
                    linksByTokenId: morphology.linksByTokenId,
                    relationId,
                  });
                }}
                onMarkRelation={(unitId, mark) => {
                  const target = controller.rows.find((item) => item.id === unitId);
                  if (!target) return;
                  void relations.apply({
                    row: target,
                    tokenDrafts: controller.drafts,
                    morphDrafts: morphology.drafts,
                    morphsByTokenId: morphology.morphsByTokenId,
                    linksByTokenId: morphology.linksByTokenId,
                    mark,
                  });
                }}
                onWriteFormsToSurface={controller.onWriteFormsToSurface}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
