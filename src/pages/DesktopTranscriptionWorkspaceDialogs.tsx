import { ModalPanel } from '../components/ui/ModalPanel';
import { t, type Locale } from '../i18n';
import { DesktopDraftLeaveDialog } from './DesktopDraftLeaveDialog';
import { DesktopOralLeaveDialog } from './DesktopOralLeaveDialog';
import { DesktopTranscriptionDraftConflictDialog } from './DesktopTranscriptionDraftConflictDialog';
import { DesktopTranscriptionNotesDialog } from './DesktopTranscriptionNotesDialog';
import { DesktopTranscriptionWaveMenu, type WaveMenuState } from './DesktopTranscriptionWaveMenu';
import type { DesktopPlaybackUnit } from './useDesktopTranscriptionMediaController';
import { menuDeleteCount } from './desktopTranscriptionLaneSelect';
import type { NotesDialogState } from './useDesktopTranscriptionMetadataController';
import type { UnitNote } from './useDesktopProjectReadQueries';

type DraftApi = {
  conflict: Parameters<typeof DesktopTranscriptionDraftConflictDialog>[0]['conflict'];
  discard: () => Promise<boolean>;
  resolveConflict: () => Promise<boolean>;
  prompt: { failed: boolean } | null;
  unknown: boolean;
  saving: boolean;
  canRetry: boolean;
  retry: () => void;
  stay: () => void;
};

type OralApi = {
  ask: boolean;
  saving: boolean;
  saveAndLeave: () => void;
  discardAndLeave: () => void;
  stay: () => void;
};

type RetimeApi = {
  open: boolean;
  close: () => void;
  confirm: () => void | Promise<unknown>;
  offsetRaw: string;
  setOffsetRaw: (value: string) => void;
  scaleRaw: string;
  setScaleRaw: (value: string) => void;
};

