import { useState } from 'react';
import { ModalPanel } from '../components/ui/ModalPanel';
import { t, type Locale } from '../i18n';
import { layerLabel } from './DesktopTranscriptionLayerRows';
import type { SplitTextPreview, FormalCut } from '../app/desktopProjectReadPageAccess';

export function DesktopTranscriptionSplitDialog(props: {
  locale: Locale;
  preview: SplitTextPreview;
  activeLayerId: string;
  cutIndex: number;
  onCancel: () => void;
  onConfirm: (cuts: FormalCut[]) => void;
}) {
  const [cuts, setCuts] = useState<Record<string, string>>({
    [props.activeLayerId]: String(props.cutIndex),
  });
  const invalid = props.preview.layers.some((row) => {
    const value = cuts[row.layerId] ?? '';
    return value !== '' && (!/^\d+$/.test(value) || Number(value) > row.body.length);
  });
  const conflict = props.preview.layers.some(
    (row) => row.draft !== null && row.baseBody !== row.body,
  );
  return (
    <ModalPanel
      isOpen
      compact
      className="desktop-tx-orthography-dialog"
      bodyClassName="desktop-tx-orthography-form"
      title={t(props.locale, 'app.desktopTranscription.splitTitle')}
      closeLabel={t(props.locale, 'app.desktopTranscription.cancel')}
      onClose={props.onCancel}
      footer={
        <>
          <button autoFocus type="button" className="btn btn-secondary" onClick={props.onCancel}>
            {t(props.locale, 'app.desktopTranscription.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={invalid || conflict}
            onClick={() =>
              props.onConfirm(
                props.preview.layers.map((row) => ({
                  layerId: row.layerId,
                  cutIndex: cuts[row.layerId] ? Number(cuts[row.layerId]) : row.body.length,
                })),
              )
            }
          >
            {t(props.locale, 'app.desktopTranscription.splitTitle')}
          </button>
        </>
      }
    >
      {props.preview.layers.map((row) => (
        <section key={row.layerId}>
          <h3>{layerLabel(row.name, props.locale, row.layerId)}</h3>
          <label>
            {t(props.locale, 'app.desktopTranscription.officialText')}
            <input readOnly value={row.body} />
          </label>
          {row.draft === null ? null : (
            <label>
              {t(props.locale, 'app.desktopTranscription.unsavedDraft')}
              <input readOnly value={row.draft} />
            </label>
          )}
          <label>
            {t(props.locale, 'app.desktopTranscription.splitPoint')}
            <input
              type="number"
              min={0}
              max={row.body.length}
              step={1}
              value={cuts[row.layerId] ?? ''}
              onChange={(event) =>
                setCuts((current) => ({ ...current, [row.layerId]: event.target.value }))
              }
            />
          </label>
        </section>
      ))}
      <p>
        {t(
          props.locale,
          conflict
            ? 'app.desktopTranscription.draftConflict'
            : 'app.desktopTranscription.splitDraftKept',
        )}
      </p>
    </ModalPanel>
  );
}
