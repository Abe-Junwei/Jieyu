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

interface ExportCallbacks {
  onToggleExportMenu: () => void;
  onExportEaf: () => void;
  onExportTextGrid: () => void;
  onExportTrs: () => void;
  onExportFlextext: () => void;
  onExportToolbox: () => void;
  onExportJyt: () => Promise<void>;
  onExportJym: () => Promise<void>;
  onImportFile: (file: File) => void;
}

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
  exportCallbacks: ExportCallbacks;
  onRefresh: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentAudio: () => void;
  onDeleteCurrentProject: () => void;
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
    exportCallbacks,
    onRefresh,
    onUndo,
    onRedo,
    onOpenProjectSetup,
    onOpenAudioImport,
    onDeleteCurrentAudio,
    onDeleteCurrentProject,
    onToggleNotes,
    onOpenUttOpsMenu,
  } = props;
  const {
    onToggleExportMenu,
    onExportEaf,
    onExportTextGrid,
    onExportTrs,
    onExportFlextext,
    onExportToolbox,
    onExportJyt,
    onExportJym,
    onImportFile,
  } = exportCallbacks;

  return (
    <>
      <div className="transcription-wave-toolbar-action-group">
        <span className="transcription-wave-toolbar-action-label" title="刷新与撤销重做">
          编辑
        </span>
        <button className="icon-btn" onClick={onRefresh} title={t(locale, 'transcription.toolbar.refresh')}>
          <RefreshCw size={16} />
        </button>
        <button className="icon-btn" onClick={onUndo} disabled={!canUndo} title={canUndo && undoLabel ? `撤销：${undoLabel}` : '撤销'}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" onClick={onRedo} disabled={!canRedo} title="重做">
          <Redo2 size={16} />
        </button>
      </div>
      <div className="transcription-wave-toolbar-action-group">
        <span className="transcription-wave-toolbar-action-label" title="项目与音频管理">
          项目
        </span>
        <button className="icon-btn" onClick={onOpenProjectSetup} title={t(locale, 'transcription.toolbar.newProject')}>
          <FolderPlus size={16} />
        </button>
        <button className="icon-btn" onClick={onOpenAudioImport} title={t(locale, 'transcription.toolbar.importAudio')}>
          <Import size={16} />
        </button>
      </div>
      <div className="transcription-wave-toolbar-action-group">
        <span className="transcription-wave-toolbar-action-label" title="导入与导出">
          交换
        </span>
        <span className="transcription-wave-toolbar-menu-wrap">
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
              className="context-menu transcription-toolbar-dropdown-menu"
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 'var(--z-context-menu, 180)',
              }}
            >
              <button
                className="context-menu-item"
                onClick={onExportEaf}
              >
                {t(locale, 'transcription.toolbar.export.eaf')}
              </button>
              <button
                className="context-menu-item"
                onClick={onExportTextGrid}
              >
                {t(locale, 'transcription.toolbar.export.textgrid')}
              </button>
              <button
                className="context-menu-item"
                onClick={onExportTrs}
              >
                {t(locale, 'transcription.toolbar.export.trs')}
              </button>
              <button
                className="context-menu-item"
                onClick={onExportFlextext}
              >
                {t(locale, 'transcription.toolbar.export.flextext')}
              </button>
              <button
                className="context-menu-item"
                onClick={onExportToolbox}
              >
                {t(locale, 'transcription.toolbar.export.toolbox')}
              </button>
              <button
                className="context-menu-item"
                onClick={() => { fireAndForget(onExportJyt()); }}
              >
                {t(locale, 'transcription.toolbar.export.jyt')}
              </button>
              <button
                className="context-menu-item"
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
      </div>
      <div className="transcription-wave-toolbar-action-group">
        <span className="transcription-wave-toolbar-action-label" title="备注与句段操作">
          标注
        </span>
        <button
          className={`icon-btn${notePopoverOpen ? ' icon-btn-active' : ''}`}
          title={t(locale, 'transcription.toolbar.notes')}
          onClick={onToggleNotes}
          disabled={!canToggleNotes}
        >
          <StickyNote size={15} />
        </button>
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
      </div>
      <div className="transcription-wave-toolbar-action-group transcription-wave-toolbar-action-group-danger">
        <span className="transcription-wave-toolbar-action-label" title="删除当前音频或项目">
          危险
        </span>
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
      </div>
    </>
  );
}
