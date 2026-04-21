import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_NAV } from '../../utils/jieyuMaterialIcon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { useToast } from '../../contexts/ToastContext';
import type { ImportConflictStrategy } from '../../db';
import { t, tf, useLocale } from '../../i18n';
import { DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY, type AnnotationImportBridgeStrategy } from '../../hooks/useImportExport.annotationImport';
import { getSidePaneSidebarMessages } from '../../i18n/sidePaneSidebarMessages';
import type { JieyuArchiveImportPreview } from '../../services/JymService';
import { fireAndForget } from '../../utils/fireAndForget';
import { computeSemanticTimelineMappingPreview } from '../../utils/timeMappingHubPreview';
import { ModalPanel } from '../ui/ModalPanel';
import { PanelButton } from '../ui/PanelButton';
import { PanelChip } from '../ui/PanelChip';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';

interface ProjectImportState {
  file: File;
  preview: JieyuArchiveImportPreview;
  strategy: ImportConflictStrategy;
  importing: boolean;
}

interface AnnotationImportState {
  file: File;
  strategy: AnnotationImportBridgeStrategy;
  importing: boolean;
}

interface TimeMappingDialogState {
  offsetSecText: string;
  scaleText: string;
  saving: boolean;
}

interface LeftRailProjectHubProps {
  currentProjectLabel: string;
  selectedMediaId?: string | null;
  /**
   * Optional metadata from the shell; Project Hub time-mapping / export hints are **not**
   * gated on this value when `onApplyTextTimeMapping` is provided (P3).
   */
  activeTextTimelineMode?: 'document' | 'media' | null;
  activeTextTimeMapping?: {
    offsetSec: number;
    scale: number;
    revision: number;
    updatedAt?: string;
    sourceMediaId?: string;
    logicalDurationSec?: number;
    rollback?: {
      offsetSec: number;
      scale: number;
      revision: number;
      updatedAt?: string;
      sourceMediaId?: string;
    };
    history?: Array<{
      offsetSec: number;
      scale: number;
      revision: number;
      updatedAt?: string;
      sourceMediaId?: string;
    }>;
  } | null;
  canDeleteProject: boolean;
  canDeleteAudio: boolean;
  onOpenProjectSetup: () => void;
  onOpenAudioImport: () => void;
  onDeleteCurrentProject: () => void;
  onDeleteCurrentAudio: () => void;
  onOpenSpeakerManagementPanel: () => void;
  onImportAnnotationFile: (file: File, strategy: AnnotationImportBridgeStrategy) => Promise<void>;
  onPreviewProjectArchiveImport: (file: File) => Promise<JieyuArchiveImportPreview>;
  onImportProjectArchive: (file: File, strategy: ImportConflictStrategy) => Promise<boolean>;
  onApplyTextTimeMapping?: (input: { offsetSec: number; scale: number }) => Promise<void>;
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
    selectedMediaId,
    activeTextTimeMapping,
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
    onApplyTextTimeMapping,
    onExportEaf,
    onExportTextGrid,
    onExportTrs,
    onExportFlextext,
    onExportToolbox,
    onExportJyt,
    onExportJym,
  } = props;

  const showProjectHubLogicalTimeExchange = typeof onApplyTextTimeMapping === 'function';

  const locale = useLocale();
  const sidePaneMessages = getSidePaneSidebarMessages(locale);
  const { showToast } = useToast();
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 88, left: 88 });
  const [projectImportState, setProjectImportState] = useState<ProjectImportState | null>(null);
  const [annotationImportState, setAnnotationImportState] = useState<AnnotationImportState | null>(null);
  const [timeMappingDialogState, setTimeMappingDialogState] = useState<TimeMappingDialogState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const projectArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const annotationImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    setHostElement(document.getElementById('left-rail-project-hub-slot'));
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

  const openTimeMappingDialog = useCallback(() => {
    setTimeMappingDialogState({
      offsetSecText: String(activeTextTimeMapping?.offsetSec ?? 0),
      scaleText: String(activeTextTimeMapping?.scale ?? 1),
      saving: false,
    });
    setIsOpen(false);
  }, [activeTextTimeMapping]);

  const handleAnnotationImportPicked = useCallback((file: File) => {
    setAnnotationImportState({
      file,
      strategy: DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY,
      importing: false,
    });
    setIsOpen(false);
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

  const handleConfirmAnnotationImport = useCallback(async () => {
    setAnnotationImportState((prev) => (prev ? { ...prev, importing: true } : null));
    const current = annotationImportState;
    if (!current) return;

    try {
      await onImportAnnotationFile(current.file, current.strategy);
      setAnnotationImportState(null);
      setIsOpen(false);
    } catch (e) {
      console.warn('Annotation file import failed', e);
      setAnnotationImportState((prev) => (prev ? { ...prev, importing: false } : prev));
    }
  }, [annotationImportState, onImportAnnotationFile]);

  const previewInsertEstimate = useMemo(() => {
    if (!projectImportState) return 0;
    return pickInsertEstimate(projectImportState.preview, projectImportState.strategy);
  }, [projectImportState]);

  const timeMappingPreviewLabel = useMemo(() => {
    if (!showProjectHubLogicalTimeExchange) return null;
    const offsetSec = activeTextTimeMapping?.offsetSec ?? 0;
    const scale = activeTextTimeMapping?.scale ?? 1;
    const revision = activeTextTimeMapping?.revision ?? 0;
    const { docStart, docEnd, realStart, realEnd } = computeSemanticTimelineMappingPreview({
      offsetSec,
      scale,
      ...(activeTextTimeMapping?.logicalDurationSec !== undefined && activeTextTimeMapping.logicalDurationSec !== null
        ? { logicalDurationSec: activeTextTimeMapping.logicalDurationSec }
        : {}),
    });
    return tf(locale, 'transcription.projectHub.exchange.timeMappingPreview', {
      docStart: docStart.toFixed(1),
      docEnd: docEnd.toFixed(1),
      realStart: realStart.toFixed(1),
      realEnd: realEnd.toFixed(1),
      offset: offsetSec.toFixed(1),
      scale: scale.toFixed(2),
      revision: String(revision),
    });
  }, [activeTextTimeMapping, locale, showProjectHubLogicalTimeExchange]);

  const hasTimeMappingSourceMismatch = useMemo(() => {
    if (!showProjectHubLogicalTimeExchange) return false;
    const sourceMediaId = activeTextTimeMapping?.sourceMediaId?.trim();
    const currentMediaId = selectedMediaId?.trim();
    if (!sourceMediaId || !currentMediaId) return false;
    return sourceMediaId !== currentMediaId;
  }, [activeTextTimeMapping?.sourceMediaId, selectedMediaId, showProjectHubLogicalTimeExchange]);

  const timeMappingSourceMismatchLabel = useMemo(() => {
    if (!hasTimeMappingSourceMismatch) return null;
    return tf(locale, 'transcription.projectHub.timeMappingSourceMismatch', {
      sourceMediaId: activeTextTimeMapping?.sourceMediaId ?? '',
      selectedMediaId: selectedMediaId ?? '',
    });
  }, [activeTextTimeMapping?.sourceMediaId, hasTimeMappingSourceMismatch, locale, selectedMediaId]);

  const timeMappingDialogPreview = useMemo(() => {
    if (!timeMappingDialogState) return null;
    const offsetSec = Number(timeMappingDialogState.offsetSecText);
    const scale = Number(timeMappingDialogState.scaleText);
    if (!Number.isFinite(offsetSec) || !Number.isFinite(scale) || offsetSec < 0 || scale <= 0) {
      return t(locale, 'transcription.projectHub.timeMappingDialogInvalid');
    }
    const { docStart, docEnd, realStart, realEnd } = computeSemanticTimelineMappingPreview({
      offsetSec,
      scale,
      ...(activeTextTimeMapping?.logicalDurationSec !== undefined && activeTextTimeMapping.logicalDurationSec !== null
        ? { logicalDurationSec: activeTextTimeMapping.logicalDurationSec }
        : {}),
    });
    return tf(locale, 'transcription.projectHub.timeMappingDialogPreview', {
      docStart: docStart.toFixed(1),
      docEnd: docEnd.toFixed(1),
      realStart: realStart.toFixed(1),
      realEnd: realEnd.toFixed(1),
      offset: offsetSec.toFixed(1),
      scale: scale.toFixed(2),
    });
  }, [activeTextTimeMapping?.logicalDurationSec, locale, timeMappingDialogState]);

  const timeMappingHistoryItems = useMemo(() => {
    if (!showProjectHubLogicalTimeExchange || !activeTextTimeMapping) {
      return [] as Array<{ key: string; label: string; offsetSec: number; scale: number }>;
    }

    const items = [{
      key: `current-${activeTextTimeMapping.revision}`,
      label: tf(locale, 'transcription.projectHub.timeMappingHistoryCurrent', {
        revision: String(activeTextTimeMapping.revision),
        offset: activeTextTimeMapping.offsetSec.toFixed(1),
        scale: activeTextTimeMapping.scale.toFixed(2),
      }),
      offsetSec: activeTextTimeMapping.offsetSec,
      scale: activeTextTimeMapping.scale,
    }];
    const seenRevisions = new Set<number>([activeTextTimeMapping.revision]);

    if (activeTextTimeMapping.rollback && !seenRevisions.has(activeTextTimeMapping.rollback.revision)) {
      seenRevisions.add(activeTextTimeMapping.rollback.revision);
      items.push({
        key: `rollback-${activeTextTimeMapping.rollback.revision}`,
        label: tf(locale, 'transcription.projectHub.timeMappingHistoryPrevious', {
          revision: String(activeTextTimeMapping.rollback.revision),
          offset: activeTextTimeMapping.rollback.offsetSec.toFixed(1),
          scale: activeTextTimeMapping.rollback.scale.toFixed(2),
        }),
        offsetSec: activeTextTimeMapping.rollback.offsetSec,
        scale: activeTextTimeMapping.rollback.scale,
      });
    }

    for (const item of activeTextTimeMapping.history ?? []) {
      if (seenRevisions.has(item.revision)) continue;
      seenRevisions.add(item.revision);
      items.push({
        key: `history-${item.revision}`,
        label: tf(locale, 'transcription.projectHub.timeMappingHistoryOlder', {
          revision: String(item.revision),
          offset: item.offsetSec.toFixed(1),
          scale: item.scale.toFixed(2),
        }),
        offsetSec: item.offsetSec,
        scale: item.scale,
      });
    }

    return items;
  }, [activeTextTimeMapping, locale, showProjectHubLogicalTimeExchange]);

  const handleSelectTimeMappingHistoryItem = useCallback((offsetSec: number, scale: number) => {
    setTimeMappingDialogState((prev) => ({
      offsetSecText: String(offsetSec),
      scaleText: String(scale),
      saving: prev?.saving ?? false,
    }));
  }, []);

  const handleConfirmTimeMapping = useCallback(async () => {
    const current = timeMappingDialogState;
    if (!current || !onApplyTextTimeMapping) return;
    const offsetSec = Number(current.offsetSecText);
    const scale = Number(current.scaleText);
    if (!Number.isFinite(offsetSec) || !Number.isFinite(scale) || offsetSec < 0 || scale <= 0) {
      showToast(t(locale, 'transcription.projectHub.timeMappingDialogInvalid'), 'error', 0);
      return;
    }

    setTimeMappingDialogState((prev) => (prev ? { ...prev, saving: true } : prev));
    try {
      await onApplyTextTimeMapping({ offsetSec, scale });
      setTimeMappingDialogState(null);
      showToast(t(locale, 'transcription.projectHub.timeMappingDialogSaved'), 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setTimeMappingDialogState((prev) => (prev ? { ...prev, saving: false } : prev));
      showToast(tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }), 'error', 0);
    }
  }, [locale, onApplyTextTimeMapping, showToast, timeMappingDialogState]);

  const handleRollbackTimeMapping = useCallback(async () => {
    const rollback = activeTextTimeMapping?.rollback;
    if (!rollback || !onApplyTextTimeMapping) return;
    try {
      await onApplyTextTimeMapping({
        offsetSec: rollback.offsetSec,
        scale: rollback.scale,
      });
      setIsOpen(false);
      showToast(t(locale, 'transcription.projectHub.timeMappingRollbackSucceeded'), 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showToast(tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }), 'error', 0);
    }
  }, [activeTextTimeMapping, locale, onApplyTextTimeMapping, showToast]);

  const handleResetIdentityTimeMapping = useCallback(async () => {
    if (!onApplyTextTimeMapping) return;
    try {
      await onApplyTextTimeMapping({ offsetSec: 0, scale: 1 });
      setIsOpen(false);
      showToast(t(locale, 'transcription.projectHub.timeMappingDialogSaved'), 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showToast(tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }), 'error', 0);
    }
  }, [locale, onApplyTextTimeMapping, showToast]);

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

    const logicalExportItems: ContextMenuItem[] = showProjectHubLogicalTimeExchange
      ? [
          {
            label: t(locale, 'transcription.projectHub.exchange.logicalTimelineHint'),
            disabled: true,
          },
          ...(hasTimeMappingSourceMismatch && timeMappingSourceMismatchLabel
            ? [
                {
                  label: timeMappingSourceMismatchLabel,
                  disabled: true,
                },
                {
                  label: t(locale, 'transcription.projectHub.timeMappingResetIdentity'),
                  disabled: !onApplyTextTimeMapping,
                  onClick: () => { fireAndForget(handleResetIdentityTimeMapping()); },
                },
              ]
            : []),
          {
            label: timeMappingPreviewLabel ?? '',
            disabled: true,
          },
          {
            label: t(locale, 'transcription.projectHub.exchange.calibrateTimeMapping'),
            disabled: !onApplyTextTimeMapping,
            onClick: openTimeMappingDialog,
          },
          {
            label: t(locale, 'transcription.projectHub.exchange.rollbackTimeMapping'),
            disabled: !onApplyTextTimeMapping || !activeTextTimeMapping?.rollback,
            onClick: () => { fireAndForget(handleRollbackTimeMapping()); },
          },
        ]
      : [];

    const exportItems: ContextMenuItem[] = [
      ...logicalExportItems,
      {
        label: t(locale, 'transcription.toolbar.export.eaf'),
        ...(showProjectHubLogicalTimeExchange ? { separatorBefore: true } : {}),
        onClick: onExportEaf,
      },
      { label: t(locale, 'transcription.toolbar.export.textgrid'), onClick: onExportTextGrid },
      { label: t(locale, 'transcription.toolbar.export.trs'), onClick: onExportTrs },
      { label: t(locale, 'transcription.toolbar.export.flextext'), onClick: onExportFlextext },
      { label: t(locale, 'transcription.toolbar.export.toolbox'), onClick: onExportToolbox },
      { label: t(locale, 'transcription.toolbar.export.jyt'), separatorBefore: true, onClick: () => { fireAndForget(onExportJyt()); } },
      { label: t(locale, 'transcription.toolbar.export.jym'), onClick: () => { fireAndForget(onExportJym()); } },
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
        children: exportItems,
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
    activeTextTimeMapping,
    showProjectHubLogicalTimeExchange,
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
    onApplyTextTimeMapping,
    hasTimeMappingSourceMismatch,
    handleRollbackTimeMapping,
    handleResetIdentityTimeMapping,
    handleSelectTimeMappingHistoryItem,
    openAnnotationImportPicker,
    openProjectArchivePicker,
    openTimeMappingDialog,
    previewBusy,
    sidePaneMessages.quickActionSpeakerManagement,
    timeMappingSourceMismatchLabel,
    timeMappingPreviewLabel,
  ]);

  const handleCloseProjectImport = useCallback(() => {
    if (!projectImportState?.importing) setProjectImportState(null);
  }, [projectImportState?.importing]);

  const handleCloseAnnotationImport = useCallback(() => {
    if (!annotationImportState?.importing) setAnnotationImportState(null);
  }, [annotationImportState?.importing]);

  const handleCloseTimeMappingDialog = useCallback(() => {
    if (!timeMappingDialogState?.saving) setTimeMappingDialogState(null);
  }, [timeMappingDialogState?.saving]);

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
        <MaterialSymbol name="inventory_2" aria-hidden className={JIEYU_MATERIAL_NAV} />
        <span>{t(locale, 'transcription.projectHub.shortTitle')}</span>
      </button>
      <input
        ref={projectArchiveInputRef}
        type="file"
        accept=".jyt,.jym"
        aria-label={t(locale, 'transcription.projectHub.importProject')}
        className="left-rail-project-hub-file-input"
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
        aria-label={t(locale, 'transcription.projectHub.importAnnotation')}
        className="left-rail-project-hub-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleAnnotationImportPicked(file);
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

  const projectImportDialogNode = (
    <ModalPanel
      isOpen={projectImportState !== null}
      onClose={handleCloseProjectImport}
      topmost
      className="left-rail-project-import-dialog dialog-card-wide panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.projectHub.importDialogTitle')}
      title={t(locale, 'transcription.projectHub.importDialogTitle')}
      headerClassName="left-rail-project-import-header"
      closeLabel={`${t(locale, 'transcription.projectHub.importDialogTitle')} ${t(locale, 'transcription.dialog.cancel')}`}
      closeDisabled={projectImportState?.importing}
      footerClassName="left-rail-project-import-actions"
      footer={projectImportState ? (
        <>
          <PanelButton
            variant="ghost"
            disabled={projectImportState.importing}
            onClick={() => setProjectImportState(null)}
          >
            {t(locale, 'transcription.dialog.cancel')}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={projectImportState.importing}
            onClick={() => {
              fireAndForget(handleConfirmProjectImport());
            }}
          >
            {projectImportState.importing
              ? t(locale, 'transcription.projectHub.importing')
              : t(locale, 'transcription.projectHub.confirmImport')}
          </PanelButton>
        </>
      ) : undefined}
    >
      {projectImportState && (
        <>
          <PanelSummary
            className="left-rail-project-import-summary"
            title={projectImportState.file.name}
            description={tf(locale, 'transcription.projectHub.importDialogKind', { kind: projectImportState.preview.kind.toUpperCase() })}
            meta={(
              <div className="panel-meta">
                <PanelChip>{tf(locale, 'transcription.projectHub.importDialogExportedAt', { at: projectImportState.preview.manifest.exportedAt })}</PanelChip>
                <PanelChip variant={projectImportState.preview.totalConflicts > 0 ? 'warning' : 'default'}>{tf(locale, 'transcription.projectHub.importDialogStats', {
                  incoming: projectImportState.preview.totalIncoming,
                  conflicts: projectImportState.preview.totalConflicts,
                  insertable: previewInsertEstimate,
                })}</PanelChip>
              </div>
            )}
          />

          <PanelSection className="left-rail-project-import-strategy-section" title={t(locale, 'transcription.projectHub.importDialogStrategy')}>
            <fieldset className="left-rail-project-import-strategy">
            <label>
              <input
                type="radio"
                name="project-import-strategy"
                checked={projectImportState.strategy === 'upsert'}
                onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'upsert' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.strategy.upsert')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="project-import-strategy"
                checked={projectImportState.strategy === 'skip-existing'}
                onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'skip-existing' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.strategy.skipExisting')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="project-import-strategy"
                checked={projectImportState.strategy === 'replace-all'}
                onChange={() => setProjectImportState((prev) => (prev ? { ...prev, strategy: 'replace-all' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.strategy.replaceAll')}</span>
            </label>
            </fieldset>
          </PanelSection>

          <PanelSection className="left-rail-project-import-table-section" title={t(locale, 'transcription.projectHub.importDialogTableCollection')}>
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
          </PanelSection>
        </>
      )}
    </ModalPanel>
  );

  const timeMappingDialogNode = (
    <ModalPanel
      isOpen={timeMappingDialogState !== null}
      onClose={handleCloseTimeMappingDialog}
      topmost
      className="left-rail-project-import-dialog panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.projectHub.timeMappingDialogTitle')}
      title={t(locale, 'transcription.projectHub.timeMappingDialogTitle')}
      closeLabel={`${t(locale, 'transcription.projectHub.timeMappingDialogTitle')} ${t(locale, 'transcription.dialog.cancel')}`}
      closeDisabled={timeMappingDialogState?.saving}
      footer={timeMappingDialogState ? (
        <>
          <PanelButton
            variant="ghost"
            disabled={timeMappingDialogState.saving}
            onClick={() => setTimeMappingDialogState(null)}
          >
            {t(locale, 'transcription.dialog.cancel')}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={timeMappingDialogState.saving}
            onClick={() => {
              fireAndForget(handleConfirmTimeMapping());
            }}
          >
            {t(locale, 'transcription.projectHub.timeMappingDialogApply')}
          </PanelButton>
        </>
      ) : undefined}
    >
      {timeMappingDialogState ? (
        <>
          <PanelSummary
            className="left-rail-project-import-summary"
            title={t(locale, 'transcription.projectHub.timeMappingDialogTitle')}
            description={timeMappingDialogPreview ?? ''}
          />
          <PanelSection className="left-rail-project-import-strategy-section" title={t(locale, 'transcription.projectHub.importDialogStrategy')}>
            <div className="left-rail-project-time-mapping-form">
              <label className="left-rail-project-time-mapping-field">
                <span>{t(locale, 'transcription.projectHub.timeMappingDialogOffset')}</span>
                <input
                  aria-label={t(locale, 'transcription.projectHub.timeMappingDialogOffset')}
                  type="number"
                  step="0.1"
                  min="0"
                  value={timeMappingDialogState.offsetSecText}
                  onChange={(event) => setTimeMappingDialogState((prev) => (prev ? { ...prev, offsetSecText: event.target.value } : prev))}
                />
              </label>
              <label className="left-rail-project-time-mapping-field">
                <span>{t(locale, 'transcription.projectHub.timeMappingDialogScale')}</span>
                <input
                  aria-label={t(locale, 'transcription.projectHub.timeMappingDialogScale')}
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={timeMappingDialogState.scaleText}
                  onChange={(event) => setTimeMappingDialogState((prev) => (prev ? { ...prev, scaleText: event.target.value } : prev))}
                />
              </label>
            </div>
          </PanelSection>

          <PanelSection className="left-rail-project-import-table-section" title={t(locale, 'transcription.projectHub.timeMappingHistoryTitle')}>
            <div className="left-rail-project-time-mapping-history">
              {timeMappingHistoryItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="panel-button panel-button--ghost left-rail-project-time-mapping-history-button"
                  onClick={() => handleSelectTimeMappingHistoryItem(item.offsetSec, item.scale)}
                  aria-label={item.label}
                  title={item.label}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </PanelSection>
        </>
      ) : null}
    </ModalPanel>
  );

  const annotationImportDialogNode = (
    <ModalPanel
      isOpen={annotationImportState !== null}
      onClose={handleCloseAnnotationImport}
      topmost
      className="left-rail-project-import-dialog panel-design-match panel-design-match-dialog"
      ariaLabel={t(locale, 'transcription.projectHub.annotationImportDialogTitle')}
      title={t(locale, 'transcription.projectHub.annotationImportDialogTitle')}
      closeLabel={`${t(locale, 'transcription.projectHub.annotationImportDialogTitle')} ${t(locale, 'transcription.dialog.cancel')}`}
      closeDisabled={annotationImportState?.importing}
      footer={annotationImportState ? (
        <>
          <PanelButton
            variant="ghost"
            disabled={annotationImportState.importing}
            onClick={() => setAnnotationImportState(null)}
          >
            {t(locale, 'transcription.dialog.cancel')}
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={annotationImportState.importing}
            onClick={() => {
              fireAndForget(handleConfirmAnnotationImport());
            }}
          >
            {annotationImportState.importing
              ? t(locale, 'transcription.projectHub.importing')
              : t(locale, 'transcription.projectHub.confirmAnnotationImport')}
          </PanelButton>
        </>
      ) : undefined}
    >
      {annotationImportState && (
        <>
        <PanelSummary
          className="left-rail-project-import-summary"
          title={annotationImportState.file.name}
          description={t(locale, 'transcription.projectHub.annotationImportDialogSummary')}
        />

        <PanelSection className="left-rail-project-import-strategy-section" title={t(locale, 'transcription.projectHub.annotationImportDialogStrategy')}>
          <fieldset className="left-rail-project-import-strategy">
            <label>
              <input
                type="radio"
                name="annotation-import-strategy"
                checked={annotationImportState.strategy === 'preserve-source'}
                onChange={() => setAnnotationImportState((prev) => (prev ? { ...prev, strategy: 'preserve-source' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.annotationStrategy.preserveSource')}</span>
              <span className="small-text">{t(locale, 'transcription.projectHub.annotationStrategy.preserveSourceHint')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="annotation-import-strategy"
                checked={annotationImportState.strategy === 'bridge-target'}
                onChange={() => setAnnotationImportState((prev) => (prev ? { ...prev, strategy: 'bridge-target' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.annotationStrategy.bridgeTarget')}</span>
              <span className="small-text">{t(locale, 'transcription.projectHub.annotationStrategy.bridgeTargetHint')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="annotation-import-strategy"
                checked={annotationImportState.strategy === 'preserve-source-and-bridge'}
                onChange={() => setAnnotationImportState((prev) => (prev ? { ...prev, strategy: 'preserve-source-and-bridge' } : prev))}
              />
              <span>{t(locale, 'transcription.projectHub.annotationStrategy.preserveSourceAndBridge')}</span>
              <span className="small-text">{t(locale, 'transcription.projectHub.annotationStrategy.preserveSourceAndBridgeHint')}</span>
            </label>
          </fieldset>
        </PanelSection>
        </>
      )}
    </ModalPanel>
  );

  return (
    <>
      {createPortal(buttonNode, hostElement)}
      {panelNode}
      {projectImportDialogNode}
      {timeMappingDialogNode}
      {annotationImportDialogNode}
    </>
  );
}
