import { useState } from 'react';
import { X } from 'lucide-react';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { OrthographyTransformManager } from './OrthographyTransformManager';
import { useLocale } from '../i18n';
import { getProjectSetupDialogMessages } from '../i18n/projectSetupDialogMessages';
import {
  formatOrthographyOptionLabel,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';

type ProjectSetupDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { titleZh: string; titleEn: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
};

export function ProjectSetupDialog({ isOpen, onClose, onSubmit }: ProjectSetupDialogProps) {
  const locale = useLocale();
  const messages = getProjectSetupDialogMessages(locale);
  const languageSuggestions = messages.languageSuggestions;
  const [titleZh, setTitleZh] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [languageId, setLanguageId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [orthographyId, setOrthographyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const effectiveLang = languageId === '__custom' ? customLang.trim() : languageId;
  const orthographyPicker = useOrthographyPicker(effectiveLang, orthographyId, setOrthographyId);
  const selectedOrthography = orthographyPicker.orthographies.find((item) => item.id === orthographyId);
  const canSubmit = titleZh.trim() && effectiveLang && !submitting && !orthographyPicker.isCreating;

  const reset = () => {
    setTitleZh('');
    setTitleEn('');
    setLanguageId('');
    setCustomLang('');
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
      <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{messages.title}</h3>
          <button className="icon-btn" onClick={handleClose} title={messages.close}>
            <X size={18} />
          </button>
        </div>

        <div className="dialog-body">
          <label className="dialog-field">
            <span>{messages.titleZhLabel}<em>*</em></span>
            <input
              className="input"
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
              className="input"
              type="text"
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              placeholder={messages.titleEnPlaceholder}
            />
          </label>

          <label className="dialog-field">
            <span>{messages.languageLabel} <em>*</em></span>
            <select
              className="input"
              value={languageId}
              onChange={(e) => setLanguageId(e.target.value)}
            >
              <option value="">{messages.languagePlaceholder}</option>
              {languageSuggestions.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label} ({lang.code})</option>
              ))}
              <option value="__custom">{messages.customLanguageOption}</option>
            </select>
          </label>

          {languageId === '__custom' && (
            <label className="dialog-field">
              <span>{messages.languageCodeLabel}</span>
              <input
                className="input"
                type="text"
                maxLength={8}
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                placeholder={messages.languageCodePlaceholder}
              />
            </label>
          )}

          {effectiveLang && (
            <div className="dialog-field">
              <span>{messages.orthographyLabel}</span>
              <select
                className="input"
                value={orthographyPicker.isCreating ? ORTHOGRAPHY_CREATE_SENTINEL : orthographyId}
                onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
              >
                {orthographyPicker.orthographies.length === 0 && <option value="">{messages.orthographyDefaultInference}</option>}
                {orthographyPicker.orthographies.map((orthography) => (
                  <option key={orthography.id} value={orthography.id}>
                    {formatOrthographyOptionLabel(orthography)}
                  </option>
                ))}
                <option value={ORTHOGRAPHY_CREATE_SENTINEL}>{messages.createOrthography}</option>
              </select>

              {orthographyPicker.orthographies.length === 0 && !orthographyPicker.isCreating && (
                <p className="dialog-hint">{messages.noOrthographyHint}</p>
              )}

              {orthographyPicker.isCreating && (
                <OrthographyBuilderPanel
                  picker={orthographyPicker}
                  languageOptions={languageSuggestions}
                />
              )}

              {!orthographyPicker.isCreating && selectedOrthography && (
                <OrthographyTransformManager
                  targetOrthography={selectedOrthography}
                  languageOptions={languageSuggestions}
                />
              )}
            </div>
          )}

          {error && <p className="error">{error}</p>}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-ghost" onClick={handleClose} disabled={submitting}>
            {messages.cancel}
          </button>
          <button
            className="btn"
            disabled={!canSubmit}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {submitting ? messages.creating : messages.createProject}
          </button>
        </div>
      </div>
    </div>
  );
}
