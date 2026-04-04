import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { useLocale } from '../i18n';
import { getProjectSetupDialogMessages } from '../i18n/projectSetupDialogMessages';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';
import { getOrthographyCatalogGroupLabel } from '../i18n/orthographyBuilderMessages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { DialogShell } from './ui/DialogShell';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { COMMON_LANGUAGES } from '../utils/transcriptionFormatters';

const EMPTY_LANGUAGE_INPUT: LanguageIsoInputValue = {
  languageName: '',
  languageCode: '',
};

type ProjectSetupDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
};

export function ProjectSetupDialog({ isOpen, onClose, onSubmit }: ProjectSetupDialogProps) {
  const locale = useLocale();
  const messages = getProjectSetupDialogMessages(locale);
  const fieldIdPrefix = useId();
  const [titleZh, setTitleZh] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>(EMPTY_LANGUAGE_INPUT);
  const [orthographyId, setOrthographyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const effectiveLang = languageInput.languageCode.trim().toLowerCase();
  const orthographyPicker = useOrthographyPicker(effectiveLang, orthographyId, setOrthographyId);
  const groupedOrthographyOptions = groupOrthographiesForSelect(orthographyPicker.orthographies);
  const selectedOrthography = orthographyPicker.orthographies.find((item) => item.id === orthographyId);
  const selectedOrthographyBadge = selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null;
  const customLanguageError = effectiveLang && !isKnownIso639_3Code(effectiveLang)
    ? '语言代码必须是有效的 ISO 639-3 三字母代码。'
    : '';
  const orthographySelectionError = orthographyId && !orthographyPicker.isCreating && !selectedOrthography
    ? '所选正字法已失效，请重新选择。'
    : '';
  const canSubmit = titleZh.trim()
    && effectiveLang
    && !customLanguageError
    && !orthographySelectionError
    && !submitting
    && !orthographyPicker.isCreating;

  const reset = () => {
    setTitleZh('');
    setTitleEn('');
    setLanguageInput(EMPTY_LANGUAGE_INPUT);
    setOrthographyId('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (customLanguageError) {
      setError(customLanguageError);
      return;
    }
    if (orthographySelectionError) {
      setError(orthographySelectionError);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        titleZh: titleZh.trim(),
        titleEn: titleEn.trim(),
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

  return (
    <div className="dialog-overlay" onClick={handleClose}>
      <DialogShell
        className="project-setup-dialog panel-design-match panel-design-match-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={messages.title}
        title={messages.title}
        actions={(
          <button className="icon-btn" onClick={handleClose} title={messages.close} aria-label={messages.close}>
            <X size={18} />
          </button>
        )}
        footer={(
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
          <label className="dialog-field">
            <span>{messages.titleZhLabel}<em>*</em></span>
            <input
              className="input panel-input"
              type="text"
              value={titleZh}
              onChange={(e) => setTitleZh(e.target.value)}
              placeholder={messages.titleZhPlaceholder}
              autoFocus
            />
          </label>

          <label className="dialog-field">
            <span>{messages.titleEnLabel}</span>
            <input
              className="input panel-input"
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder={messages.titleEnPlaceholder}
            />
          </label>

          <div className="dialog-field">
            <span>{messages.languageLabel} <em>*</em></span>
            <LanguageIsoInput
              locale={locale}
              value={languageInput}
              onChange={setLanguageInput}
              nameLabel={messages.languageLabel}
              codeLabel={messages.languageCodeLabel}
              namePlaceholder={messages.languagePlaceholder}
              codePlaceholder={messages.languageCodePlaceholder}
              required
              disabled={submitting}
              error={customLanguageError}
            />
          </div>

          {effectiveLang && (
            <div className="dialog-field">
              <label htmlFor={`${fieldIdPrefix}-orthography`}>
                <span>{messages.orthographyLabel}</span>
              </label>
              <select
                id={`${fieldIdPrefix}-orthography`}
                className="input panel-input"
                value={orthographyPicker.isCreating ? ORTHOGRAPHY_CREATE_SENTINEL : orthographyId}
                onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
              >
                {orthographyPicker.orthographies.length === 0 && <option value="">{messages.orthographyDefaultInference}</option>}
                {groupedOrthographyOptions.map((group) => (
                  <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                    {group.orthographies.map((orthography) => (
                      <option key={orthography.id} value={orthography.id}>
                        {formatOrthographyOptionLabel(orthography)}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={ORTHOGRAPHY_CREATE_SENTINEL}>{messages.createOrthography}</option>
              </select>

              {orthographyPicker.orthographies.length === 0 && !orthographyPicker.isCreating && (
                <p className="dialog-hint">{messages.noOrthographyHint}</p>
              )}

              {!orthographyPicker.isCreating && selectedOrthography && selectedOrthographyBadge && (
                <p className="dialog-hint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{formatOrthographyOptionLabel(selectedOrthography)}</span>
                  <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
                </p>
              )}

              {orthographyPicker.isCreating && (
                <OrthographyBuilderPanel
                  picker={orthographyPicker}
                  languageOptions={COMMON_LANGUAGES}
                />
              )}
              {!orthographyPicker.isCreating && orthographyPicker.error && (
                <p className="error">{orthographyPicker.error}</p>
              )}
              {!orthographyPicker.isCreating && orthographySelectionError && (
                <p className="error">{orthographySelectionError}</p>
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
      </DialogShell>
    </div>
  );
}
