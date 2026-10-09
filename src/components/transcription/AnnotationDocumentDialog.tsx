/**
 * 第 5 批：标注文稿的新建 / 重命名 / 删除对话框（复用 ModalPanel / PanelButton / FormField）。
 * Batch 5: create / rename / delete dialog for annotation documents (reuses ModalPanel / PanelButton /
 * FormField).
 */
import { t, tf, type Locale } from '../../i18n';
import { FormField } from '../ui/FormField';
import { ModalPanel } from '../ui/ModalPanel';
import { PanelButton } from '../ui/PanelButton';
import { PanelNote } from '../ui/PanelNote';

export type AnnotationDocumentDialogRequest =
  | { kind: 'create'; name: string }
  | { kind: 'rename'; documentId: string; name: string }
  | { kind: 'delete'; documentId: string; label: string; units: number; layers: number };

export type AnnotationDocumentDialogProps = {
  locale: Locale;
  /** null = 关闭 | null = closed */
  request: AnnotationDocumentDialogRequest | null;
  busy: boolean;
  onChange: (next: AnnotationDocumentDialogRequest) => void;
  onCancel: () => void;
  onConfirm: (request: AnnotationDocumentDialogRequest) => void;
};

const TITLE_KEY = {
  create: 'transcription.projectHub.documents.createTitle',
  rename: 'transcription.projectHub.documents.renameTitle',
  delete: 'transcription.projectHub.documents.deleteTitle',
} as const;

const CONFIRM_KEY = {
  create: 'transcription.projectHub.documents.confirmCreate',
  rename: 'transcription.projectHub.documents.confirmRename',
  delete: 'transcription.projectHub.documents.confirmDelete',
} as const;

export function AnnotationDocumentDialog(props: AnnotationDocumentDialogProps) {
  const { locale, request, busy, onChange, onCancel, onConfirm } = props;
  const title = request ? t(locale, TITLE_KEY[request.kind]) : '';
  const confirm = () => {
    if (request && !busy) onConfirm(request);
  };
  return (
    <ModalPanel
      isOpen={request !== null}
      onClose={() => {
        if (!busy) onCancel();
      }}
      topmost
      compact
      className="panel-design-match panel-design-match-dialog"
      ariaLabel={title}
      title={title}
      closeDisabled={busy}
      footer={
        request ? (
          <>
            <PanelButton variant="ghost" disabled={busy} onClick={onCancel}>
              {t(locale, 'transcription.dialog.cancel')}
            </PanelButton>
            <PanelButton
              variant={request.kind === 'delete' ? 'danger' : 'primary'}
              disabled={busy}
              data-testid="annotation-document-dialog-confirm"
              onClick={confirm}
            >
              {t(locale, CONFIRM_KEY[request.kind])}
            </PanelButton>
          </>
        ) : undefined
      }
    >
      {request?.kind === 'delete' ? (
        <PanelNote variant="danger">
          {tf(locale, 'transcription.projectHub.documents.deleteConfirm', {
            name: request.label,
            units: request.units,
            layers: request.layers,
          })}
        </PanelNote>
      ) : request ? (
        <FormField
          htmlFor="annotation-document-dialog-name"
          label={t(locale, 'transcription.projectHub.documents.nameLabel')}
          hint={t(
            locale,
            request.kind === 'create'
              ? 'transcription.projectHub.documents.createPrompt'
              : 'transcription.projectHub.documents.renamePrompt',
          )}
        >
          <input
            id="annotation-document-dialog-name"
            data-testid="annotation-document-dialog-name"
            className="input panel-input"
            type="text"
            autoFocus
            value={request.name}
            disabled={busy}
            onChange={(event) => onChange({ ...request, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
            }}
          />
        </FormField>
      ) : null}
    </ModalPanel>
  );
}
