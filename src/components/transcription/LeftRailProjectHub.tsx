import {
  ArchiveRestore,
  Download,
  FolderKanban,
  FolderPlus,
  Import,
  MoreHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImportConflictStrategy } from '../../db';
import { t, tf, useLocale } from '../../i18n';
import type { JieyuArchiveImportPreview } from '../../services/JymService';
import { fireAndForget } from '../../utils/fireAndForget';

interface ProjectImportState {
  file: File;
  preview: JieyuArchiveImportPreview;
  strategy: ImportConflictStrategy;
  importing: boolean;
  errorMessage: string;
}

interface LeftRailProjectHubProps {
  currentProjectLabel: string;
  canDeleteProject: boolean;
  canDeleteAudio: boolean;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentProject: () => void;
  onDeleteCurrentAudio: () => void;
  onImportAnnotationFile: (file: File) => void;
  onPreviewProjectArchiveImport: (file: File) => Promise<JieyuArchiveImportPreview>;
  onImportProjectArchive: (file: File, strategy: ImportConflictStrategy) => Promise<boolean>;
  onExportEaf: () => void;
  onExportTextGrid: () => void;
  onExportTrs: () => void;
  onExportFlextext: () => void;
  onExportToolbox: () => void;
  onExportJyt: () => Promise<void>;
  onExportJym: () => Promise<void>;
}

function pickInsertEstimate(
  preview: JieyuArchiveImportPreview,
  strategy: ImportConflictStrategy,
): number {
  return preview.collections.reduce((sum, item) => {
    if (strategy === 'replace-all') return sum + item.willInsertReplaceAll;
    if (strategy === 'skip-existing') return sum + item.willInsertSkipExisting;
    return sum + item.willInsertUpsert;
  }, 0);
}

