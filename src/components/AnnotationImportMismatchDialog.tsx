import { useEffect, useState } from 'react';
import { t, useLocale } from '../i18n';
import { ModalPanel, PanelButton } from './ui';
import { ImportTimelineMismatchAckFields } from './ImportTimelineMismatchAckFields';
import type { TimelineImportMismatchNotice } from '../utils/timelineImportMismatch';

type AnnotationImportMismatchDialogProps = {
  isOpen: boolean;
  fileName: string;
  notices: ReadonlyArray<TimelineImportMismatchNotice>;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function AnnotationImportMismatchDialog({
  isOpen,
  fileName,
  notices,
  busy = false,
  onClose,
  onConfirm,
}: AnnotationImportMismatchDialogProps) {
  const locale = useLocale();
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (isOpen) setAcknowledged(false);
  }, [isOpen, fileName]);

  if (!isOpen) return null;

  return (
    <ModalPanel
      isOpen={isOpen}
      onClose={onClose}
      className="annotation-import-mismatch-dialog panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.importDialog.mismatchTitle')}
      title={t(locale, 'transcription.importDialog.mismatchTitle')}
      closeLabel={t(locale, 'transcription.importDialog.close')}
      footer={
        <>
          <PanelButton variant="ghost" onClick={onClose} disabled={busy}>
            {t(locale, 'transcription.importDialog.cancel')}
          </PanelButton>
          <PanelButton variant="primary" disabled={!acknowledged || busy} onClick={onConfirm}>
            {busy
              ? t(locale, 'transcription.importDialog.importing')
              : t(locale, 'transcription.importDialog.confirmImport')}
          </PanelButton>
        </>
      }
    >
      <p className="small-text">{fileName}</p>
      <ImportTimelineMismatchAckFields
        locale={locale}
        notices={notices}
        acknowledged={acknowledged}
        onAcknowledgedChange={setAcknowledged}
      />
    </ModalPanel>
  );
}
