import { useMemo, useState } from 'react';
import { buildAnnotationStructuralPreviewViewModel } from '../pages/annotation/annotationStructuralPreview';
import type { StructuralRuleProfilePreview } from '../services/LinguisticService.structuralProfiles';

export type StructuralRuleProfileSandboxPanelProps = {
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
  const [glossText, setGlossText] = useState(initialGloss);
  const [templateJson, setTemplateJson] = useState('');
  const [templateError, setTemplateError] = useState('');
  const viewModel = useMemo(
    () => preview ? buildAnnotationStructuralPreviewViewModel(preview) : null,
    [preview],
  );

  return (
    <section className="workspace-card" aria-label="Structural profile sandbox">
      <div className="workspace-card__header">
        <div>
          <h2>Structural Profile</h2>
          <p>Preview configurable gloss structure rules before they write candidate analysis graphs.</p>
        </div>
        {onToggleEnabled ? (
          <button type="button" onClick={() => onToggleEnabled(!templateEnabled)}>
            {templateEnabled ? 'Disable' : 'Enable'}
          </button>
        ) : null}
      </div>

      <label>
        Gloss sandbox
        <textarea
          value={glossText}
          onChange={(event) => setGlossText(event.target.value)}
          placeholder="1SG=COP dog-PL"
        />
      </label>
      <button type="button" disabled={pending || !glossText.trim()} onClick={() => onPreview(glossText)}>
        {pending ? 'Previewing...' : 'Preview'}
      </button>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {templateError ? <p role="alert">{templateError}</p> : null}

      {viewModel ? (
        <div>
          <h3>Preview result</h3>
          <p>{viewModel.canConfirmWithoutReview ? 'Ready for confirmation.' : 'Needs review before confirmation.'}</p>
          <dl>
            <dt>Segments</dt>
            <dd>{viewModel.segments.map((segment) => `${segment.text}:${segment.kind}`).join(', ')}</dd>
            <dt>Boundaries</dt>
            <dd>{viewModel.boundaries.map((boundary) => `${boundary.marker}:${boundary.type}`).join(', ')}</dd>
            <dt>Diagnostics</dt>
            <dd>{viewModel.diagnostics.map((diagnostic) => `${diagnostic.target}:${diagnostic.status}`).join(', ')}</dd>
          </dl>
        </div>
      ) : null}

      {(onImportTemplate || onExportTemplate) ? (
        <div>
          <h3>Template JSON</h3>
          <textarea
            value={templateJson}
            onChange={(event) => setTemplateJson(event.target.value)}
            placeholder="Paste exported StructuralRuleProfile JSON"
          />
          {onImportTemplate ? (
            <button
              type="button"
              disabled={!templateJson.trim()}
              onClick={() => {
                setTemplateError('');
                void (async () => {
                  try {
                    await onImportTemplate(templateJson);
                  } catch (error) {
                    setTemplateError(error instanceof Error ? error.message : 'Import failed');
                  }
                })();
              }}
            >
              Import
            </button>
          ) : null}
          {onExportTemplate ? (
            <button
              type="button"
              onClick={() => {
                setTemplateError('');
                void (async () => {
                  try {
                    setTemplateJson(await onExportTemplate());
                  } catch (error) {
                    setTemplateError(error instanceof Error ? error.message : 'Export failed');
                  }
                })();
              }}
            >
              Export
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
