import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAppSidePaneHostOptional } from '../../contexts/AppSidePaneContext';
import { t, tf, useLocale } from '../../i18n';
import type { AnnotationAutoGlossController } from '../useAnnotationAutoGlossController';
import type { AnnotationRetokenizeController } from '../useAnnotationRetokenizeController';
import type { AnnotationUnitMetaController } from '../useAnnotationUnitMetaController';
import type { AnnotationValidatorPanelController } from '../useAnnotationValidatorPanelController';
import type { AnnotationIgtRow } from '../useAnnotationWorkspaceController';
import { AnnotationIgtUnitExtras } from './AnnotationIgtUnitExtras';

const EXPORTS = [
  ['cldf', 'workspace.annotation.exportCldf'],
  ['conllu', 'workspace.annotation.exportConllu'],
  ['ligt', 'workspace.annotation.exportLigt'],
  ['latex', 'workspace.annotation.exportLatex'],
  ['flex', 'workspace.annotation.exportFlex'],
  ['elan', 'workspace.annotation.exportElan'],
] as const;

export type AnnotationDocumentToolsProps = {
  isEmpty: boolean;
  unitCount: number;
  transcriptionHref: string;
  structuralProfilesHref: string;
  validatorProfileId: string;
  searchQuery: string;
  searchMode: 'surface' | 'word' | 'morpheme';
  excludeUngrammatical: boolean;
  variantText: string;
  showWave: boolean;
  showSpectrum: boolean;
  showPitch: boolean;
  onSearchQuery: (value: string) => void;
  onSearchMode: (value: 'surface' | 'word' | 'morpheme') => void;
  onExcludeUngrammatical: (value: boolean) => void;
  onVariantText: (value: string) => void;
  onToggleWave: () => void;
  onToggleSpectrum: () => void;
  onTogglePitch: () => void;
  focused: {
    row: AnnotationIgtRow;
    unitMeta: AnnotationUnitMetaController;
    autoGloss: AnnotationAutoGlossController;
    retokenize: AnnotationRetokenizeController;
    validator: AnnotationValidatorPanelController;
    mweReady: boolean;
    onConfirmMwe: () => void;
    onExportSentence: () => void;
    onExportAnalysis: (kind: (typeof EXPORTS)[number][0]) => void;
    onFocusInput: (unitId: string) => void;
  } | null;
};

export function AnnotationDocumentToolsSlot(props: AnnotationDocumentToolsProps) {
  const host = useAppSidePaneHostOptional();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [placed, setPlaced] = useState(false);
  useLayoutEffect(() => {
    setSlot(host ? document.getElementById('app-side-pane-body-slot') : null);
    setPlaced(true);
  }, [host]);
  if (!placed) return null;
  const node = <AnnotationDocumentTools {...props} />;
  if (slot) return createPortal(node, slot);
  return node;
}

