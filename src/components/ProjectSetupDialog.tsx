import { useId, useMemo, useState } from 'react';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE, JIEYU_MATERIAL_PANEL } from '../utils/jieyuMaterialIcon';
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
import { FormField, ModalPanel, PanelButton, PanelFeedback } from './ui';
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
    if (submitting || orthographyPicker.isCreating) return;
    if (!primaryTitle.trim()) {
      return;
    }
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
        <MaterialSymbol name="chevron_left" className={JIEYU_MATERIAL_PANEL} />
        <span>{messages.title}</span>
      </button>
      <span className="dialog-breadcrumb-separator">/</span>
      <span className="dialog-breadcrumb-current">{builderMessages.panelTitle}</span>
    </span>
  );
  const builderFooter = (
    <>
      <PanelButton
        variant="ghost"
        disabled={orthographyPicker.submitting}
        onClick={orthographyPicker.cancelCreate}
      >
        {builderMessages.cancelCreate}
      </PanelButton>
      <PanelButton
        variant="primary"
        disabled={orthographyPicker.submitting}
        onClick={() => { void orthographyPicker.createOrthography(); }}
      >
        {orthographyPicker.submitting
          ? builderMessages.creating
          : orthographyPicker.requiresRenderWarningConfirmation
            ? builderMessages.confirmRiskAndCreate
            : builderMessages.createAndSelect}
      </PanelButton>
    </>
  );

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={handleClose}
      className={`project-setup-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
      style={orthographyPicker.isCreating ? { '--dialog-auto-width': '404px' } as React.CSSProperties : undefined}
      ariaLabel={messages.title}
      title={orthographyPicker.isCreating ? builderBreadcrumbTitle : messages.title}
      closeLabel={messages.close}
      footer={orthographyPicker.isCreating ? builderFooter : (
        <>
          <PanelButton variant="ghost" onClick={handleClose} disabled={submitting}>
            {messages.cancel}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={submitting}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {submitting ? messages.creating : messages.createProject}
          </PanelButton>
        </>
      )}
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
          <FormField label={<>{messages.titleZhLabel}<em>*</em></>}>
            <input
              className="input panel-input"
              type="text"
              value={primaryTitle}
              onChange={(e) => setPrimaryTitle(e.target.value)}
              placeholder={messages.titleZhPlaceholder}
              autoFocus
            />
          </FormField>

          <FormField label={messages.titleEnLabel}>
            <input
              className="input panel-input"
              type="text"
              value={englishFallbackTitle}
              onChange={(e) => setEnglishFallbackTitle(e.target.value)}
              placeholder={messages.titleEnPlaceholder}
            />
          </FormField>

          <FormField>
            <LanguageIsoInput
              locale={locale}
              value={languageInput}
              onChange={(nextValue) => {
                setLanguageInput(nextValue);
                if (languageInputError) {
                  setLanguageInputError('');
                }
              }}
              searchScope="language"
              resolveLanguageDisplayName={resolveLanguageDisplayName}
              nameLabel={messages.languageLabel}
              codeLabel={messages.languageCodeLabel}
              namePlaceholder={messages.languagePlaceholder}
              codePlaceholder={messages.languageCodePlaceholder}
              required
              disabled={submitting}
              error={resolvedLanguageError}
            />
          </FormField>

          {effectiveLang && (
            <FormField htmlFor={`${fieldIdPrefix}-orthography`} label={<span>{messages.orthographyLabel}</span>}>
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
                <PanelButton
                  variant="ghost"
                  className="dialog-field-inline-btn"
                  onClick={() => orthographyPicker.handleSelectionChange(ORTHOGRAPHY_CREATE_SENTINEL)}
                  title={messages.createOrthography}
                >
                  <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE} />
                  <span>{messages.newOrthographyButton}</span>
                </PanelButton>
              </div>

              {orthographyPicker.orthographies.length === 0 && (
                <p className="dialog-hint">{messages.noOrthographyHint}</p>
              )}

              {selectedOrthography && selectedOrthographyBadge && (
                <p className="dialog-hint dialog-hint-inline">
                  <span>{formatOrthographyOptionLabel(selectedOrthography, locale)}</span>
                  <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
                </p>
              )}

              {orthographyPicker.error && (
                <PanelFeedback level="error">{orthographyPicker.error}</PanelFeedback>
              )}
              {orthographySelectionError && (
                <PanelFeedback level="error">{orthographySelectionError}</PanelFeedback>
              )}
            </FormField>
          )}

          {error && <PanelFeedback level="error">{error}</PanelFeedback>}
          </>
        )}
    </ModalPanel>
  );
}
