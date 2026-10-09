import { MaterialSymbol } from '../ui/MaterialSymbol';
import { requestPersistOnGesture } from '../../utils/storageDurability';
import { JIEYU_MATERIAL_NAV } from '../../utils/jieyuMaterialIcon';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { useToast } from '../../contexts/ToastContext';
import type { ImportConflictStrategy } from '../../db';
import { t, tf, useLocale } from '../../i18n';
import {
  DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY,
  type AnnotationImportBridgeStrategy,
} from '../../hooks/importExport/useImportExport.annotationImport';
import { getSidePaneSidebarMessages } from '../../i18n/messages';
import type {
  JieyuArchiveImportPreview,
  ProjectArchiveImportSelection,
  ProjectArchiveRestoreMode,
} from '../../services/JymService';
import { useLibraryBackupExport } from '../../hooks/importExport/useLibraryBackupExport';
import { LibraryBackupImportOptions } from './LibraryBackupImportOptions';
import { SnapshotRestoreDialog } from './SnapshotRestoreDialog';
import { fireAndForget } from '../../utils/fireAndForget';
import { computeSemanticTimelineMappingPreview } from '../../utils/timeMappingHubPreview';
import { recordTranscriptionKeyboardAction } from '../../utils/transcriptionKeyboardActionTelemetry';
import {
  buildTranscriptionDeepLinkHref,
  getActiveProjectTextId,
  subscribeActiveProjectTextId,
} from '../../utils/transcriptionUrlDeepLink';
import { loadProjectRoster, PROJECT_ROSTER_QUERY_KEY } from '../../utils/projectRoster';
import type { TranscriptionOutboundExportFormat } from '../../utils/transcriptionLiteExport';
import { createLogger } from '../../observability/logger';
import { openProjectLanguageListsEditor } from '../ProjectLanguageListsDialog';
import { ModalPanel } from '../ui/ModalPanel';
import { PanelButton } from '../ui/PanelButton';
import { PanelChip } from '../ui/PanelChip';
import { PanelSection } from '../ui/PanelSection';
import { PanelSummary } from '../ui/PanelSummary';
import { describeArchiveImportError } from '../../utils/archiveImportErrorMessage';
import {
  previewSourceImportForFile,
  type SourceImportPlan,
} from '../../services/sourceRecordService';
import {
  previewAnnotationDocumentReplace,
  type AnnotationDocumentReplacePreview,
} from '../../services/annotationDocumentService';

interface ProjectImportState {
  file: File;
  preview: JieyuArchiveImportPreview;
  strategy: ImportConflictStrategy;
  /** JYT：恢复为新项目（默认）或覆盖当前项目（D5）| JYT: restore as new (default) or overwrite (D5) */
  restoreMode: ProjectArchiveRestoreMode;
  /** 覆盖的第一次确认已点过（二次确认）| First overwrite confirm clicked (double confirm) */
  overwriteArmed: boolean;
  /** JYB：逐项目导入时勾选的项目 | JYB: projects checked for per-project import */
  selectedProjectIds?: string[];
  /** JYB 逐项目导入：随项目导入 AI 记忆与历史（默认是）| JYB: import project AI (default yes) */
  includeProjectAi?: boolean;
  /** JYB 整库还原：同时写回用户偏好（默认否）| JYB disaster restore: restore preferences (default no) */
  restorePreferences?: boolean;
  importing: boolean;
}

interface AnnotationImportState {
  file: File;
  strategy: AnnotationImportBridgeStrategy;
  importing: boolean;
  /** 2B-D 来源身份预览（只读）| 2B-D source identity preview (read-only) */
  sourcePlan?: SourceImportPlan | null;
  /** 2B-E 替换预览（只读，N1）| 2B-E replace preview (read-only, N1) */
  replacePreview?: AnnotationDocumentReplacePreview | null;
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
   * Shared with timeline empty-state "import file" CTA so both entry points open the same picker.
   */
  importFileRef: RefObject<HTMLInputElement | null>;
  /**
   * Optional metadata from the shell; Project Hub time-mapping / export hints are **not**
   * gated on this value when `onApplyTextTimeMapping` is provided (P3).
   */
  exportTimelineModeLabel?: 'document' | 'media' | null;
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
  onImportProjectArchive: (
    file: File,
    strategy: ImportConflictStrategy,
    restoreMode?: ProjectArchiveRestoreMode,
    selection?: ProjectArchiveImportSelection,
  ) => Promise<boolean>;
  onApplyTextTimeMapping?: (input: { offsetSec: number; scale: number }) => Promise<void>;
  onExportEaf: () => void;
  onExportTextGrid: () => void;
  onExportTrs: () => void;
  onExportFlextext: () => void;
  onExportToolbox: () => void;
  onExportJyt: () => Promise<void>;
  onExportJym: () => Promise<void>;
  onExportLite: (format: TranscriptionOutboundExportFormat) => Promise<void>;
}