function AnnotationDocumentTools(props: AnnotationDocumentToolsProps) {
  const locale = useLocale();
  const focused = props.focused;
  const retokenize = focused?.retokenize;
  const applyDisabled =
    retokenize === undefined ||
    focused === null ||
    retokenize.previewUnitId !== focused.row.id ||
    retokenize.unchanged ||
    retokenize.proposedForms.length === 0;
  return (
    <div className="annotation-document-tools" data-testid="annotation-document-tools">
      <div className="annotation-document-tools-nav">
        <span className="app-side-pane-feature-badge">
          {t(locale, 'workspace.annotation.badge')}
        </span>
        <p className="app-side-pane-feature-summary">
          {props.isEmpty
            ? t(locale, 'workspace.annotation.empty')
            : tf(locale, 'workspace.annotation.unitCount', { count: props.unitCount })}
        </p>
        <Link className="app-side-pane-feature-link" to={props.transcriptionHref}>
          {t(locale, 'workspace.annotation.openTranscription')}
        </Link>
        <p className="app-side-pane-feature-summary">
          {tf(locale, 'workspace.annotation.validatorTemplate', { id: props.validatorProfileId })}
        </p>
        <Link className="app-side-pane-feature-link" to={props.structuralProfilesHref}>
          {t(locale, 'workspace.annotation.openStructuralProfiles')}
        </Link>
      </div>
      <label className="annotation-document-tools-field">
        <span>{t(locale, 'workspace.annotation.find')}</span>
        <span className="annotation-document-tools-row">
          <select
            data-testid="annotation-search-mode"
            value={props.searchMode}
            onChange={(event) =>
              props.onSearchMode(event.target.value as 'surface' | 'word' | 'morpheme')
            }
          >
            <option value="surface">{t(locale, 'workspace.annotation.searchSurface')}</option>
            <option value="word">{t(locale, 'workspace.annotation.searchWord')}</option>
            <option value="morpheme">{t(locale, 'workspace.annotation.searchMorpheme')}</option>
          </select>
          <input
            data-testid="annotation-search"
            aria-label={t(locale, 'workspace.annotation.find')}
            value={props.searchQuery}
            onChange={(event) => props.onSearchQuery(event.target.value)}
          />
        </span>
      </label>
      <label className="annotation-document-tools-check">
        <input
          type="checkbox"
          data-testid="annotation-exclude-ungrammatical"
          checked={props.excludeUngrammatical}
          onChange={(event) => props.onExcludeUngrammatical(event.target.checked)}
        />
        {t(locale, 'workspace.annotation.excludeUngrammatical')}
      </label>
      <label className="annotation-document-tools-field">
        <span>{t(locale, 'workspace.annotation.characterVariants')}</span>
        <input
          data-testid="annotation-character-variants"
          aria-label={t(locale, 'workspace.annotation.characterVariants')}
          value={props.variantText}
          placeholder="ʔ='"
          onChange={(event) => props.onVariantText(event.target.value)}
        />
      </label>
      <div className="annotation-document-tools-checks">
        <Check
          testId="annotation-acoustic-wave"
          checked={props.showWave}
          label={t(locale, 'workspace.annotation.acousticWave')}
          onChange={props.onToggleWave}
        />
        <Check
          testId="annotation-acoustic-spectrum"
          checked={props.showSpectrum}
          label={t(locale, 'workspace.annotation.acousticSpectrum')}
          onChange={props.onToggleSpectrum}
        />
        <Check
          testId="annotation-acoustic-pitch"
          checked={props.showPitch}
          label={t(locale, 'workspace.annotation.acousticPitch')}
          onChange={props.onTogglePitch}
        />
      </div>
      {focused ? (
        <div className="annotation-document-tools-sentence">
          <p className="app-side-pane-feature-summary">
            {t(locale, 'workspace.annotation.sidePaneCurrent')}
          </p>
          {focused.row.tokens.length === 0 && focused.row.surface.length > 0 ? (
            <ToolButton
              testId={`annotation-igt-segment-${focused.row.id}`}
              label={t(locale, 'workspace.annotation.segmentWords')}
              onClick={() => focused.retokenize.onPreview(focused.row.id)}
            />
          ) : null}
          {focused.row.tokens.length > 0 ? (
            <>
              <ToolButton
                testId={`annotation-igt-retokenize-preview-${focused.row.id}`}
                label={t(locale, 'workspace.annotation.retokenizePreview')}
                onClick={() => focused.retokenize.onPreview(focused.row.id)}
              />
              <ToolButton
                testId={`annotation-igt-retokenize-apply-${focused.row.id}`}
                label={t(locale, 'workspace.annotation.retokenizeApply')}
                disabled={applyDisabled}
                onClick={() => focused.retokenize.onApply(focused.row.id)}
              />
              {focused.retokenize.forceUnitId === focused.row.id ? (
                <ToolButton
                  testId={`annotation-igt-retokenize-overwrite-${focused.row.id}`}
                  label={t(locale, 'workspace.annotation.retokenizeOverwrite')}
                  onClick={() => focused.retokenize.onOverwrite(focused.row.id)}
                />
              ) : null}
              {focused.retokenize.snapshotUnitId === focused.row.id ? (
                <ToolButton
                  testId={`annotation-igt-retokenize-restore-${focused.row.id}`}
                  label={t(locale, 'workspace.annotation.retokenizeRestore')}
                  onClick={() => focused.retokenize.onRestore(focused.row.id)}
                />
              ) : null}
              <ToolButton
                testId={`annotation-igt-autogloss-preview-${focused.row.id}`}
                label={t(locale, 'workspace.annotation.autoGlossPreview')}
                onClick={() => focused.autoGloss.onPreview(focused.row.id)}
              />
              <ToolButton
                testId={`annotation-igt-autogloss-apply-${focused.row.id}`}
                label={t(locale, 'workspace.annotation.autoGlossApply')}
                disabled={
                  focused.autoGloss.previewUnitId !== focused.row.id ||
                  focused.autoGloss.matches.length === 0
                }
                onClick={() => focused.autoGloss.onApply(focused.row.id)}
              />
              <ToolButton
                testId={`annotation-igt-export-sentence-${focused.row.id}`}
                label={t(locale, 'workspace.annotation.exportSentence')}
                onClick={focused.onExportSentence}
              />
              {EXPORTS.map(([kind, key]) => (
                <ToolButton
                  key={kind}
                  testId={`annotation-igt-export-${kind}-${focused.row.id}`}
                  label={t(locale, key)}
                  onClick={() => focused.onExportAnalysis(kind)}
                />
              ))}
            </>
          ) : focused.row.surface.length > 0 ? (
            <ToolButton
              testId={`annotation-igt-segment-apply-${focused.row.id}`}
              label={t(locale, 'workspace.annotation.retokenizeApply')}
              disabled={applyDisabled}
              onClick={() => focused.retokenize.onApply(focused.row.id)}
            />
          ) : null}
          {focused.mweReady ? (
            <ToolButton
              testId={`annotation-igt-mwe-confirm-${focused.row.id}`}
              label={t(locale, 'workspace.annotation.markMwe')}
              onClick={focused.onConfirmMwe}
            />
          ) : null}
          <AnnotationIgtUnitExtras
            unitId={focused.row.id}
            matches={[]}
            unitMeta={focused.unitMeta}
            retokenize={focused.retokenize}
            validator={focused.validator}
            onFocusInput={focused.onFocusInput}
            showNote
            showCertainty
            showReadouts={false}
            turn={{
              ...(focused.row.addressee ? { addressee: focused.row.addressee } : {}),
              ...(focused.row.ungrammatical ? { ungrammatical: focused.row.ungrammatical } : {}),
              ...(focused.row.actualForm ? { actualForm: focused.row.actualForm } : {}),
              ...(focused.row.targetForm ? { targetForm: focused.row.targetForm } : {}),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Check({
  testId,
  checked,
  label,
  onChange,
}: {
  testId: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="annotation-document-tools-check">
      <input type="checkbox" data-testid={testId} checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function ToolButton({
  testId,
  label,
  disabled,
  onClick,
}: {
  testId: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="annotation-igt-action"
      data-testid={testId}
      {...(disabled ? { disabled: true } : {})}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
