import { useId, useMemo, useState } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useLocale } from '../i18n';
import { getProjectSetupDialogMessages } from '../i18n/projectSetupDialogMessages';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';
import { getOrthographyCatalogGroupLabel, getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { DialogShell } from './ui/DialogShell';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { buildLanguageInputSeed, getDisplayedLanguageInputLabel, normalizeLanguageInputCode } from '../utils/languageInputHostState';
import { focusFirstInvalidLanguageCodeInput } from '../utils/focusInvalidLanguageInput';

type ProjectSetupDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
};

export function ProjectSetupDialog({ isOpen, onClose, onSubmit }: ProjectSetupDialogProps) {
  const locale = useLocale();
  const { languageOptions, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale);
  const messages = getProjectSetupDialogMessages(locale);
  const fieldIdPrefix = useId();
  const emptyLanguageInput = useMemo<LanguageIsoInputValue>(
    () => buildLanguageInputSeed(undefined, locale, resolveLanguageDisplayName),
    [locale, resolveLanguageDisplayName],
  );
  const [primaryTitle, setPrimaryTitle] = useState('');
  const [englishFallbackTitle, setEnglishFallbackTitle] = useState('');
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>(emptyLanguageInput);
  const [orthographyId, setOrthographyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [languageInputError, setLanguageInputError] = useState('');

  const effectiveLang = normalizeLanguageInputCode(languageInput);
  const displayedLanguage = getDisplayedLanguageInputLabel(languageInput);
  const orthographyPicker = useOrthographyPicker(effectiveLang, orthographyId, setOrthographyId);
  const groupedOrthographyOptions = groupOrthographiesForSelect(orthographyPicker.orthographies);
  const selectedOrthography = orthographyPicker.orthographies.find((item) => item.id === orthographyId);
  const selectedOrthographyBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;
  const customLanguageError = effectiveLang && !isKnownIso639_3Code(effectiveLang)
    ? messages.invalidLanguageCode
    : '';
  const resolvedLanguageError = customLanguageError || languageInputError;
  const orthographySelectionError = orthographyId && !orthographyPicker.isCreating && !selectedOrthography
    ? messages.invalidOrthographySelection
    : '';
  const canSubmit = primaryTitle.trim()
    && !submitting
    && !orthographyPicker.isCreating;

  const reset = () => {
    setPrimaryTitle('');
    setEnglishFallbackTitle('');
    setLanguageInput(emptyLanguageInput);
    setOrthographyId('');
    setError('');
    setLanguageInputError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!effectiveLang || customLanguageError) {
      setLanguageInputError(customLanguageError || messages.invalidLanguageCode);
      setError('');
      focusFirstInvalidLanguageCodeInput({ allowFallback: true });
      return;
    }
    setLanguageInputError('');
    if (orthographySelectionError) {
      setError(orthographySelectionError);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        primaryTitle: primaryTitle.trim(),
        englishFallbackTitle: englishFallbackTitle.trim(),
        primaryLanguageId: effectiveLang,
        ...(orthographyId ? { primaryOrthographyId: orthographyId } : {}),
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.createFailed);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  /* 面包屑标题 + 构建器专属 footer | Breadcrumb title + builder-specific footer */
  const builderMessages = getOrthographyBuilderMessages(locale);
  const builderBreadcrumbTitle = (
    <span className="dialog-breadcrumb-title">
      <button type="button" className="dialog-breadcrumb-back" onClick={orthographyPicker.cancelCreate} aria-label={messages.title}>
        <ChevronLeft size={16} />
        <span>{messages.title}</span>
      </button>
      <span className="dialog-breadcrumb-separator">/</span>
      <span className="dialog-breadcrumb-current">{builderMessages.panelTitle}</span>
    </span>
  );
  const builderFooter = (
    <>
      <button
        type="button"
        className="panel-button panel-button--ghost"
        disabled={orthographyPicker.submitting}
        onClick={orthographyPicker.cancelCreate}
      >
        {builderMessages.cancelCreate}
      </button>
      <button
        type="button"
        className="panel-button panel-button--primary"
        disabled={orthographyPicker.submitting}
        onClick={() => { void orthographyPicker.createOrthography(); }}
      >
        {orthographyPicker.submitting
          ? builderMessages.creating
          : orthographyPicker.requiresRenderWarningConfirmation
            ? builderMessages.confirmRiskAndCreate
            : builderMessages.createAndSelect}
      </button>
    </>
  );

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <DialogShell
        className={`project-setup-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
        style={orthographyPicker.isCreating ? { '--dialog-auto-width': '404px' } as React.CSSProperties : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={messages.title}
        title={orthographyPicker.isCreating ? builderBreadcrumbTitle : messages.title}
        actions={(
          <button className="icon-btn" onClick={handleClose} title={messages.close} aria-label={messages.close}>
            <X size={18} />
          </button>
        )}
        footer={orthographyPicker.isCreating ? builderFooter : (
          <>
            <button className="panel-button panel-button--ghost" onClick={handleClose} disabled={submitting}>
              {messages.cancel}
            </button>
            <button
              className="panel-button panel-button--primary"
              disabled={!canSubmit}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {submitting ? messages.creating : messages.createProject}
            </button>
          </>
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {orthographyPicker.isCreating ? (
          <OrthographyBuilderPanel
            picker={orthographyPicker}
            languageOptions={languageOptions}
            compact
            hideActions
            contextLines={[
              messages.title,
              messages.orthographyContextPrimaryLanguage(displayedLanguage),
            ]}
          />
        ) : (
          <>
          <label className="dialog-field">
            <span>{messages.titleZhLabel}<em>*</em></span>
            <input
              className="input panel-input"
              type="text"
              value={primaryTitle}
              onChange={(e) => setPrimaryTitle(e.target.value)}
              placeholder={messages.titleZhPlaceholder}
              autoFocus
            />
          </label>

          <label className="dialog-field">
            <span>{messages.titleEnLabel}</span>
            <input
              className="input panel-input"
              type="text"
              value={englishFallbackTitle}
              onChange={(e) => setEnglishFallbackTitle(e.target.value)}
              placeholder={messages.titleEnPlaceholder}
            />
          </label>

          <div className="dialog-field">
            <LanguageIsoInput
              locale={locale}
              value={languageInput}
              onChange={(nextValue) => {
                setLanguageInput(nextValue);
                if (languageInputError) {
                  setLanguageInputError('');
                }
              }}
              resolveLanguageDisplayName={resolveLanguageDisplayName}
              nameLabel={messages.languageLabel}
              codeLabel={messages.languageCodeLabel}
              namePlaceholder={messages.languagePlaceholder}
              codePlaceholder={messages.languageCodePlaceholder}
              required
              disabled={submitting}
              error={resolvedLanguageError}
            />
          </div>

          {effectiveLang && (
            <div className="dialog-field">
              <label htmlFor={`${fieldIdPrefix}-orthography`}>
                <span>{messages.orthographyLabel}</span>
              </label>
              <div className="dialog-field-select-with-btn">
                <select
                  id={`${fieldIdPrefix}-orthography`}
                  className="input panel-input"
                  value={orthographyId}
                  onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
                >
                  {orthographyPicker.orthographies.length === 0 && <option value="">{messages.orthographyDefaultInference}</option>}
                  {groupedOrthographyOptions.map((group) => (
                    <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                      {group.orthographies.map((orthography) => (
                        <option key={orthography.id} value={orthography.id}>
                          {formatOrthographyOptionLabel(orthography, locale)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  className="panel-button panel-button--ghost dialog-field-inline-btn"
                  onClick={() => orthographyPicker.handleSelectionChange(ORTHOGRAPHY_CREATE_SENTINEL)}
                  title={messages.createOrthography}
                >
                  <Plus size={14} />
                  <span>{messages.newOrthographyButton}</span>
                </button>
              </div>

              {orthographyPicker.orthographies.length === 0 && (
                <p className="dialog-hint">{messages.noOrthographyHint}</p>
              )}

              {selectedOrthography && selectedOrthographyBadge && (
                <p className="dialog-hint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{formatOrthographyOptionLabel(selectedOrthography, locale)}</span>
                  <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
                </p>
              )}

              {orthographyPicker.error && (
                <p className="panel-feedback panel-feedback--error">{orthographyPicker.error}</p>
              )}
              {orthographySelectionError && (
                <p className="panel-feedback panel-feedback--error">{orthographySelectionError}</p>
              )}
            </div>
          )}

          {error && <p className="panel-feedback panel-feedback--error">{error}</p>}
          </>
        )}
      </DialogShell>
    </div>
  );
}