const log = createLogger('LeftRailProjectHub');

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
    importFileRef,
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
    onExportLite,
  } = props;

  const showProjectHubLogicalTimeExchange = typeof onApplyTextTimeMapping === 'function';

  const locale = useLocale();
  const navigate = useNavigate();
  const activeTextId = useSyncExternalStore(
    subscribeActiveProjectTextId,
    getActiveProjectTextId,
    () => '',
  );
  const rosterQuery = useQuery({
    queryKey: [PROJECT_ROSTER_QUERY_KEY, locale],
    queryFn: () => loadProjectRoster(locale),
  });
  const roster = useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const refetchRoster = rosterQuery.refetch;
  useEffect(() => {
    void refetchRoster();
  }, [activeTextId, refetchRoster]);
  const activeProjectTitle = roster.find((project) => project.textId === activeTextId)?.title ?? '';
  const sidePaneMessages = getSidePaneSidebarMessages(locale);
  const { showToast } = useToast();
  const notifyLibraryBackup = useCallback(
    (message: string, variant: 'success' | 'error') =>
      showToast(message, variant, variant === 'error' ? 0 : undefined),
    [showToast],
  );
  const exportLibraryBackup = useLibraryBackupExport({ locale, notify: notifyLibraryBackup });
  const exportRawSnapshot = useCallback(async () => {
    try {
      const { downloadMainDatabaseRawSnapshot } =
        await import('../../services/rawSnapshotConverter');
      await downloadMainDatabaseRawSnapshot();
      showToast(t(locale, 'transcription.importExport.exportDone.rawSnapshot'), 'success');
    } catch (error) {
      showToast(
        tf(locale, 'transcription.importExport.exportFailed.rawSnapshot', {
          message: error instanceof Error ? error.message : String(error),
        }),
        'error',
      );
    }
  }, [locale, showToast]);
  const [snapshotRestoreOpen, setOverwriteSnapshotsOpen] = useState(false);
  const [hostElement, setHostElement] = useState<HTMLElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 88, left: 88 });
  const [projectImportState, setProjectImportState] = useState<ProjectImportState | null>(null);
  const [annotationImportState, setAnnotationImportState] = useState<AnnotationImportState | null>(
    null,
  );
  const [timeMappingDialogState, setTimeMappingDialogState] =
    useState<TimeMappingDialogState | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const projectArchiveInputRef = useRef<HTMLInputElement | null>(null);
  const rawSnapshotInputRef = useRef<HTMLInputElement | null>(null);

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
    recordTranscriptionKeyboardAction('toolbarOpenProjectArchivePicker');
    projectArchiveInputRef.current?.click();
  }, []);

  const openAnnotationImportPicker = useCallback(() => {
    recordTranscriptionKeyboardAction('toolbarOpenAnnotationImportPicker');
    importFileRef.current?.click();
  }, [importFileRef]);

  const openTimeMappingDialog = useCallback(() => {
    recordTranscriptionKeyboardAction('toolbarOpenTextTimeMappingDialog');
    setTimeMappingDialogState({
      offsetSecText: String(activeTextTimeMapping?.offsetSec ?? 0),
      scaleText: String(activeTextTimeMapping?.scale ?? 1),
      saving: false,
    });
    setIsOpen(false);
  }, [activeTextTimeMapping]);

  const handleAnnotationImportPicked = useCallback(
    (file: File) => {
      setAnnotationImportState({
        file,
        strategy: DEFAULT_ANNOTATION_IMPORT_BRIDGE_STRATEGY,
        importing: false,
      });
      setIsOpen(false);
      // 先预览来源身份（rev5 4.2-2）：同 URN 会更新已有文档 | Preview source identity first (rev5 4.2-2)
      fireAndForget(
        previewSourceImportForFile(activeTextId, file).then((sourcePlan) => {
          setAnnotationImportState((prev) =>
            prev && prev.file === file ? { ...prev, sourcePlan } : prev,
          );
        }),
        {
          context: 'src/components/transcription/LeftRailProjectHub.tsx:L275',
          policy: 'user-visible',
        },
      );
      // 2B-E：预览将被替换的默认文档内容；确认前不写库 | Preview what the replace removes; no write before confirm
      if (activeTextId) {
        fireAndForget(
          previewAnnotationDocumentReplace(activeTextId).then((replacePreview) => {
            setAnnotationImportState((prev) =>
              prev && prev.file === file ? { ...prev, replacePreview } : prev,
            );
          }),
          {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L288',
            policy: 'user-visible',
          },
        );
      }
    },
    [activeTextId],
  );

  const handleProjectArchivePicked = useCallback(
    async (file: File) => {
      void requestPersistOnGesture('import');
      setPreviewBusy(true);
      try {
        const preview = await onPreviewProjectArchiveImport(file);
        setProjectImportState({
          file,
          preview,
          strategy: 'upsert',
          restoreMode: 'restore-as-new',
          overwriteArmed: false,
          ...(preview.libraryBackup
            ? {
                selectedProjectIds: preview.libraryBackup.projects.map((project) => project.id),
                includeProjectAi: true,
                restorePreferences: false,
              }
            : {}),
          importing: false,
        });
        setIsOpen(false);
      } catch (error) {
        // RD-1：旧库导出、版本不符、记录不合格都给出明确的一句话 | RD-1: readable format errors
        const detail = describeArchiveImportError(locale, error);
        showToast(
          tf(locale, 'transcription.projectHub.previewFailed', { message: detail }),
          'error',
          0,
        );
      } finally {
        setPreviewBusy(false);
      }
    },
    [locale, onPreviewProjectArchiveImport, showToast],
  );

  const handleConfirmProjectImport = useCallback(async () => {
    const current = projectImportState;
    if (!current) return;
    // D5 / D7：覆盖与整库还原需要二次确认；第一次点击只显示警告 | Overwrite / disaster: second click
    if (current.restoreMode !== 'restore-as-new' && !current.overwriteArmed) {
      setProjectImportState((prev) => (prev ? { ...prev, overwriteArmed: true } : null));
      return;
    }
    setProjectImportState((prev) => (prev ? { ...prev, importing: true } : null));

    const success =
      current.selectedProjectIds !== undefined
        ? await onImportProjectArchive(current.file, current.strategy, current.restoreMode, {
            projectIds: current.selectedProjectIds,
            includeProjectAi: current.includeProjectAi !== false,
            restorePreferences: current.restorePreferences === true,
          })
        : await onImportProjectArchive(current.file, current.strategy, current.restoreMode);
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
      log.warn('annotation file import failed', { err: e });
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
      ...(activeTextTimeMapping?.logicalDurationSec !== undefined &&
      activeTextTimeMapping.logicalDurationSec !== null
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
      ...(activeTextTimeMapping?.logicalDurationSec !== undefined &&
      activeTextTimeMapping.logicalDurationSec !== null
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

    const items = [
      {
        key: `current-${activeTextTimeMapping.revision}`,
        label: tf(locale, 'transcription.projectHub.timeMappingHistoryCurrent', {
          revision: String(activeTextTimeMapping.revision),
          offset: activeTextTimeMapping.offsetSec.toFixed(1),
          scale: activeTextTimeMapping.scale.toFixed(2),
        }),
        offsetSec: activeTextTimeMapping.offsetSec,
        scale: activeTextTimeMapping.scale,
      },
    ];
    const seenRevisions = new Set<number>([activeTextTimeMapping.revision]);

    if (
      activeTextTimeMapping.rollback &&
      !seenRevisions.has(activeTextTimeMapping.rollback.revision)
    ) {
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
    recordTranscriptionKeyboardAction('toolbarTimeMappingFormHistorySelect');
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
      showToast(
        tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }),
        'error',
        0,
      );
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
      showToast(
        tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }),
        'error',
        0,
      );
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
      showToast(
        tf(locale, 'transcription.projectHub.timeMappingDialogSaveFailed', { message: detail }),
        'error',
        0,
      );
    }
  }, [locale, onApplyTextTimeMapping, showToast]);

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    const importItems: ContextMenuItem[] = [
      {
        label: previewBusy
          ? t(locale, 'transcription.projectHub.previewing')
          : t(locale, 'transcription.projectHub.importProject'),
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
      // 原始恢复快照（迁移被阻止时导出的 ZIP）转换后按 JYB 导入（8.2，T41）| Raw snapshot → JYB (T41)
      {
        label: t(locale, 'transcription.projectHub.rawSnapshotImport'),
        separatorBefore: true,
        onClick: () => {
          recordTranscriptionKeyboardAction('toolbarOpenProjectArchivePicker');
          rawSnapshotInputRef.current?.click();
        },
      },
      // 覆盖前快照与整库快照的恢复入口（用户决定 2026-10-09）| Snapshot restore entry
      {
        label: t(locale, 'transcription.projectHub.snapshotRestore.menu'),
        onClick: () => {
          setIsOpen(false);
          setOverwriteSnapshotsOpen(true);
        },
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
                  onClick: () => {
                    fireAndForget(handleResetIdentityTimeMapping(), {
                      context: 'src/components/transcription/LeftRailProjectHub.tsx:L473',
                      policy: 'user-visible',
                    });
                  },
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
            onClick: () => {
              fireAndForget(handleRollbackTimeMapping(), {
                context: 'src/components/transcription/LeftRailProjectHub.tsx:L489',
                policy: 'user-visible',
              });
            },
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
      {
        label: t(locale, 'transcription.toolbar.export.srt'),
        onClick: () => {
          fireAndForget(onExportLite('srt'), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L567',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.vtt'),
        onClick: () => {
          fireAndForget(onExportLite('vtt'), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L576',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.csv'),
        onClick: () => {
          fireAndForget(onExportLite('csv'), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L585',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.tsv'),
        onClick: () => {
          fireAndForget(onExportLite('tsv'), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L594',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.tex'),
        onClick: () => {
          fireAndForget(onExportLite('tex'), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L603',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.jyt'),
        separatorBefore: true,
        onClick: () => {
          fireAndForget(onExportJyt(), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L505',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.jym'),
        onClick: () => {
          fireAndForget(onExportJym(), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L506',
            policy: 'user-visible',
          });
        },
      },
      // 整库备份 JYB：必须写明带不带音频（D1）| Whole-library JYB: with or without audio (D1)
      {
        label: t(locale, 'transcription.toolbar.export.jybWithMedia'),
        separatorBefore: true,
        onClick: () => {
          fireAndForget(exportLibraryBackup(true), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L747',
            policy: 'user-visible',
          });
        },
      },
      {
        label: t(locale, 'transcription.toolbar.export.jybWithoutMedia'),
        onClick: () => {
          fireAndForget(exportLibraryBackup(false), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L756',
            policy: 'user-visible',
          });
        },
      },
      // 原始恢复快照：旧 schema 原样数据，不是 JYB（8.2）| Raw recovery snapshot (not a JYB, 8.2)
      {
        label: t(locale, 'transcription.toolbar.export.rawSnapshot'),
        onClick: () => {
          fireAndForget(exportRawSnapshot(), {
            context: 'src/components/transcription/LeftRailProjectHub.tsx:L812',
            policy: 'user-visible',
          });
        },
      },
    ];

    return [
      {
        label: t(locale, 'transcription.projectHub.group.allProjects'),
        variant: 'category',
        children: [
          ...roster.map((project) => ({
            label: project.title,
            selectionState:
              project.textId === activeTextId ? ('selected' as const) : ('unselected' as const),
            selectionVariant: 'check' as const,
            onClick: () => {
              void navigate(buildTranscriptionDeepLinkHref({ textId: project.textId }));
            },
          })),
          {
            label: t(locale, 'transcription.projectHub.openWorkbench'),
            separatorBefore: roster.length > 0,
            onClick: () => {
              void navigate('/');
            },
          },
        ],
      },
      {
        label: t(locale, 'transcription.projectHub.group.project'),
        variant: 'category',
        meta: activeProjectTitle || currentProjectLabel,
        children: [
          {
            label: t(locale, 'transcription.toolbar.newProject'),
            onClick: onOpenProjectSetup,
          },
          ...(canDeleteProject
            ? [
                {
                  label: t(locale, 'msg.projectSetup.editLanguages'),
                  onClick: openProjectLanguageListsEditor,
                },
                {
                  label: t(locale, 'app.nav.annotation'),
                  onClick: () => navigate('/annotation'),
                },
                {
                  label: t(locale, 'app.nav.lexicon'),
                  onClick: () => navigate('/lexicon'),
                },
                {
                  label: t(locale, 'app.nav.corpus'),
                  onClick: () => navigate('/corpus'),
                },
                {
                  label: t(locale, 'app.nav.orthographies'),
                  onClick: () => navigate('/assets/orthographies'),
                },
                {
                  label: t(locale, 'app.nav.languageMetadata'),
                  onClick: () => navigate('/assets/language-metadata'),
                },
                {
                  label: sidePaneMessages.quickActionSpeakerManagement,
                  onClick: onOpenSpeakerManagementPanel,
                },
              ]
            : []),
          {
            label: t(locale, 'transcription.toolbar.deleteCurrentProject'),
            danger: true,
            disabled: !canDeleteProject,
            onClick: onDeleteCurrentProject,
          },
        ],
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
    activeProjectTitle,
    activeTextId,
    roster,
    activeTextTimeMapping,
    showProjectHubLogicalTimeExchange,
    locale,
    navigate,
    onDeleteCurrentAudio,
    onDeleteCurrentProject,
    onExportEaf,
    onExportFlextext,
    onExportJym,
    onExportJyt,
    exportLibraryBackup,
    exportRawSnapshot,
    onExportLite,
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
    if (!timeMappingDialogState?.saving) {
      recordTranscriptionKeyboardAction('toolbarCloseTextTimeMappingDialog');
      setTimeMappingDialogState(null);
    }
  }, [timeMappingDialogState?.saving]);

  if (!hostElement) return null;

  const buttonNode = (
    <div className="left-rail-project-hub-root">
      <button
        ref={buttonRef}
        type="button"
        className={`left-rail-btn left-rail-project-hub-btn ${isOpen ? 'left-rail-btn-active' : ''}`}
        onClick={() => {
          recordTranscriptionKeyboardAction('toolbarProjectHubMenuToggle');
          setIsOpen((prev) => {
            const next = !prev;
            if (next) syncPanelPosition();
            return next;
          });
        }}
        aria-label={
          activeProjectTitle.length > 0
            ? activeProjectTitle
            : t(locale, 'transcription.projectHub.toggle')
        }
        title={
          activeProjectTitle.length > 0
            ? activeProjectTitle
            : t(locale, 'transcription.projectHub.toggle')
        }
      >
        <MaterialSymbol name="inventory_2" aria-hidden className={JIEYU_MATERIAL_NAV} />
        <span>
          {activeProjectTitle.length > 0
            ? activeProjectTitle
            : t(locale, 'transcription.projectHub.shortTitle')}
        </span>
      </button>
      <input
        ref={projectArchiveInputRef}
        type="file"
        accept=".jyt,.jym,.jyb"
        aria-label={t(locale, 'transcription.projectHub.importProject')}
        className="left-rail-project-hub-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            fireAndForget(handleProjectArchivePicked(file), {
              context: 'src/components/transcription/LeftRailProjectHub.tsx:L634',
              policy: 'user-visible',
            });
          }
          event.target.value = '';
        }}
      />
      <input
        ref={rawSnapshotInputRef}
        type="file"
        accept=".zip"
        aria-label={t(locale, 'transcription.projectHub.rawSnapshotImport')}
        className="left-rail-project-hub-file-input left-rail-project-hub-raw-snapshot-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            fireAndForget(handleProjectArchivePicked(file), {
              context: 'src/components/transcription/LeftRailProjectHub.tsx:L1034',
              policy: 'user-visible',
            });
          }
          event.target.value = '';
        }}
      />
      <input
        ref={importFileRef}
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
      footer={
        projectImportState ? (
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
                fireAndForget(handleConfirmProjectImport(), {
                  context: 'src/components/transcription/LeftRailProjectHub.tsx:L689',
                  policy: 'user-visible',
                });
              }}
            >
              {projectImportState.importing
                ? t(locale, 'transcription.projectHub.importing')
                : projectImportState.restoreMode === 'disaster-restore'
                  ? projectImportState.overwriteArmed
                    ? t(locale, 'transcription.projectHub.confirmJybDisasterAgain')
                    : t(locale, 'transcription.projectHub.confirmJybDisaster')
                  : projectImportState.preview.libraryBackup
                    ? t(locale, 'transcription.projectHub.confirmJybImport')
                    : projectImportState.restoreMode === 'overwrite-current'
                      ? projectImportState.overwriteArmed
                        ? t(locale, 'transcription.projectHub.confirmOverwriteAgain')
                        : t(locale, 'transcription.projectHub.confirmOverwrite')
                      : projectImportState.preview.restoreAsNewProject
                        ? t(locale, 'transcription.projectHub.confirmRestoreAsNew')
                        : t(locale, 'transcription.projectHub.confirmImport')}
            </PanelButton>
          </>
        ) : undefined
      }
    >
      {projectImportState && (
        <>
          <PanelSummary
            className="left-rail-project-import-summary"
            title={projectImportState.file.name}
            description={tf(locale, 'transcription.projectHub.importDialogKind', {
              kind: projectImportState.preview.kind.toUpperCase(),
            })}
            meta={
              <div className="panel-meta">
                <PanelChip>
                  {tf(locale, 'transcription.projectHub.importDialogExportedAt', {
                    at: projectImportState.preview.manifest.exportedAt,
                  })}
                </PanelChip>
                <PanelChip
                  variant={projectImportState.preview.totalConflicts > 0 ? 'warning' : 'default'}
                >
                  {tf(locale, 'transcription.projectHub.importDialogStats', {
                    incoming: projectImportState.preview.totalIncoming,
                    conflicts: projectImportState.preview.totalConflicts,
                    insertable: previewInsertEstimate,
                  })}
                </PanelChip>
                {projectImportState.preview.restoreAsNewProject ? (
                  <>
                    <PanelChip>
                      {tf(locale, 'transcription.projectHub.restoreSourceProject', {
                        title: projectImportState.preview.restoreAsNewProject.sourceProjectTitle,
                      })}
                    </PanelChip>
                    {projectImportState.preview.restoreAsNewProject.mediaWithoutBytes > 0 ? (
                      <PanelChip variant="warning">
                        {tf(locale, 'transcription.projectHub.restoreMediaMissing', {
                          count: projectImportState.preview.restoreAsNewProject.mediaWithoutBytes,
                        })}
                      </PanelChip>
                    ) : null}
                    {projectImportState.preview.restoreAsNewProject.includedBytesCount > 0 ? (
                      <PanelChip data-testid="project-import-bytes-included">
                        {tf(locale, 'transcription.projectHub.restoreBytesIncluded', {
                          count: projectImportState.preview.restoreAsNewProject.includedBytesCount,
                          sizeMb: (
                            projectImportState.preview.restoreAsNewProject.includedBytesTotal /
                            (1024 * 1024)
                          ).toFixed(1),
                        })}
                      </PanelChip>
                    ) : null}
                    {projectImportState.preview.restoreAsNewProject.skippedLanguageIds.length >
                    0 ? (
                      <PanelChip variant="warning">
                        {tf(locale, 'transcription.projectHub.restoreSkippedLanguages', {
                          ids: projectImportState.preview.restoreAsNewProject.skippedLanguageIds.join(
                            ', ',
                          ),
                        })}
                      </PanelChip>
                    ) : null}
                    {projectImportState.preview.restoreAsNewProject.skippedOrphanRows.length > 0 ? (
                      <PanelChip variant="warning">
                        {tf(locale, 'transcription.projectHub.restoreSkippedOrphanRows', {
                          count:
                            projectImportState.preview.restoreAsNewProject.skippedOrphanRows.reduce(
                              (sum, item) => sum + item.count,
                              0,
                            ),
                          collections:
                            projectImportState.preview.restoreAsNewProject.skippedOrphanRows
                              .map((item) => `${item.collection} (${item.count})`)
                              .join(', '),
                        })}
                      </PanelChip>
                    ) : null}
                  </>
                ) : null}
                {projectImportState.preview.unresolvedSystemRefs.length > 0 ? (
                  <PanelChip variant="warning">
                    {tf(locale, 'transcription.projectHub.importDialogUnresolvedSystemRefs', {
                      ids: projectImportState.preview.unresolvedSystemRefs.join(', '),
                    })}
                  </PanelChip>
                ) : null}
              </div>
            }
          />

          {projectImportState.preview.libraryBackup ? (
            <PanelSection
              className="left-rail-project-import-strategy-section"
              title={t(locale, 'transcription.projectHub.importDialogStrategy')}
            >
              <LibraryBackupImportOptions
                locale={locale}
                backup={projectImportState.preview.libraryBackup}
                restoreMode={projectImportState.restoreMode}
                selectedProjectIds={projectImportState.selectedProjectIds ?? []}
                disabled={projectImportState.importing}
                onRestoreModeChange={(restoreMode) =>
                  setProjectImportState((prev) =>
                    prev ? { ...prev, restoreMode, overwriteArmed: false } : prev,
                  )
                }
                onSelectedProjectIdsChange={(selectedProjectIds) =>
                  setProjectImportState((prev) => (prev ? { ...prev, selectedProjectIds } : prev))
                }
                includeProjectAi={projectImportState.includeProjectAi !== false}
                onIncludeProjectAiChange={(includeProjectAi) =>
                  setProjectImportState((prev) => (prev ? { ...prev, includeProjectAi } : prev))
                }
                restorePreferences={projectImportState.restorePreferences === true}
                onRestorePreferencesChange={(restorePreferences) =>
                  setProjectImportState((prev) => (prev ? { ...prev, restorePreferences } : prev))
                }
              />
            </PanelSection>
          ) : projectImportState.preview.restoreAsNewProject ? (
            <PanelSection
              className="left-rail-project-import-strategy-section"
              title={t(locale, 'transcription.projectHub.importDialogStrategy')}
            >
              {projectImportState.preview.restoreAsNewProject.overwriteCurrentProject ? (
                <fieldset className="left-rail-project-import-strategy">
                  <label>
                    <input
                      type="radio"
                      name="project-import-restore-mode"
                      checked={projectImportState.restoreMode === 'restore-as-new'}
                      onChange={() =>
                        setProjectImportState((prev) =>
                          prev
                            ? { ...prev, restoreMode: 'restore-as-new', overwriteArmed: false }
                            : prev,
                        )
                      }
                    />
                    <span>{t(locale, 'transcription.projectHub.restoreModeNew')}</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="project-import-restore-mode"
                      data-testid="project-import-overwrite-current"
                      disabled={
                        !projectImportState.preview.restoreAsNewProject.overwriteCurrentProject
                          .available
                      }
                      checked={projectImportState.restoreMode === 'overwrite-current'}
                      onChange={() =>
                        setProjectImportState((prev) =>
                          prev
                            ? { ...prev, restoreMode: 'overwrite-current', overwriteArmed: false }
                            : prev,
                        )
                      }
                    />
                    <span>
                      {tf(locale, 'transcription.projectHub.restoreModeOverwrite', {
                        title:
                          projectImportState.preview.restoreAsNewProject.overwriteCurrentProject
                            .targetTitle,
                      })}
                    </span>
                  </label>
                </fieldset>
              ) : null}
              {projectImportState.restoreMode === 'restore-as-new' ? (
                <p data-testid="project-import-restore-as-new">
                  {t(locale, 'transcription.projectHub.restoreAsNewProject')}
                </p>
              ) : null}
              {projectImportState.preview.restoreAsNewProject.overwriteCurrentProject &&
              !projectImportState.preview.restoreAsNewProject.overwriteCurrentProject.available ? (
                <p data-testid="project-import-overwrite-blocked">
                  {tf(locale, 'transcription.projectHub.overwriteBlockedBytes', {
                    count:
                      projectImportState.preview.restoreAsNewProject.overwriteCurrentProject
                        .bytesAtRiskCount,
                  })}
                </p>
              ) : null}
              {projectImportState.restoreMode === 'overwrite-current' ? (
                <p role="alert" data-testid="project-import-overwrite-warning">
                  {t(locale, 'transcription.projectHub.overwriteWarning')}
                </p>
              ) : null}
            </PanelSection>
          ) : null}

          <PanelSection
            className="left-rail-project-import-table-section"
            title={t(locale, 'transcription.projectHub.importDialogTableCollection')}
          >
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
      footer={
        timeMappingDialogState ? (
          <>
            <PanelButton
              variant="ghost"
              disabled={timeMappingDialogState.saving}
              onClick={handleCloseTimeMappingDialog}
            >
              {t(locale, 'transcription.dialog.cancel')}
            </PanelButton>
            <PanelButton
              variant="primary"
              disabled={timeMappingDialogState.saving}
              onClick={() => {
                fireAndForget(handleConfirmTimeMapping(), {
                  context: 'src/components/transcription/LeftRailProjectHub.tsx:L799',
                  policy: 'user-visible',
                });
              }}
            >
              {t(locale, 'transcription.projectHub.timeMappingDialogApply')}
            </PanelButton>
          </>
        ) : undefined
      }
    >
      {timeMappingDialogState ? (
        <>
          <PanelSummary
            className="left-rail-project-import-summary"
            title={t(locale, 'transcription.projectHub.timeMappingDialogTitle')}
            description={timeMappingDialogPreview ?? ''}
          />
          <PanelSection
            className="left-rail-project-import-strategy-section"
            title={t(locale, 'transcription.projectHub.importDialogStrategy')}
          >
            <div className="left-rail-project-time-mapping-form">
              <label className="left-rail-project-time-mapping-field">
                <span>{t(locale, 'transcription.projectHub.timeMappingDialogOffset')}</span>
                <input
                  aria-label={t(locale, 'transcription.projectHub.timeMappingDialogOffset')}
                  type="number"
                  step="0.1"
                  min="0"
                  value={timeMappingDialogState.offsetSecText}
                  onChange={(event) =>
                    setTimeMappingDialogState((prev) =>
                      prev ? { ...prev, offsetSecText: event.target.value } : prev,
                    )
                  }
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
                  onChange={(event) =>
                    setTimeMappingDialogState((prev) =>
                      prev ? { ...prev, scaleText: event.target.value } : prev,
                    )
                  }
                />
              </label>
            </div>
          </PanelSection>

          <PanelSection
            className="left-rail-project-import-table-section"
            title={t(locale, 'transcription.projectHub.timeMappingHistoryTitle')}
          >
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
      footer={
        annotationImportState ? (
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
                fireAndForget(handleConfirmAnnotationImport(), {
                  context: 'src/components/transcription/LeftRailProjectHub.tsx:L885',
                  policy: 'user-visible',
                });
              }}
            >
              {annotationImportState.importing
                ? t(locale, 'transcription.projectHub.importing')
                : t(locale, 'transcription.projectHub.confirmAnnotationImport')}
            </PanelButton>
          </>
        ) : undefined
      }
    >
      {annotationImportState && (
        <>
          <PanelSummary
            className="left-rail-project-import-summary"
            title={annotationImportState.file.name}
            description={t(locale, 'transcription.projectHub.annotationImportDialogSummary')}
          />
          {annotationImportState.sourcePlan ? (
            <p
              className="small-text left-rail-project-import-source-plan"
              data-testid="annotation-import-source-plan"
              data-plan={annotationImportState.sourcePlan.kind}
            >
              {annotationImportState.sourcePlan.kind === 'update-existing'
                ? tf(locale, 'transcription.projectHub.sourcePlan.updateExisting', {
                    name: annotationImportState.sourcePlan.record.displayName,
                  })
                : annotationImportState.sourcePlan.kind === 'same-content'
                  ? tf(locale, 'transcription.projectHub.sourcePlan.sameContent', {
                      name: annotationImportState.sourcePlan.record.displayName,
                    })
                  : annotationImportState.sourcePlan.displayName !==
                      annotationImportState.file.name.trim()
                    ? tf(locale, 'transcription.projectHub.sourcePlan.renamed', {
                        name: annotationImportState.sourcePlan.displayName,
                      })
                    : t(locale, 'transcription.projectHub.sourcePlan.new')}
            </p>
          ) : null}
          {annotationImportState.replacePreview &&
          annotationImportState.replacePreview.unitCount > 0 ? (
            <p
              className="small-text left-rail-project-import-replace-preview"
              data-testid="annotation-import-replace-preview"
              data-unit-count={annotationImportState.replacePreview.unitCount}
            >
              {tf(locale, 'transcription.projectHub.replacePreview', {
                units: annotationImportState.replacePreview.unitCount,
                layers: annotationImportState.replacePreview.layerCount,
              })}
            </p>
          ) : null}

          <PanelSection
            className="left-rail-project-import-strategy-section"
            title={t(locale, 'transcription.projectHub.annotationImportDialogStrategy')}
          >
            <fieldset className="left-rail-project-import-strategy">
              <label>
                <input
                  type="radio"
                  name="annotation-import-strategy"
                  checked={annotationImportState.strategy === 'preserve-source'}
                  onChange={() =>
                    setAnnotationImportState((prev) =>
                      prev ? { ...prev, strategy: 'preserve-source' } : prev,
                    )
                  }
                />
                <span>
                  {t(locale, 'transcription.projectHub.annotationStrategy.preserveSource')}
                </span>
                <span className="small-text">
                  {t(locale, 'transcription.projectHub.annotationStrategy.preserveSourceHint')}
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="annotation-import-strategy"
                  checked={annotationImportState.strategy === 'bridge-target'}
                  onChange={() =>
                    setAnnotationImportState((prev) =>
                      prev ? { ...prev, strategy: 'bridge-target' } : prev,
                    )
                  }
                />
                <span>{t(locale, 'transcription.projectHub.annotationStrategy.bridgeTarget')}</span>
                <span className="small-text">
                  {t(locale, 'transcription.projectHub.annotationStrategy.bridgeTargetHint')}
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="annotation-import-strategy"
                  checked={annotationImportState.strategy === 'preserve-source-and-bridge'}
                  onChange={() =>
                    setAnnotationImportState((prev) =>
                      prev ? { ...prev, strategy: 'preserve-source-and-bridge' } : prev,
                    )
                  }
                />
                <span>
                  {t(locale, 'transcription.projectHub.annotationStrategy.preserveSourceAndBridge')}
                </span>
                <span className="small-text">
                  {t(
                    locale,
                    'transcription.projectHub.annotationStrategy.preserveSourceAndBridgeHint',
                  )}
                </span>
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
      <SnapshotRestoreDialog
        locale={locale}
        isOpen={snapshotRestoreOpen}
        onClose={() => setOverwriteSnapshotsOpen(false)}
      />
    </>
  );
}
