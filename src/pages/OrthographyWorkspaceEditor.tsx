import { LanguageIsoInput, type LanguageIsoInputValue } from '../components/LanguageIsoInput';
import { PanelSection } from '../components/ui/PanelSection';
import type { OrthographyDocType } from '../db';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import type { OrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import {
  resolveCatalogPriorityLabel,
  resolveCatalogReviewStatusLabel,
  resolveCatalogSourceLabel,
  type OrthographyDraft,
} from './orthographyWorkspacePage.utils';

type OrthographyWorkspaceEditorProps = {
  locale: Locale;
  builderMessages: OrthographyBuilderMessages;
  selectedOrthography: OrthographyDocType;
  selectedBadgeLabel?: string;
  draft: OrthographyDraft | null;
  languageInput: LanguageIsoInputValue;
  isDirty: boolean;
  saving: boolean;
  saveError: string;
  saveSuccess: string;
  onDraftChange: <K extends keyof OrthographyDraft>(key: K, value: OrthographyDraft[K]) => void;
  onLanguageInputChange: (value: LanguageIsoInputValue) => void;
  onResetDraft: () => void;
  onSaveDraft: () => void;
};

export function OrthographyWorkspaceEditor({
  locale,
  builderMessages,
  selectedOrthography,
  selectedBadgeLabel,
  draft,
  languageInput,
  isDirty,
  saving,
  saveError,
  saveSuccess,
  onDraftChange,
  onLanguageInputChange,
  onResetDraft,
  onSaveDraft,
}: OrthographyWorkspaceEditorProps) {
  return (
    <PanelSection
      className="orthography-workspace-basic-panel"
      title={t(locale, 'workspace.orthography.editTitle')}
      description={t(locale, 'workspace.orthography.editDescription')}
    >
      {isDirty ? <p className="orthography-workspace-state orthography-workspace-state-warning">{t(locale, 'workspace.orthography.unsavedHint')}</p> : null}
      {draft ? (
        <div className="orthography-workspace-form-stack">
          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionIdentityTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <div className="orthography-workspace-form-span-2">
                <LanguageIsoInput
                  locale={locale}
                  value={languageInput}
                  onChange={onLanguageInputChange}
                  nameLabel={t(locale, 'workspace.orthography.languageLabel')}
                  codeLabel={builderMessages.sourceLanguageCodeLabel}
                  namePlaceholder={t(locale, 'workspace.orthography.languageLabel')}
                  codePlaceholder={builderMessages.sourceLanguageCodePlaceholder}
                />
              </div>
              <label className="dialog-field">
                <span>{builderMessages.scriptTagLabel}</span>
                <input className="input" type="text" value={draft.scriptTag} onChange={(event) => onDraftChange('scriptTag', event.target.value)} placeholder={builderMessages.scriptTagPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.nameZhLabel}</span>
                <input className="input" type="text" value={draft.nameZh} onChange={(event) => onDraftChange('nameZh', event.target.value)} placeholder={builderMessages.nameZhPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.nameEnLabel}</span>
                <input className="input" type="text" value={draft.nameEn} onChange={(event) => onDraftChange('nameEn', event.target.value)} placeholder={builderMessages.nameEnPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.abbreviationLabel}</span>
                <input className="input" type="text" value={draft.abbreviation} onChange={(event) => onDraftChange('abbreviation', event.target.value)} placeholder={builderMessages.abbreviationPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.typeLabel}</span>
                <select className="input" value={draft.type} onChange={(event) => onDraftChange('type', event.target.value as OrthographyDraft['type'])}>
                  <option value="phonemic">{builderMessages.typePhonemic}</option>
                  <option value="phonetic">{builderMessages.typePhonetic}</option>
                  <option value="practical">{builderMessages.typePractical}</option>
                  <option value="historical">{builderMessages.typeHistorical}</option>
                  <option value="other">{builderMessages.typeOther}</option>
                </select>
              </label>
              <label className="dialog-field">
                <span>{builderMessages.advancedDirectionLabel}</span>
                <select className="input" value={draft.direction} onChange={(event) => onDraftChange('direction', event.target.value as OrthographyDraft['direction'])}>
                  <option value="ltr">{builderMessages.advancedDirectionLtr}</option>
                  <option value="rtl">{builderMessages.advancedDirectionRtl}</option>
                  <option value="ttb">{t(locale, 'workspace.orthography.directionTtb')}</option>
                  <option value="btt">{t(locale, 'workspace.orthography.directionBtt')}</option>
                </select>
              </label>
              <label className="dialog-field">
                <span>{builderMessages.advancedLocaleLabel}</span>
                <input className="input" type="text" value={draft.localeTag} onChange={(event) => onDraftChange('localeTag', event.target.value)} placeholder={builderMessages.localePlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.advancedRegionLabel}</span>
                <input className="input" type="text" value={draft.regionTag} onChange={(event) => onDraftChange('regionTag', event.target.value)} placeholder={builderMessages.regionPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{builderMessages.advancedVariantLabel}</span>
                <input className="input" type="text" value={draft.variantTag} onChange={(event) => onDraftChange('variantTag', event.target.value)} placeholder={builderMessages.variantPlaceholder} />
              </label>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionCatalogTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.catalogReviewStatusLabel')}</span>
                <select className="input" value={draft.catalogReviewStatus} onChange={(event) => onDraftChange('catalogReviewStatus', event.target.value as OrthographyDraft['catalogReviewStatus'])}>
                  <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                  <option value="needs-review">{resolveCatalogReviewStatusLabel(locale, 'needs-review')}</option>
                  <option value="verified-primary">{resolveCatalogReviewStatusLabel(locale, 'verified-primary')}</option>
                  <option value="verified-secondary">{resolveCatalogReviewStatusLabel(locale, 'verified-secondary')}</option>
                  <option value="historical">{resolveCatalogReviewStatusLabel(locale, 'historical')}</option>
                  <option value="legacy">{resolveCatalogReviewStatusLabel(locale, 'legacy')}</option>
                  <option value="experimental">{resolveCatalogReviewStatusLabel(locale, 'experimental')}</option>
                </select>
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.catalogPriorityLabel')}</span>
                <select className="input" value={draft.catalogPriority} onChange={(event) => onDraftChange('catalogPriority', event.target.value as OrthographyDraft['catalogPriority'])}>
                  <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                  <option value="primary">{resolveCatalogPriorityLabel(locale, 'primary')}</option>
                  <option value="secondary">{resolveCatalogPriorityLabel(locale, 'secondary')}</option>
                </select>
              </label>
              <div className="orthography-workspace-basic-grid orthography-workspace-form-span-2">
                <div><dt>{t(locale, 'workspace.orthography.catalogSourceLabel')}</dt><dd>{resolveCatalogSourceLabel(locale, selectedOrthography.catalogMetadata?.catalogSource)}</dd></div>
                <div><dt>{t(locale, 'workspace.orthography.catalogLabel')}</dt><dd>{selectedBadgeLabel ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                <div><dt>{t(locale, 'workspace.orthography.updatedAtLabel')}</dt><dd>{selectedOrthography.updatedAt ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
                <div><dt>{t(locale, 'workspace.orthography.catalogSourceNoteLabel')}</dt><dd>{selectedOrthography.catalogMetadata?.source ?? t(locale, 'workspace.orthography.notSet')}</dd></div>
              </div>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionExamplesTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{builderMessages.exemplarLabel}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.exemplarMain} onChange={(event) => onDraftChange('exemplarMain', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.auxiliaryExemplarLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.exemplarAuxiliary} onChange={(event) => onDraftChange('exemplarAuxiliary', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.numberExemplarLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.exemplarNumbers} onChange={(event) => onDraftChange('exemplarNumbers', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.punctuationExemplarLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.exemplarPunctuation} onChange={(event) => onDraftChange('exemplarPunctuation', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.indexExemplarLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.exemplarIndex} onChange={(event) => onDraftChange('exemplarIndex', event.target.value)} placeholder={builderMessages.exemplarPlaceholder} />
              </label>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionRenderingTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{builderMessages.primaryFontLabel}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.primaryFonts} onChange={(event) => onDraftChange('primaryFonts', event.target.value)} placeholder={builderMessages.primaryFontPlaceholder} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{builderMessages.fallbackFontLabel}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.fallbackFonts} onChange={(event) => onDraftChange('fallbackFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.monoFontLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.monoFonts} onChange={(event) => onDraftChange('monoFonts', event.target.value)} placeholder={builderMessages.fallbackFontPlaceholder} />
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.lineHeightScaleLabel')}</span>
                <input className="input" type="text" value={draft.lineHeightScale} onChange={(event) => onDraftChange('lineHeightScale', event.target.value)} />
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.sizeAdjustLabel')}</span>
                <input className="input" type="text" value={draft.sizeAdjust} onChange={(event) => onDraftChange('sizeAdjust', event.target.value)} />
              </label>
              <label className="orthography-builder-checkbox orthography-workspace-form-span-2">
                <input type="checkbox" checked={draft.bidiIsolate} onChange={(event) => onDraftChange('bidiIsolate', event.target.checked)} />
                <span>{builderMessages.bidiIsolationLabel}</span>
              </label>
              <label className="orthography-builder-checkbox orthography-workspace-form-span-2">
                <input type="checkbox" checked={draft.preferDirAttribute} onChange={(event) => onDraftChange('preferDirAttribute', event.target.checked)} />
                <span>{builderMessages.preferDirLabel}</span>
              </label>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionInputTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.keyboardLayoutLabel')}</span>
                <input className="input" type="text" value={draft.keyboardLayout} onChange={(event) => onDraftChange('keyboardLayout', event.target.value)} placeholder={t(locale, 'workspace.orthography.keyboardLayoutPlaceholder')} />
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.imeIdLabel')}</span>
                <input className="input" type="text" value={draft.imeId} onChange={(event) => onDraftChange('imeId', event.target.value)} placeholder={t(locale, 'workspace.orthography.imeIdPlaceholder')} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.deadKeysLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.deadKeys} onChange={(event) => onDraftChange('deadKeys', event.target.value)} placeholder={t(locale, 'workspace.orthography.deadKeysPlaceholder')} />
              </label>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionNormalizationTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.normalizationFormLabel')}</span>
                <select className="input" value={draft.normalizationForm} onChange={(event) => onDraftChange('normalizationForm', event.target.value as OrthographyDraft['normalizationForm'])}>
                  <option value="">{t(locale, 'workspace.orthography.notSet')}</option>
                  <option value="NFC">NFC</option>
                  <option value="NFD">NFD</option>
                  <option value="NFKC">NFKC</option>
                  <option value="NFKD">NFKD</option>
                </select>
              </label>
              <label className="dialog-field">
                <span>{t(locale, 'workspace.orthography.collationBaseLabel')}</span>
                <input className="input" type="text" value={draft.collationBase} onChange={(event) => onDraftChange('collationBase', event.target.value)} placeholder={t(locale, 'workspace.orthography.collationBasePlaceholder')} />
              </label>
              <label className="orthography-builder-checkbox orthography-workspace-form-span-2">
                <input type="checkbox" checked={draft.normalizationCaseSensitive} onChange={(event) => onDraftChange('normalizationCaseSensitive', event.target.checked)} />
                <span>{t(locale, 'workspace.orthography.normalizationCaseLabel')}</span>
              </label>
              <label className="orthography-builder-checkbox orthography-workspace-form-span-2">
                <input type="checkbox" checked={draft.normalizationStripDefaultIgnorables} onChange={(event) => onDraftChange('normalizationStripDefaultIgnorables', event.target.checked)} />
                <span>{t(locale, 'workspace.orthography.normalizationIgnorableLabel')}</span>
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.collationRulesLabel')}</span>
                <textarea className="input orthography-workspace-textarea orthography-workspace-codearea" value={draft.collationRules} onChange={(event) => onDraftChange('collationRules', event.target.value)} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.conversionRulesLabel')}</span>
                <textarea className="input orthography-workspace-textarea orthography-workspace-codearea" value={draft.conversionRulesJson} onChange={(event) => onDraftChange('conversionRulesJson', event.target.value)} placeholder={t(locale, 'workspace.orthography.conversionRulesPlaceholder')} />
              </label>
            </div>
          </section>

          <section className="orthography-workspace-subsection">
            <h3 className="orthography-workspace-subsection-title">{t(locale, 'workspace.orthography.sectionNotesTitle')}</h3>
            <div className="orthography-workspace-form-grid">
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.notesZhLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.notesZh} onChange={(event) => onDraftChange('notesZh', event.target.value)} />
              </label>
              <label className="dialog-field orthography-workspace-form-span-2">
                <span>{t(locale, 'workspace.orthography.notesEnLabel')}</span>
                <textarea className="input orthography-workspace-textarea" value={draft.notesEn} onChange={(event) => onDraftChange('notesEn', event.target.value)} />
              </label>
            </div>
          </section>
        </div>
      ) : null}

      {saveError ? <p className="orthography-workspace-state orthography-workspace-state-error">{saveError}</p> : null}
      {saveSuccess ? <p className="orthography-workspace-state orthography-workspace-state-success">{saveSuccess}</p> : null}

      <div className="orthography-workspace-form-actions">
        <button type="button" className="btn btn-ghost" onClick={onResetDraft} disabled={!draft || saving || !isDirty}>
          {t(locale, 'workspace.orthography.resetButton')}
        </button>
        <button type="button" className="btn" onClick={onSaveDraft} disabled={!draft || saving || !isDirty}>
          {saving ? t(locale, 'workspace.orthography.saving') : t(locale, 'workspace.orthography.saveButton')}
        </button>
      </div>
    </PanelSection>
  );
}