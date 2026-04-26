import { useId, useMemo, useState } from 'react';
import { t, type Locale } from '../i18n';
import { buildAnnotationStructuralPreviewViewModel } from '../pages/annotation/annotationStructuralPreview';
import type { StructuralRuleProfilePreview } from '../services/LinguisticService.structuralProfiles';

export type StructuralRuleProfileSandboxPanelProps = {
  locale: Locale;
  preview: StructuralRuleProfilePreview | null;
  pending?: boolean;
  errorMessage?: string;
  initialGloss?: string;
  onPreview: (glossText: string) => void;
  templateEnabled?: boolean;
  onImportTemplate?: (jsonText: string) => void | Promise<void>;
  onExportTemplate?: () => string | Promise<string>;
  onToggleEnabled?: (enabled: boolean) => void;
};

export function StructuralRuleProfileSandboxPanel({
  locale,
  preview,
  pending = false,
  errorMessage,
  initialGloss = '',
  onPreview,
  templateEnabled = true,
  onImportTemplate,
  onExportTemplate,
  onToggleEnabled,
}: StructuralRuleProfileSandboxPanelProps) {
  const templateSectionId = useId();
  const [glossText, setGlossText] = useState(initialGloss);
  const [templateJson, setTemplateJson] = useState('');
  const [templateError, setTemplateError] = useState('');
  const viewModel = useMemo(
    () => preview ? buildAnnotationStructuralPreviewViewModel(preview) : null,
    [preview],
  );

  return (
    <section className="workspace-card" aria-label={t(locale, 'workspace.structuralProfile.sandboxAriaLabel')}>
      <div className="workspace-card__header">
        <div>
          <h2 className="panel-title-primary">{t(locale, 'workspace.structuralProfile.cardTitle')}</h2>
          <p className="lm-subsection-description">
            {t(locale, 'workspace.structuralProfile.cardDescription')}
          </p>
        </div>
        {onToggleEnabled ? (
          <button type="button" className="btn btn-ghost" onClick={() => onToggleEnabled(!templateEnabled)}>
            {templateEnabled ? t(locale, 'workspace.structuralProfile.toggleDisable') : t(locale, 'workspace.structuralProfile.toggleEnable')}
          </button>
        ) : null}
      </div>

      <label className="lm-field lm-field-block">
        <span>{t(locale, 'workspace.structuralProfile.glossLabel')}</span>
        <textarea
          className="input lm-textarea"
          value={glossText}
          onChange={(event) => setGlossText(event.target.value)}
          placeholder={t(locale, 'workspace.structuralProfile.glossPlaceholder')}
        />
      </label>
      <button
        type="button"
        className="btn"
        disabled={pending || !glossText.trim()}
        onClick={() => onPreview(glossText)}
      >
        {pending ? t(locale, 'workspace.structuralProfile.previewPending') : t(locale, 'workspace.structuralProfile.previewButton')}
      </button>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {templateError ? <p role="alert">{templateError}</p> : null}

      {viewModel ? (
        <div className="ws-subsection">
          <h3 className="panel-title-secondary">{t(locale, 'workspace.structuralProfile.previewResultTitle')}</h3>
          <p className="lm-subsection-description">
            {viewModel.canConfirmWithoutReview ? t(locale, 'workspace.structuralProfile.reviewReady') : t(locale, 'workspace.structuralProfile.reviewNeeded')}
          </p>
          <div className="lm-field lm-field-block">
            <span>{t(locale, 'workspace.structuralProfile.segmentsLabel')}</span>
            <p className="lm-subsection-description">
              {viewModel.segments.map((segment) => `${segment.text}:${segment.kind}`).join(', ')}
            </p>
          </div>
          <div className="lm-field lm-field-block">
            <span>{t(locale, 'workspace.structuralProfile.boundariesLabel')}</span>
            <p className="lm-subsection-description">
              {viewModel.boundaries.map((boundary) => `${boundary.marker}:${boundary.type}`).join(', ')}
            </p>
          </div>
          <div className="lm-field lm-field-block">
            <span>{t(locale, 'workspace.structuralProfile.diagnosticsLabel')}</span>
            <p className="lm-subsection-description">
              {viewModel.diagnostics.map((diagnostic) => `${diagnostic.target}:${diagnostic.status}`).join(', ')}
            </p>
          </div>
        </div>
      ) : null}

      {(onImportTemplate || onExportTemplate) ? (
        <div className="ws-subsection">
          <h3 className="panel-title-secondary" id={templateSectionId}>
            {t(locale, 'workspace.structuralProfile.templateJsonTitle')}
          </h3>
          <textarea
            className="input lm-textarea"
            value={templateJson}
            onChange={(event) => setTemplateJson(event.target.value)}
            placeholder={t(locale, 'workspace.structuralProfile.templateJsonPlaceholder')}
            aria-labelledby={templateSectionId}
          />
          <div className="lm-inline-actions">
            {onImportTemplate ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!templateJson.trim()}
                onClick={() => {
                  setTemplateError('');
                  void (async () => {
                    try {
                      await onImportTemplate(templateJson);
                    } catch (error) {
                      setTemplateError(error instanceof Error ? error.message : t(locale, 'workspace.structuralProfile.importFailed'));
                    }
                  })();
                }}
              >
                {t(locale, 'workspace.structuralProfile.importButton')}
              </button>
            ) : null}
            {onExportTemplate ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setTemplateError('');
                  void (async () => {
                    try {
                      setTemplateJson(await onExportTemplate());
                    } catch (error) {
                      setTemplateError(error instanceof Error ? error.message : t(locale, 'workspace.structuralProfile.exportFailed'));
                    }
                  })();
                }}
              >
                {t(locale, 'workspace.structuralProfile.exportButton')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
