import {
  FolderKanban,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { useToast } from '../../contexts/ToastContext';
import type { ImportConflictStrategy } from '../../db';
import { t, tf, useLocale } from '../../i18n';
import { getSidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';
import type { JieyuArchiveImportPreview } from '../../services/JymService';
import { fireAndForget } from '../../utils/fireAndForget';

interface ProjectImportState {
  file: File;
  preview: JieyuArchiveImportPreview;
  strategy: ImportConflictStrategy;
  importing: boolean;
}

interface LeftRailProjectHubProps {
  currentProjectLabel: string;
  canDeleteProject: boolean;
  canDeleteAudio: boolean;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentProject: () => void;
  onDeleteCurrentAudio: () => void;
  onOpenSpeakerManagementPanel: () => void;
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
    onOpenSpeakerManagementPanel,
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
  const sidePaneMessages = getSidePaneSidebarMessages(locale);
  const { showToast } = useToast();
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 88, left: 88 });
  const [projectImportState, setProjectImportState] = useState<ProjectImportState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
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
    setPanelPosition({ top: rect.bottom - 2, left: rect.right + 6 });
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
    if (!projectImportState) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!projectImportState.importing) setProjectImportState(null);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectImportState]);

  const openProjectArchivePicker = useCallback(() => {
    projectArchiveInputRef.current?.click();
  }, []);

  const openAnnotationImportPicker = useCallback(() => {
    annotationImportInputRef.current?.click();
  }, []);

  const handleProjectArchivePicked = useCallback(async (file: File) => {
    setPreviewBusy(true);
    try {
      const preview = await onPreviewProjectArchiveImport(file);
      setProjectImportState({
        file,
        preview,
        strategy: 'upsert',
        importing: false,
      });
      setIsOpen(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showToast(tf(locale, 'transcription.projectHub.previewFailed', { message: detail }), 'error', 0);
    } finally {
      setPreviewBusy(false);
    }
  }, [locale, onPreviewProjectArchiveImport, showToast]);

  const handleConfirmProjectImport = useCallback(async () => {
    setProjectImportState((prev) => (prev ? { ...prev, importing: true } : null));
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
      };
    });
    showToast(t(locale, 'transcription.projectHub.importFailedHint'), 'error', 0);
  }, [locale, onImportProjectArchive, projectImportState, showToast]);

  const previewInsertEstimate = useMemo(() => {
    if (!projectImportState) return 0;
    return pickInsertEstimate(projectImportState.preview, projectImportState.strategy);
  }, [projectImportState]);

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    const importItems: ContextMenuItem[] = [
      {
        label: previewBusy ? t(locale, 'transcription.projectHub.previewing') : t(locale, 'transcription.projectHub.importProject'),
        disabled: previewBusy,
        onClick: openProjectArchivePicker,
      },
      {
        label: t(locale, 'transcription.projectHub.importAnnotation'),
        onClick: openAnnotationImportPicker,
      },
      {
        label: t(locale, 'transcription.toolbar.importAudio'),
        onClick: onOpenAudioImport,
      },
    ];

    return [
      {
        label: t(locale, 'transcription.projectHub.group.project'),
        variant: 'category',
        meta: currentProjectLabel,
        children: [
          {
            label: t(locale, 'transcription.toolbar.newProject'),
            onClick: onOpenProjectSetup,
          },
          {
            label: t(locale, 'transcription.toolbar.deleteCurrentProject'),
            danger: true,
            disabled: !canDeleteProject,
            onClick: onDeleteCurrentProject,
          },
        ],
      },
      {
        label: sidePaneMessages.quickActionSpeakerManagement,
        onClick: onOpenSpeakerManagementPanel,
      },
      {
        label: t(locale, 'transcription.projectHub.exchange.importTitle'),
        variant: 'category',
        children: importItems,
      },
      {
        label: t(locale, 'transcription.projectHub.exchange.exportTitle'),
        variant: 'category',
        submenuClassName: 'context-menu-submenu-export',
        children: [
          { label: t(locale, 'transcription.toolbar.export.eaf'), onClick: onExportEaf },
          { label: t(locale, 'transcription.toolbar.export.textgrid'), onClick: onExportTextGrid },
          { label: t(locale, 'transcription.toolbar.export.trs'), onClick: onExportTrs },
          { label: t(locale, 'transcription.toolbar.export.flextext'), onClick: onExportFlextext },
          { label: t(locale, 'transcription.toolbar.export.toolbox'), onClick: onExportToolbox },
          { label: t(locale, 'transcription.toolbar.export.jyt'), separatorBefore: true, onClick: () => { fireAndForget(onExportJyt()); } },
          { label: t(locale, 'transcription.toolbar.export.jym'), onClick: () => { fireAndForget(onExportJym()); } },
        ],
      },
      {
        label: t(locale, 'transcription.projectHub.group.more'),
        variant: 'category',
        children: [
          {
            label: t(locale, 'transcription.toolbar.deleteCurrentAudio'),
            danger: true,
            disabled: !canDeleteAudio,
            onClick: onDeleteCurrentAudio,
          },
          {
            label: t(locale, 'transcription.projectHub.morePlaceholder'),
            disabled: true,
          },
        ],
      },
    ];
  }, [
    canDeleteAudio,
    canDeleteProject,
    currentProjectLabel,
    locale,
    onDeleteCurrentAudio,
    onDeleteCurrentProject,
    onExportEaf,
    onExportFlextext,
    onExportJym,
    onExportJyt,
    onExportTextGrid,
    onExportToolbox,
    onExportTrs,
    onOpenAudioImport,
    onOpenProjectSetup,
    onOpenSpeakerManagementPanel,
    openAnnotationImportPicker,
    openProjectArchivePicker,
    previewBusy,
    sidePaneMessages.quickActionSpeakerManagement,
  ]);

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

  const panelNode = isOpen ? (
    <ContextMenu
      x={panelPosition.left}
      y={panelPosition.top}
      items={menuItems}
      anchorOrigin="bottom-left"
      onClose={() => setIsOpen(false)}
    />
  ) : null;

  const projectImportDialogNode = projectImportState ? createPortal(
    <div className="left-rail-project-import-backdrop" role="presentation" onClick={() => {
      if (!projectImportState.importing) setProjectImportState(null);
    }}>
      <div className="left-rail-project-import-dialog dialog-card dialog-card-wide" role="dialog" aria-modal="true" aria-label={t(locale, 'transcription.projectHub.importDialogTitle')} onClick={(event) => event.stopPropagation()}>
        <header className="left-rail-project-import-header dialog-header">
          <div>
            <h3>{t(locale, 'transcription.projectHub.importDialogTitle')}</h3>
            <span>{projectImportState.file.name}</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            disabled={projectImportState.importing}
            onClick={() => setProjectImportState(null)}
            aria-label={`${t(locale, 'transcription.projectHub.importDialogTitle')} ${t(locale, 'transcription.dialog.cancel')}`}
            title={`${t(locale, 'transcription.projectHub.importDialogTitle')} ${t(locale, 'transcription.dialog.cancel')}`}
          >
            <X size={18} />
          </button>
        </header>

        <div className="dialog-body">
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
        </div>

        <div className="left-rail-project-import-actions dialog-footer">
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
