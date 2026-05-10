import { memo } from 'react';
import type { AnalysisBottomTab } from '../AiAnalysisPanel.types';
import type { AiAnalysisPanelAcousticTabModel } from '../useAiAnalysisPanelAcousticModel';
import { PanelSection } from '../ui/PanelSection';
import { t, tf } from '../../i18n';

export const AiAnalysisPanelAcousticExportSection = memo(
  function AiAnalysisPanelAcousticExportSection({
    activeTab,
    model,
  }: {
    activeTab: AnalysisBottomTab;
    model: AiAnalysisPanelAcousticTabModel;
  }) {
    const {
      locale,
      acousticDetail,
      acousticDetailFullMedia,
      exportScope,
      setExportScope,
      acousticExporting,
      acousticExportError,
      exportTargetDetail,
      exportBatchDetails,
      batchSelectionCount,
      batchSkippedCount,
      droppedBatchLabelText,
      isBatchExportScope,
      canExportBatch,
      handleExportAcoustic,
    } = model;

    return (
      <>
        {activeTab === 'acoustic' &&
        (acousticDetail || acousticDetailFullMedia || canExportBatch) ? (
          <PanelSection
            className="transcription-analysis-acoustic-section transcription-analysis-acoustic-export-section"
            title={t(locale, 'ai.acoustic.exportTitle')}
            description={t(locale, 'ai.acoustic.exportDescription')}
          >
            <div className="transcription-analysis-acoustic-export-scope">
              <button
                type="button"
                className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'selection' ? 'is-active' : ''}`}
                onClick={() => setExportScope('selection')}
                disabled={acousticExporting}
              >
                {t(locale, 'ai.acoustic.exportScopeSelection')}
              </button>
              <button
                type="button"
                className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'full_media' ? 'is-active' : ''}`}
                onClick={() => setExportScope('full_media')}
                disabled={acousticExporting || !acousticDetailFullMedia}
              >
                {t(locale, 'ai.acoustic.exportScopeFullMedia')}
              </button>
              <button
                type="button"
                className={`transcription-analysis-acoustic-nav-btn ${exportScope === 'batch_selection' ? 'is-active' : ''}`}
                onClick={() => setExportScope('batch_selection')}
                disabled={acousticExporting || !canExportBatch}
              >
                {t(locale, 'ai.acoustic.exportScopeBatchSelection')}
              </button>
            </div>
            <div className="transcription-analysis-acoustic-export-actions">
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  void handleExportAcoustic('csv');
                }}
                disabled={
                  acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)
                }
              >
                {t(locale, 'ai.acoustic.exportCsv')}
              </button>
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  void handleExportAcoustic('json');
                }}
                disabled={
                  acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)
                }
              >
                {t(locale, 'ai.acoustic.exportJson')}
              </button>
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  void handleExportAcoustic('pitchtier');
                }}
                disabled={acousticExporting || isBatchExportScope || !exportTargetDetail}
              >
                {t(locale, 'ai.acoustic.exportPitchTier')}
              </button>
              <button
                type="button"
                className="transcription-analysis-acoustic-nav-btn"
                onClick={() => {
                  void handleExportAcoustic('json_research');
                }}
                disabled={
                  acousticExporting || (isBatchExportScope ? !canExportBatch : !exportTargetDetail)
                }
              >
                {t(locale, 'ai.acoustic.exportJsonResearch')}
              </button>
            </div>
            {isBatchExportScope ? (
              <p className="transcription-analysis-acoustic-export-note">
                {tf(locale, 'ai.acoustic.exportBatchSelectionCount', {
                  count: exportBatchDetails.length,
                })}
              </p>
            ) : exportTargetDetail ? (
              <p className="transcription-analysis-acoustic-export-note">
                {tf(locale, 'ai.acoustic.exportSampleCount', {
                  count: exportTargetDetail.sampleCount,
                })}
              </p>
            ) : null}
            {isBatchExportScope ? (
              <p className="transcription-analysis-acoustic-export-note">
                {t(locale, 'ai.acoustic.exportPitchTierBatchNote')}
              </p>
            ) : null}
            {batchSkippedCount > 0 ? (
              <p className="transcription-analysis-acoustic-export-note">
                {tf(locale, 'ai.acoustic.exportBatchSelectionSummary', {
                  selected: String(batchSelectionCount),
                  exported: String(exportBatchDetails.length),
                  skipped: String(batchSkippedCount),
                })}
              </p>
            ) : null}
            {batchSkippedCount > 0 && droppedBatchLabelText ? (
              <p className="transcription-analysis-acoustic-export-note">
                {tf(locale, 'ai.acoustic.exportBatchSelectionDropped', {
                  ids: droppedBatchLabelText,
                })}
              </p>
            ) : null}
            {acousticExportError ? (
              <p className="transcription-analysis-acoustic-export-note" role="status">
                {acousticExportError}
              </p>
            ) : null}
            <p className="transcription-analysis-acoustic-export-note">
              {t(locale, 'ai.acoustic.exportBackendNote')}
            </p>
          </PanelSection>
        ) : null}
      </>
    );
  },
);
