import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnnotationImportMismatchDialog } from '../../components/AnnotationImportMismatchDialog';
import { ContextMenu } from '../../components/ContextMenu';
import { EafTierRoleDialog } from '../../components/EafTierRoleDialog';
import { useImportExport } from '../../hooks/importExport/useImportExport';
import { t, tf, type Locale } from '../../i18n';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { TranscriptionRecordProgressRow } from '../../utils/homeTranscriptionRecordProgress';
import { isWaveformMediaTooLong } from '../../utils/waveformDecodeGuard';
import { ProjectFileBrowser } from '../../components/project/ProjectFileBrowser';
import { ProjectOverviewPanel } from '../../components/project/ProjectOverviewPanel';
import { WorkbenchGlyph } from '../../components/project/workbenchGlyphs';
import { fireAndForget } from '../../utils/fireAndForget';
import type { SaveState } from '../../hooks/useTranscriptionData';

function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(file.name));
    };
    audio.src = url;
  });
}

function projectIso(code: string | undefined): string | null {
  const value = code?.trim().toLowerCase() ?? '';
  if (!/^[a-z]{3}$/.test(value) || value === 'und') return null;
  return value;
}

function audioFormat(filename: string | undefined): string {
  const extension = filename?.split('.').pop()?.toUpperCase();
  return extension &&
    ['AAC', 'FLAC', 'M4A', 'MP3', 'MP4', 'MOV', 'OGG', 'WAV', 'WEBM'].includes(extension)
    ? extension
    : 'audio';
}

