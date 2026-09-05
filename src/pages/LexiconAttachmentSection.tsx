import { useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { PanelSection } from '../components/ui/PanelSection';
import { t, useLocale, type DictKey } from '../i18n';
import {
  lexemeAssetAcceptAttribute,
  type LexemeAttachmentView,
} from '../app/languageAssetPageAccess';
import { useLexiconAttachmentController } from './useLexiconAttachmentController';

function kindLabelKey(kind: LexemeAttachmentView['kind']): DictKey {
  if (kind === 'audio') return 'workspace.lexicon.attachments.kind.audio';
  if (kind === 'document') return 'workspace.lexicon.attachments.kind.document';
  return 'workspace.lexicon.attachments.kind.image';
}

function AttachmentPreview({ item }: { item: LexemeAttachmentView }) {
  const locale = useLocale();
  const objectUrl = useMemo(
    () => (item.blob instanceof Blob ? URL.createObjectURL(item.blob) : null),
    [item.blob],
  );

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (item.blobOmitted || !objectUrl) {
    return (
      <p className="lexicon-workspace-state">
        {t(locale, 'workspace.lexicon.attachments.omitted')}
      </p>
    );
  }

  if (item.kind === 'image') {
    return (
      <img className="lexicon-workspace-attachment-thumb" src={objectUrl} alt={item.displayName} />
    );
  }

  if (item.kind === 'audio') {
    return <audio className="lexicon-workspace-attachment-audio" controls src={objectUrl} />;
  }

  return (
    <a
      className="lexicon-workspace-attachment-download"
      href={objectUrl}
      download={item.displayName}
    >
      {t(locale, 'workspace.lexicon.attachments.download')}
    </a>
  );
}

export function LexiconAttachmentSection({ lexemeId }: { lexemeId: string }) {
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    attachments,
    loading,
    languageCode,
    setLanguageCode,
    errorText,
    attachFile,
    unlinkAttachment,
  } = useLexiconAttachmentController(lexemeId);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void attachFile(file);
  };

  return (
    <PanelSection
      className="lexicon-workspace-detail-panel"
      title={t(locale, 'workspace.lexicon.attachments.title')}
      description={t(locale, 'workspace.lexicon.attachments.description')}
    >
      <div className="lexicon-workspace-attachments" data-testid="lexicon-attachments">
        <div className="lexicon-workspace-attachment-toolbar">
          <label className="lexicon-workspace-attachment-language">
            <span>{t(locale, 'workspace.lexicon.attachments.languageCode')}</span>
            <input
              type="text"
              value={languageCode}
              onChange={(event) => setLanguageCode(event.target.value)}
              placeholder={t(locale, 'workspace.lexicon.attachments.languageCodePlaceholder')}
            />
          </label>
          <input
            ref={fileInputRef}
            className="lexicon-workspace-attachment-file"
            type="file"
            accept={lexemeAssetAcceptAttribute()}
            aria-label={t(locale, 'workspace.lexicon.attachments.fileLabel')}
            onChange={onFileChange}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            {t(locale, 'workspace.lexicon.attachments.upload')}
          </button>
        </div>
        {errorText ? <p className="lexicon-workspace-state">{errorText}</p> : null}
        {loading ? (
          <p className="lexicon-workspace-state">
            {t(locale, 'workspace.lexicon.attachments.loading')}
          </p>
        ) : null}
        {!loading && attachments.length === 0 ? (
          <p className="lexicon-workspace-state">
            {t(locale, 'workspace.lexicon.attachments.empty')}
          </p>
        ) : null}
        {attachments.length > 0 ? (
          <ul className="lexicon-workspace-attachment-list">
            {attachments.map((item) => (
              <li key={item.linkId} className="lexicon-workspace-attachment-card">
                <div className="lexicon-workspace-attachment-meta">
                  <strong>{item.displayName}</strong>
                  <span>
                    {t(locale, kindLabelKey(item.kind))}
                    {item.languageCode ? ` · ${item.languageCode}` : ''}
                  </span>
                </div>
                <AttachmentPreview item={item} />
                <button type="button" onClick={() => void unlinkAttachment(item.linkId)}>
                  {t(locale, 'workspace.lexicon.attachments.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PanelSection>
  );
}