export function LeftRailProjectHub(props: LeftRailProjectHubProps) {
  const {
    currentProjectLabel,
    canDeleteProject,
    canDeleteAudio,
    onOpenProjectSetup,
    onOpenAudioImport,
    onDeleteCurrentProject,
    onDeleteCurrentAudio,
    onImportAnnotationFile,
    onPreviewProjectArchiveImport,
    onImportProjectArchive,
    onExportEaf,
    onExportTextGrid,
    onExportTrs,
    onExportFlextext,
    onExportToolbox,
    onExportJyt,
    onExportJym,
  } = props;

  const locale = useLocale();
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 88, left: 88 });
  const [projectImportState, setProjectImportState] = useState<ProjectImportState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const projectArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const annotationImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHostElement(document.getElementById('left-rail-bottom-slot'));
  }, []);

  const syncPanelPosition = useCallback(() => {
    const anchor = buttonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = 360;
    const panelHeight = 540;
    const left = Math.min(rect.right + 8, window.innerWidth - panelWidth - 12);
    const top = Math.max(12, Math.min(rect.top - 4, window.innerHeight - panelHeight - 12));
    setPanelPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    syncPanelPosition();

    const handleWindowChange = () => {
      syncPanelPosition();
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isOpen, syncPanelPosition]);

  useEffect(() => {
    if (!isOpen && !projectImportState) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedButton = buttonRef.current?.contains(target) ?? false;
      const clickedPanel = panelRef.current?.contains(target) ?? false;
      if (clickedButton || clickedPanel) return;
      if (projectImportState) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (projectImportState) {
        if (!projectImportState.importing) setProjectImportState(null);
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, projectImportState]);

  const closeAndRun = useCallback((action: () => void) => {
    setIsOpen(false);
    action();
  }, []);

  const openProjectArchivePicker = useCallback(() => {
    setPreviewError('');
    projectArchiveInputRef.current?.click();
  }, []);

  const openAnnotationImportPicker = useCallback(() => {
    setPreviewError('');
    annotationImportInputRef.current?.click();
  }, []);

  const handleProjectArchivePicked = useCallback(async (file: File) => {
    setPreviewBusy(true);
    setPreviewError('');
    try {
      const preview = await onPreviewProjectArchiveImport(file);
      setProjectImportState({
        file,
        preview,
        strategy: 'upsert',
        importing: false,
        errorMessage: '',
      });
      setIsOpen(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPreviewError(tf(locale, 'transcription.projectHub.previewFailed', { message: detail }));
    } finally {
      setPreviewBusy(false);
    }
  }, [locale, onPreviewProjectArchiveImport]);

  const handleConfirmProjectImport = useCallback(async () => {
    setProjectImportState((prev) => (prev ? { ...prev, importing: true, errorMessage: '' } : null));
    const current = projectImportState;
    if (!current) return;

    const success = await onImportProjectArchive(current.file, current.strategy);
    if (success) {
      setProjectImportState(null);
      setIsOpen(false);
      return;
    }

    setProjectImportState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        importing: false,
        errorMessage: t(locale, 'transcription.projectHub.importFailedHint'),
      };
    });
  }, [locale, onImportProjectArchive, projectImportState]);

  const previewInsertEstimate = useMemo(() => {
    if (!projectImportState) return 0;
    return pickInsertEstimate(projectImportState.preview, projectImportState.strategy);
  }, [projectImportState]);

  if (!hostElement) return null;

  const buttonNode = (
    <div className="left-rail-project-hub-root">
      <button
        ref={buttonRef}
        type="button"
        className={`left-rail-btn left-rail-project-hub-btn ${isOpen ? 'left-rail-btn-active' : ''}`}
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            if (next) syncPanelPosition();
            return next;
          });
        }}
        aria-label={t(locale, 'transcription.projectHub.toggle')}
        title={t(locale, 'transcription.projectHub.toggle')}
      >
        <FolderKanban size={17} aria-hidden="true" />
        <span>{t(locale, 'transcription.projectHub.shortTitle')}</span>
      </button>
      <input
        ref={projectArchiveInputRef}
        type="file"
        accept=".jyt,.jym"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            fireAndForget(handleProjectArchivePicked(file));
          }
          event.target.value = '';
        }}
      />
      <input
        ref={annotationImportInputRef}
        type="file"
        accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportAnnotationFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );

  const panelNode = isOpen ? createPortal(
    <div
      ref={panelRef}
      className="left-rail-project-hub-popover"
      style={{ top: panelPosition.top, left: panelPosition.left }}
      role="dialog"
      aria-modal="false"
      aria-label={t(locale, 'transcription.projectHub.title')}
    >
      <header className="left-rail-project-hub-header">
        <strong>{t(locale, 'transcription.projectHub.title')}</strong>
        <span>{currentProjectLabel}</span>
      </header>

      <section className="left-rail-project-hub-section">
        <h4>{t(locale, 'transcription.projectHub.group.project')}</h4>
        <button type="button" className="left-rail-project-hub-command" disabled>
          <FolderKanban size={14} aria-hidden="true" />
          <span>{tf(locale, 'transcription.projectHub.currentProject', { name: currentProjectLabel })}</span>
        </button>
        <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onOpenProjectSetup)}>
          <FolderPlus size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.toolbar.newProject')}</span>
        </button>
        <button
          type="button"
          className="left-rail-project-hub-command"
          disabled={previewBusy}
          onClick={openProjectArchivePicker}
        >
          <ArchiveRestore size={14} aria-hidden="true" />
          <span>{previewBusy ? t(locale, 'transcription.projectHub.previewing') : t(locale, 'transcription.projectHub.importProject')}</span>
        </button>
        <button
          type="button"
          className="left-rail-project-hub-command left-rail-project-hub-command-danger"
          onClick={() => closeAndRun(onDeleteCurrentProject)}
          disabled={!canDeleteProject}
        >
          <Trash2 size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.toolbar.deleteCurrentProject')}</span>
        </button>
      </section>

      <section className="left-rail-project-hub-section">
        <h4>{t(locale, 'transcription.projectHub.group.exchange')}</h4>
        <button type="button" className="left-rail-project-hub-command" onClick={openAnnotationImportPicker}>
          <Import size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.projectHub.importAnnotation')}</span>
        </button>
        <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onOpenAudioImport)}>
          <Upload size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.toolbar.importAudio')}</span>
        </button>
        <div className="left-rail-project-hub-export-grid">
          <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onExportEaf)}>
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.eaf')}</span>
          </button>
          <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onExportTextGrid)}>
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.textgrid')}</span>
          </button>
          <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onExportTrs)}>
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.trs')}</span>
          </button>
          <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onExportFlextext)}>
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.flextext')}</span>
          </button>
          <button type="button" className="left-rail-project-hub-command" onClick={() => closeAndRun(onExportToolbox)}>
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.toolbox')}</span>
          </button>
          <button
            type="button"
            className="left-rail-project-hub-command"
            onClick={() => {
              setIsOpen(false);
              fireAndForget(onExportJyt());
            }}
          >
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.jyt')}</span>
          </button>
          <button
            type="button"
            className="left-rail-project-hub-command"
            onClick={() => {
              setIsOpen(false);
              fireAndForget(onExportJym());
            }}
          >
            <Download size={14} aria-hidden="true" />
            <span>{t(locale, 'transcription.toolbar.export.jym')}</span>
          </button>
        </div>
      </section>

      <section className="left-rail-project-hub-section">
        <h4>{t(locale, 'transcription.projectHub.group.more')}</h4>
        <button
          type="button"
          className="left-rail-project-hub-command left-rail-project-hub-command-danger"
          disabled={!canDeleteAudio}
          onClick={() => closeAndRun(onDeleteCurrentAudio)}
        >
          <Trash2 size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.toolbar.deleteCurrentAudio')}</span>
        </button>
        <button type="button" className="left-rail-project-hub-command" disabled>
          <MoreHorizontal size={14} aria-hidden="true" />
          <span>{t(locale, 'transcription.projectHub.morePlaceholder')}</span>
        </button>
      </section>

      {previewError && (
        <p className="left-rail-project-hub-error" role="alert">
          {previewError}
        </p>
      )}
    </div>,
    document.body,
  ) : null;

  const projectImportDialogNode = projectImportState ? createPortal(
    <div className="left-rail-project-import-backdrop" role="presentation" onClick={() => {
      if (!projectImportState.importing) setProjectImportState(null);
    }}>
      <div className="left-rail-project-import-dialog" role="dialog" aria-modal="true" aria-label={t(locale, 'transcription.projectHub.importDialogTitle')} onClick={(event) => event.stopPropagation()}>
        <header className="left-rail-project-import-header">
          <strong>{t(locale, 'transcription.projectHub.importDialogTitle')}</strong>
          <span>{projectImportState.file.name}</span>
        </header>

        <div className="left-rail-project-import-summary">
          <div>{tf(locale, 'transcription.projectHub.importDialogKind', { kind: projectImportState.preview.kind.toUpperCase() })}</div>
          <div>{tf(locale, 'transcription.projectHub.importDialogExportedAt', { at: projectImportState.preview.manifest.exportedAt })}</div>
          <div>{tf(locale, 'transcription.projectHub.importDialogStats', {
            incoming: projectImportState.preview.totalIncoming,
            conflicts: projectImportState.preview.totalConflicts,
            insertable: previewInsertEstimate,
          })}</div>
        </div>

        <fieldset className="left-rail-project-import-strategy">
          <legend>{t(locale, 'transcription.projectHub.importDialogStrategy')}</legend>
          <label>
            <input
              type="radio"
              checked={projectImportState.strategy === 'upsert'}
              onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'upsert' } : prev))}
            />
            <span>{t(locale, 'transcription.projectHub.strategy.upsert')}</span>
          </label>
          <label>
            <input
              type="radio"
              checked={projectImportState.strategy === 'skip-existing'}
              onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'skip-existing' } : prev))}
            />
            <span>{t(locale, 'transcription.projectHub.strategy.skipExisting')}</span>
          </label>
          <label>
            <input
              type="radio"
              checked={projectImportState.strategy === 'replace-all'}
              onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'replace-all' } : prev))}
            />
            <span>{t(locale, 'transcription.projectHub.strategy.replaceAll')}</span>
          </label>
        </fieldset>

        <div className="left-rail-project-import-table-wrap">
          <table className="left-rail-project-import-table">
            <thead>
              <tr>
                <th>{t(locale, 'transcription.projectHub.importDialogTableCollection')}</th>
                <th>{t(locale, 'transcription.projectHub.importDialogTableIncoming')}</th>
                <th>{t(locale, 'transcription.projectHub.importDialogTableConflict')}</th>
              </tr>
            </thead>
            <tbody>
              {projectImportState.preview.collections.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.incoming}</td>
                  <td>{row.conflicts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {projectImportState.errorMessage && (
          <p className="left-rail-project-hub-error" role="alert">{projectImportState.errorMessage}</p>
        )}

        <div className="left-rail-project-import-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={projectImportState.importing}
            onClick={() => setProjectImportState(null)}
          >
            {t(locale, 'transcription.dialog.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={projectImportState.importing}
            onClick={() => {
              fireAndForget(handleConfirmProjectImport());
            }}
          >
            {projectImportState.importing
              ? t(locale, 'transcription.projectHub.importing')
              : t(locale, 'transcription.projectHub.confirmImport')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {createPortal(buttonNode, hostElement)}
      {panelNode}
      {projectImportDialogNode}
    </>
  );
}