export function WorkbenchFilePane(props: {
  locale: Locale;
  textId: string;
  title: string;
  updatedLabel: string;
  languageCode?: string;
  records: TranscriptionRecordProgressRow[];
  defaultTranscriptionLayerId?: string;
  onConfigureLanguages?: () => void;
  onChanged: () => void;
}) {
  const {
    locale,
    textId,
    title,
    updatedLabel,
    records,
    defaultTranscriptionLayerId,
    onConfigureLanguages,
    onChanged,
  } = props;
  const iso = projectIso(props.languageCode);
  const queryClient = useQueryClient();
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const annotationInputRef = useRef<HTMLInputElement>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [menu, setMenu] = useState<{ kind: 'import' | 'export'; x: number; y: number } | null>(
    null,
  );
  const graph = useQuery({
    queryKey: ['workbench-graph', textId],
    queryFn: async () => {
      const [units, layers] = await Promise.all([
        LinguisticService.units.listByTextId(textId),
        LinguisticService.layers.listByTextId(textId),
      ]);
      const translations = await LinguisticService.timeline.listUnitTextsByUnitIds(
        units.map((unit) => unit.id),
      );
      return { units, layers, translations };
    },
  });
  const units = graph.data?.units ?? [];
  const layers = graph.data?.layers ?? [];
  const translations = graph.data?.translations ?? [];
  const importExport = useImportExport({
    activeTextId: textId,
    getActiveTextId: async () => textId,
    unitsOnCurrentMedia: units,
    anchors: [],
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot: async () => {
      await queryClient.invalidateQueries({ queryKey: ['homeProjectProgress'] });
      await queryClient.invalidateQueries({ queryKey: ['workbench-graph', textId] });
      await queryClient.invalidateQueries({ queryKey: ['project-source-files', textId] });
      await queryClient.invalidateQueries({ queryKey: ['project-file-views', textId] });
      onChanged();
    },
    setSaveState,
    promptForEafTierRoles: true,
  });

  const importMedia = async (file: File) => {
    const duration = await readMediaDuration(file);
    if (isWaveformMediaTooLong({ byteSize: file.size, durationSec: duration })) {
      setSaveState({ kind: 'error', message: t(locale, 'transcription.action.audioTooLong') });
      return;
    }
    await LinguisticService.media.importAudio({
      textId,
      audioBlob: file,
      filename: file.name,
      duration,
      importMode: 'add',
    });
    setSaveState({
      kind: 'done',
      message: tf(locale, 'transcription.action.audioImported', { filename: file.name }),
    });
    onChanged();
  };

  const openMenu = (kind: 'import' | 'export', event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, x: rect.left, y: rect.bottom + 4 });
  };

  return (
    <div className="home-workbench-files">
      <div className="home-file-header">
        <div className="home-file-heading">
          <div className="home-file-title-row">
            <h2 className="home-file-title">{title}</h2>
            {iso ? (
              <span className="home-file-iso">
                {tf(locale, 'app.overview.iso6393', { code: iso })}
              </span>
            ) : null}
          </div>
          <p className="home-file-updated">
            <WorkbenchGlyph name="clock" />
            {updatedLabel ? tf(locale, 'app.home.lastUpdated', { date: updatedLabel }) : ''}
          </p>
        </div>
        <div className="home-file-actions">
          <button
            type="button"
            className="is-primary"
            onClick={(event) => openMenu('import', event)}
          >
            <WorkbenchGlyph name="upload" />
            {t(locale, 'app.home.import')}
          </button>
          <button type="button" className="is-ghost" onClick={(event) => openMenu('export', event)}>
            <WorkbenchGlyph name="download" />
            {t(locale, 'app.home.export')}
          </button>
        </div>
      </div>
      <ProjectOverviewPanel
        textId={textId}
        records={records}
        {...(onConfigureLanguages ? { onConfigureLanguages } : {})}
      />
      <ProjectFileBrowser
        variant="board"
        textId={textId}
        audio={records
          .filter((row) => row.kind === 'transcription_record')
          .map((row) => ({
            id: row.mediaId,
            name: row.filename,
            filename: row.storageFilename ?? row.filename,
            ...(row.durationSec !== undefined ? { durationSec: row.durationSec } : {}),
            audioFormat: audioFormat(row.storageFilename),
            sentenceCount: row.sentenceCount,
            transcriptionRate: row.transcriptionRate,
            translationRate: row.translationRate,
            annotationRate: row.annotationRate,
          }))}
        fallbackManuscript={records.some((row) => row.transcriptionUnitCount > 0)}
        onChanged={onChanged}
      />
      <input
        ref={mediaInputRef}
        type="file"
        className="home-file-input"
        tabIndex={-1}
        accept=".mp3,.wav,.ogg,.webm,.m4a,.flac,.aac,.mp4,.mov,.avi,.mkv"
        aria-label={t(locale, 'transcription.toolbar.importAudio')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          fireAndForget(importMedia(file), {
            context: 'src/pages/workbench/WorkbenchFilePane.tsx:L196',
            policy: 'user-visible',
          });
        }}
      />
      <input
        ref={annotationInputRef}
        type="file"
        className="home-file-input"
        tabIndex={-1}
        accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"
        aria-label={t(locale, 'app.home.importAnnotation')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          fireAndForget(importExport.handleImportFile(file), {
            context: 'src/pages/workbench/WorkbenchFilePane.tsx:L213',
            policy: 'user-visible',
          });
        }}
      />
      {saveState.kind === 'done' || saveState.kind === 'error' ? (
        <p role={saveState.kind === 'error' ? 'alert' : 'status'}>{saveState.message}</p>
      ) : null}
      <section className="home-template-card" aria-label={t(locale, 'app.home.templates')}>
        <p className="home-template-label">
          <WorkbenchGlyph name="rules" />
          {t(locale, 'app.home.templateRules')}
        </p>
        <nav className="home-template-links">
          <Link to="/assets/language-metadata">{t(locale, 'app.nav.languageMetadata')}</Link>
          <Link to="/assets/structural-profiles">{t(locale, 'app.nav.structuralProfiles')}</Link>
          <Link className="is-warn" to="/assets/orthographies">
            {t(locale, 'app.nav.orthographies')}
          </Link>
          <Link className="is-warn" to="/assets/orthography-bridges">
            {t(locale, 'app.nav.orthographyBridges')}
          </Link>
        </nav>
        <p className="home-template-note">{t(locale, 'app.overview.leipzigNote')}</p>
      </section>
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            menu.kind === 'import'
              ? [
                  {
                    label: t(locale, 'transcription.toolbar.importAudio'),
                    onClick: () => mediaInputRef.current?.click(),
                  },
                  {
                    label: t(locale, 'app.home.importAnnotation'),
                    onClick: () => annotationInputRef.current?.click(),
                  },
                ]
              : [
                  {
                    label: t(locale, 'transcription.toolbar.export.eaf'),
                    onClick: () => void importExport.handleExportEaf(),
                  },
                  {
                    label: t(locale, 'transcription.toolbar.export.textgrid'),
                    onClick: () => void importExport.handleExportTextGrid(),
                  },
                  {
                    label: t(locale, 'transcription.toolbar.export.jyt'),
                    onClick: () => void importExport.handleExportJyt(),
                  },
                  {
                    label: t(locale, 'transcription.toolbar.export.jym'),
                    onClick: () => void importExport.handleExportJym(),
                  },
                ]
          }
        />
      ) : null}
      {importExport.annotationImportMismatchDialog ? (
        <AnnotationImportMismatchDialog
          isOpen={importExport.annotationImportMismatchDialog.isOpen}
          fileName={importExport.annotationImportMismatchDialog.fileName}
          notices={importExport.annotationImportMismatchDialog.notices}
          {...(importExport.annotationImportMismatchDialog.busy !== undefined
            ? { busy: importExport.annotationImportMismatchDialog.busy }
            : {})}
          onClose={importExport.annotationImportMismatchDialog.onClose}
          onConfirm={() => {
            fireAndForget(
              Promise.resolve(importExport.annotationImportMismatchDialog?.onConfirm()),
              {
                context: 'src/pages/workbench/WorkbenchFilePane.tsx:L287',
                policy: 'user-visible',
              },
            );
          }}
        />
      ) : null}
      {importExport.eafTierRoleDialog ? (
        <EafTierRoleDialog
          isOpen={importExport.eafTierRoleDialog.isOpen}
          fileName={importExport.eafTierRoleDialog.fileName}
          tiers={importExport.eafTierRoleDialog.tiers}
          {...(importExport.eafTierRoleDialog.busy !== undefined
            ? { busy: importExport.eafTierRoleDialog.busy }
            : {})}
          onClose={importExport.eafTierRoleDialog.onClose}
          onConfirm={(roles) => {
            fireAndForget(Promise.resolve(importExport.eafTierRoleDialog?.onConfirm(roles)), {
              context: 'src/pages/workbench/WorkbenchFilePane.tsx:L307',
              policy: 'user-visible',
            });
          }}
        />
      ) : null}
    </div>
  );
}