export function DesktopTranscriptionWorkspaceDialogs(props: {
  locale: Locale;
  draft: DraftApi;
  oral: OralApi;
  retime: RetimeApi;
  splitDialog: React.ReactNode;
  mergeDialog: React.ReactNode;
  createAssignOpen: boolean;
  createAssignName: string;
  setCreateAssignOpen: (open: boolean) => void;
  setCreateAssignName: (name: string) => void;
  onCreateAssignConfirm: () => void;
  waveMenu: WaveMenuState | null;
  units: readonly DesktopPlaybackUnit[];
  selectedUnitIds: readonly string[];
  setWaveMenu: (menu: WaveMenuState | null) => void;
  onPlayFrom: (time: number) => void;
  onToggleSkip: (unitId: string) => void;
  onDelete: (unitId: string) => void;
  onSplit: (unitId: string, time: number) => void;
  canMerge: (unitId: string) => boolean;
  onMerge: (unitId: string) => void;
  notes?: {
    state: NotesDialogState;
    onClose: () => void;
    onAdd: () => void;
    onEdit: (note: UnitNote) => void;
    onDelete: (noteId: string) => void;
    onDraft: (value: string) => void;
    onSave: () => void;
    onBackToList: () => void;
  };
  waveMetadata?: {
    onOpenNotes: () => void;
    certaintyOpen: boolean;
    certainty: NonNullable<
      Parameters<typeof DesktopTranscriptionWaveMenu>[0]['certainty']
    >['current'];
    onToggleCertainty: () => void;
    onPickCertainty: NonNullable<
      Parameters<typeof DesktopTranscriptionWaveMenu>[0]['certainty']
    >['onPick'];
  };
}) {
  const { locale } = props;
  return (
    <>
      <DesktopTranscriptionDraftConflictDialog
        locale={locale}
        conflict={props.draft.conflict}
        onDiscard={props.draft.discard}
        onResolve={props.draft.resolveConflict}
      />
      {props.splitDialog}
      {props.mergeDialog}
      {props.notes === undefined ? null : (
        <DesktopTranscriptionNotesDialog
          locale={locale}
          state={props.notes.state}
          onClose={props.notes.onClose}
          onAdd={props.notes.onAdd}
          onEdit={(noteId) => {
            const note =
              props.notes?.state?.mode === 'list'
                ? props.notes.state.notes.find((row) => row.id === noteId)
                : undefined;
            if (note) props.notes?.onEdit(note);
          }}
          onDelete={props.notes.onDelete}
          onDraft={props.notes.onDraft}
          onSave={props.notes.onSave}
          onBackToList={props.notes.onBackToList}
        />
      )}
      <ModalPanel
        isOpen={props.createAssignOpen}
        compact
        className="desktop-tx-create-assign"
        footerClassName="desktop-tx-create-assign__footer"
        closeLabel={t(locale, 'app.desktopTranscription.cancel')}
        onClose={() => props.setCreateAssignOpen(false)}
        title={t(locale, 'app.desktopTranscription.createAndAssignTitle')}
        footer={
          <>
            <button type="button" onClick={() => props.setCreateAssignOpen(false)}>
              {t(locale, 'app.desktopTranscription.cancel')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={props.createAssignName.trim().length === 0}
              onClick={props.onCreateAssignConfirm}
            >
              {t(locale, 'app.desktopTranscription.createAndAssignConfirm')}
            </button>
          </>
        }
      >
        <label className="desktop-tx-create-assign__field">
          <span>{t(locale, 'app.desktopTranscription.createAndAssignName')}</span>
          <input
            value={props.createAssignName}
            onChange={(event) => props.setCreateAssignName(event.target.value)}
            autoFocus
          />
        </label>
      </ModalPanel>
      <ModalPanel
        isOpen={props.retime.open}
        compact
        className="desktop-tx-create-assign"
        footerClassName="desktop-tx-create-assign__footer"
        closeLabel={t(locale, 'app.desktopTranscription.cancel')}
        onClose={props.retime.close}
        title={t(locale, 'app.desktopTranscription.retimeTitle')}
        footer={
          <>
            <button type="button" onClick={props.retime.close}>
              {t(locale, 'app.desktopTranscription.cancel')}
            </button>
            <button
              type="button"
              className="primary"
              data-testid="desktop-tx-retime-confirm"
              onClick={() => void props.retime.confirm()}
            >
              {t(locale, 'app.desktopTranscription.retimeConfirm')}
            </button>
          </>
        }
      >
        <label className="desktop-tx-create-assign__field">
          <span>{t(locale, 'app.desktopTranscription.retimeOffset')}</span>
          <input
            value={props.retime.offsetRaw}
            onChange={(event) => props.retime.setOffsetRaw(event.target.value)}
            inputMode="numeric"
            autoFocus
          />
        </label>
        <label className="desktop-tx-create-assign__field">
          <span>{t(locale, 'app.desktopTranscription.retimeScale')}</span>
          <input
            value={props.retime.scaleRaw}
            onChange={(event) => props.retime.setScaleRaw(event.target.value)}
            inputMode="decimal"
          />
        </label>
      </ModalPanel>
      {props.waveMenu === null ? null : (
        <DesktopTranscriptionWaveMenu
          locale={locale}
          menu={props.waveMenu}
          units={props.units}
          selectedCount={menuDeleteCount(props.waveMenu.unitId ?? undefined, props.selectedUnitIds)}
          onClose={() => props.setWaveMenu(null)}
          onPlayFrom={props.onPlayFrom}
          onToggleSkip={props.onToggleSkip}
          onDelete={props.onDelete}
          onSplit={props.onSplit}
          canMerge={props.canMerge}
          onMerge={props.onMerge}
          {...(props.waveMetadata === undefined
            ? {}
            : {
                onOpenNotes: props.waveMetadata.onOpenNotes,
                certainty: {
                  open: props.waveMetadata.certaintyOpen,
                  current: props.waveMetadata.certainty,
                  onToggle: props.waveMetadata.onToggleCertainty,
                  onPick: props.waveMetadata.onPickCertainty,
                },
              })}
        />
      )}
      {props.oral.ask ? (
        <DesktopOralLeaveDialog
          saving={props.oral.saving}
          onSave={() => props.oral.saveAndLeave()}
          onDiscard={() => props.oral.discardAndLeave()}
          onStay={() => props.oral.stay()}
        />
      ) : null}
      {props.draft.prompt === null ? null : (
        <DesktopDraftLeaveDialog
          failed={props.draft.prompt.failed}
          unknown={props.draft.unknown}
          saving={props.draft.saving}
          canRetry={props.draft.canRetry}
          onRetry={props.draft.retry}
          onDiscard={props.draft.discard}
          onStay={props.draft.stay}
        />
      )}
    </>
  );
}
