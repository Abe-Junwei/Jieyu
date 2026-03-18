import type { RefObject } from 'react';
import {
  ChevronDown,
  Download,
  FolderPlus,
  Import,
  Redo2,
  RefreshCw,
  Scissors,
  StickyNote,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { detectLocale, t } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';

interface TranscriptionToolbarActionsProps {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  canDeleteAudio: boolean;
  canDeleteProject: boolean;
  canToggleNotes: boolean;
  canOpenUttOpsMenu: boolean;
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  onRefresh: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentAudio: () => void;
  onDeleteCurrentProject: () => void;
  onToggleExportMenu: () => void;
  onExportEaf: () => void;
  onExportTextGrid: () => void;
  onExportTrs: () => void;
  onExportFlextext: () => void;
  onExportToolbox: () => void;
  onExportJyt: () => Promise<void>;
  onExportJym: () => Promise<void>;
  onImportFile: (file: File) => void;
  onToggleNotes: () => void;
  onOpenUttOpsMenu: (x: number, y: number) => void;
}

export function TranscriptionToolbarActions(props: TranscriptionToolbarActionsProps) {
  const locale = detectLocale();
  const {
    canUndo,
    canRedo,
    undoLabel,
    canDeleteAudio,
    canDeleteProject,
    canToggleNotes,
    canOpenUttOpsMenu,
    notePopoverOpen,
    showExportMenu,
    importFileRef,
    exportMenuRef,
    onRefresh,
    onUndo,
    onRedo,
    onOpenProjectSetup,
    onOpenAudioImport,
    onDeleteCurrentAudio,
    onDeleteCurrentProject,
    onToggleExportMenu,
    onExportEaf,
    onExportTextGrid,
    onExportTrs,
    onExportFlextext,
    onExportToolbox,
    onExportJyt,
    onExportJym,
    onImportFile,
    onToggleNotes,
    onOpenUttOpsMenu,
  } = props;

  return (
    <>
      <button className="icon-btn" onClick={onRefresh} title={t(locale, 'transcription.toolbar.refresh')}>
        <RefreshCw size={16} />
      </button>
      <button className="icon-btn" onClick={onUndo} disabled={!canUndo} title={canUndo && undoLabel ? `撤销：${undoLabel}` : '撤销'}>
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" onClick={onRedo} disabled={!canRedo} title="重做">
        <Redo2 size={16} />
      </button>
      <button className="icon-btn" onClick={onOpenProjectSetup} title={t(locale, 'transcription.toolbar.newProject')}>
        <FolderPlus size={16} />
      </button>
      <button className="icon-btn" onClick={onOpenAudioImport} title={t(locale, 'transcription.toolbar.importAudio')}>
        <Import size={16} />
      </button>
      <button
        className="icon-btn icon-btn-danger"
        title={t(locale, 'transcription.toolbar.deleteCurrentAudio')}
        disabled={!canDeleteAudio}
        onClick={onDeleteCurrentAudio}
      >
        <Trash2 size={16} />
      </button>
      <button
        className="icon-btn icon-btn-danger"
        title={t(locale, 'transcription.toolbar.deleteCurrentProject')}
        disabled={!canDeleteProject}
        onClick={onDeleteCurrentProject}
      >
        <Trash2 size={14} />
      </button>
      <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          className="icon-btn"
          title={t(locale, 'transcription.toolbar.exportMenu')}
          onClick={onToggleExportMenu}
        >
          <Download size={16} />
          <ChevronDown size={12} style={{ marginLeft: 2 }} />
        </button>
        {showExportMenu && (
          <div
            ref={exportMenuRef}
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 'var(--z-context-menu)',
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150, padding: '4px 0',
            }}
          >
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={onExportEaf}
            >
              {t(locale, 'transcription.toolbar.export.eaf')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={onExportTextGrid}
            >
              {t(locale, 'transcription.toolbar.export.textgrid')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={onExportTrs}
            >
              {t(locale, 'transcription.toolbar.export.trs')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={onExportFlextext}
            >
              {t(locale, 'transcription.toolbar.export.flextext')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={onExportToolbox}
            >
              {t(locale, 'transcription.toolbar.export.toolbox')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={() => { fireAndForget(onExportJyt()); }}
            >
              {t(locale, 'transcription.toolbar.export.jyt')}
            </button>
            <button
              style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
              onClick={() => { fireAndForget(onExportJym()); }}
            >
              {t(locale, 'transcription.toolbar.export.jym')}
            </button>
          </div>
        )}
      </span>
      <button
        className="icon-btn"
        title={t(locale, 'transcription.toolbar.importMenu')}
        onClick={() => importFileRef.current?.click()}
      >
        <Upload size={16} />
      </button>
      <input
        ref={importFileRef}
        type="file"
        accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox,.jyt,.jym"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportFile(file);
          e.target.value = '';
        }}
      />
      <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
      <button
        className={`icon-btn${notePopoverOpen ? ' icon-btn-active' : ''}`}
        title={t(locale, 'transcription.toolbar.notes')}
        onClick={onToggleNotes}
        disabled={!canToggleNotes}
      >
        <StickyNote size={15} />
      </button>
      <span style={{ width: 1, height: 18, background: '#d1d5db', margin: '0 2px' }} />
      <button
        className="icon-btn"
        title={t(locale, 'transcription.toolbar.utteranceOps')}
        disabled={!canOpenUttOpsMenu}
        onClick={(e) => {
          if (!canOpenUttOpsMenu) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenUttOpsMenu(rect.left, rect.bottom + 4);
        }}
      >
        <Scissors size={15} />
        <ChevronDown size={12} style={{ marginLeft: 2 }} />
      </button>
    </>
  );
}
