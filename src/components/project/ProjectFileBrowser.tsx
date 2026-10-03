import '../../styles/components/project-file-list.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { t, useLocale, type Locale } from '../../i18n';
import { LinguisticService } from '../../services/LinguisticService';
import {
  listProjectFileViews,
  listProjectSourceFiles,
  rememberImportedSourceFile,
  renameProjectAudio,
  renameProjectSourceFile,
} from '../../services/projectFileOps';
import {
  linkManuscriptsToAudio,
  type ProjectAudioFile,
  type ProjectFileView,
} from '../../utils/projectSourceFiles';
import { loadHomeProjectProgressBundle } from '../../utils/homeTranscriptionRecordProgress';
import {
  buildTranscriptionDeepLinkHref,
  rememberTranscriptionWorkspaceReturnHint,
} from '../../utils/transcriptionUrlDeepLink';
import { WorkbenchGlyph } from './workbenchGlyphs';

const FORMAT_LABEL: Record<string, string> = {
  audio: '',
  eaf: 'EAF',
  textgrid: 'TextGrid',
  trs: 'TRS',
  flextext: 'FLEx',
  toolbox: 'Toolbox',
  txt: 'TXT',
  jyt: 'JYT',
  jym: 'JYM',
  file: 'FILE',
};

function annotationHref(textId: string, mediaId?: string): string {
  const params = new URLSearchParams();
  params.set('textId', textId);
  if (mediaId && mediaId.length > 0) params.set('mediaId', mediaId);
  return `/annotation?${params.toString()}`;
}

function formatDuration(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec)) return '';
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatRate(locale: Locale, rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return t(locale, 'app.home.progress.na');
  }
  return `${Math.round(Math.max(0, Math.min(1, rate)) * 100)}%`;
}

function progressText(
  locale: Locale,
  row: Pick<ProjectFileView, 'transcriptionRate' | 'translationRate' | 'annotationRate'>,
): string | null {
  if (
    row.transcriptionRate === undefined &&
    row.translationRate === undefined &&
    row.annotationRate === undefined
  ) {
    return null;
  }
  return [
    `${t(locale, 'app.home.progress.transcription')} ${formatRate(locale, row.transcriptionRate)}`,
    `${t(locale, 'app.home.progress.translation')} ${formatRate(locale, row.translationRate)}`,
    `${t(locale, 'app.home.progress.annotation')} ${formatRate(locale, row.annotationRate)}`,
  ].join(' · ');
}

function kindLabel(locale: Locale, format: string): string {
  if (format === 'audio') return t(locale, 'app.files.audio');
  if (format === 'file') return t(locale, 'app.files.manuscript');
  return FORMAT_LABEL[format] ?? format.toUpperCase();
}

function FileLine(props: {
  row: ProjectFileView;
  textId: string;
  editingId: string;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (value: string) => void;
  commitRename: (row: ProjectFileView) => Promise<void>;
  progressByMedia: Map<
    string,
    {
      transcriptionRate: number | null;
      translationRate: number | null;
      annotationRate: number | null;
    }
  >;
  showProgress: boolean;
  /** Narrow side-pane: hide duration/progress columns that break the 260px grid. */
  compact?: boolean;
  currentWorkspace?: 'transcription' | 'annotation';
}) {
  const locale = useLocale();
  const { row, textId } = props;
  const transcriptionTo = buildTranscriptionDeepLinkHref({
    textId,
    ...(row.mediaId ? { mediaId: row.mediaId } : {}),
  });
  const annotationTo = annotationHref(textId, row.mediaId);
  const primaryTo =
    props.currentWorkspace === 'annotation' || row.kind === 'manuscript'
      ? annotationTo
      : transcriptionTo;
  const showTranscriptionLink = props.currentWorkspace !== 'transcription';
  const showAnnotationLink = props.currentWorkspace !== 'annotation';
  const visibleName = row.name.length > 0 ? row.name : t(locale, 'app.files.manuscript');
  const storedProgress = row.mediaId ? props.progressByMedia.get(row.mediaId) : undefined;
  const progressRow =
    row.transcriptionRate !== undefined || !storedProgress
      ? row
      : {
          ...row,
          transcriptionRate: storedProgress.transcriptionRate,
          translationRate: storedProgress.translationRate,
          annotationRate: storedProgress.annotationRate,
        };
  const stats = props.showProgress && !props.compact ? progressText(locale, progressRow) : null;
  const rememberFile = () => {
    if (!row.mediaId) return;
    rememberTranscriptionWorkspaceReturnHint({ textId, mediaId: row.mediaId });
  };
  return (
    <div className={row.kind === 'manuscript' ? 'project-file-line is-doc' : 'project-file-line'}>
      <span className="project-file-kind">{kindLabel(locale, row.format)}</span>
      <span className="project-file-main">
        {props.editingId === row.id ? (
          <input
            className="project-file-name-input"
            value={props.draft}
            aria-label={t(locale, 'app.files.rename')}
            autoFocus
            onChange={(event) => props.setDraft(event.target.value)}
            onBlur={() => void props.commitRename(row)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void props.commitRename(row);
              if (event.key === 'Escape') props.setEditingId('');
            }}
          />
        ) : (
          <Link className="project-file-name" to={primaryTo} onClick={rememberFile}>
            {visibleName}
          </Link>
        )}
      </span>
      {!props.compact && row.kind === 'audio' ? (
        <span className="project-file-meta">
          {formatDuration(row.durationSec)}
          {stats ? ` · ${stats}` : ''}
        </span>
      ) : !props.compact && stats ? (
        <span className="project-file-progress">{stats}</span>
      ) : null}
      {showTranscriptionLink || showAnnotationLink ? (
        <span className="project-file-links">
          {showTranscriptionLink ? (
            <Link to={transcriptionTo} onClick={rememberFile}>
              {t(locale, 'app.nav.transcription')}
            </Link>
          ) : null}
          {showAnnotationLink ? (
            <Link to={annotationTo} onClick={rememberFile}>
              {t(locale, 'app.nav.annotation')}
            </Link>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        className="project-file-rename"
        aria-label={t(locale, 'app.files.rename')}
        onClick={() => {
          props.setEditingId(row.id);
          props.setDraft(visibleName);
        }}
      >
        ✎
      </button>
    </div>
  );
}

function fileTargets(textId: string, row: ProjectFileView) {
  const transcriptionTo = buildTranscriptionDeepLinkHref({
    textId,
    ...(row.mediaId ? { mediaId: row.mediaId } : {}),
  });
  const annotationTo = annotationHref(textId, row.mediaId);
  const rememberFile = () => {
    if (!row.mediaId) return;
    rememberTranscriptionWorkspaceReturnHint({ textId, mediaId: row.mediaId });
  };
  return { transcriptionTo, annotationTo, rememberFile };
}

function dashProgress(locale: Locale): string {
  const na = t(locale, 'app.home.progress.na');
  return [
    `${t(locale, 'app.home.progress.transcription')} ${na}`,
    `${t(locale, 'app.home.progress.translation')} ${na}`,
    `${t(locale, 'app.home.progress.annotation')} ${na}`,
  ].join(' · ');
}

function BoardName(props: {
  row: ProjectFileView;
  to: string;
  editingId: string;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (value: string) => void;
  commitRename: (row: ProjectFileView) => Promise<void>;
  onNavigate: () => void;
}) {
  const locale = useLocale();
  const visibleName =
    props.row.name.length > 0 ? props.row.name : t(locale, 'app.files.manuscript');
  if (props.editingId === props.row.id) {
    return (
      <input
        className="project-file-name-input"
        value={props.draft}
        aria-label={t(locale, 'app.files.rename')}
        autoFocus
        onChange={(event) => props.setDraft(event.target.value)}
        onBlur={() => void props.commitRename(props.row)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void props.commitRename(props.row);
          if (event.key === 'Escape') props.setEditingId('');
        }}
      />
    );
  }
  return (
    <>
      <Link className="project-file-name" to={props.to} onClick={props.onNavigate}>
        {visibleName}
      </Link>
      <button
        type="button"
        className="project-file-rename"
        aria-label={t(locale, 'app.files.rename')}
        onClick={() => {
          props.setEditingId(props.row.id);
          props.setDraft(visibleName);
        }}
      >
        <WorkbenchGlyph name="pencil" />
      </button>
    </>
  );
}

function BoardLinks(props: {
  transcriptionTo: string;
  annotationTo: string;
  onNavigate: () => void;
}) {
  const locale = useLocale();
  return (
    <span className="project-file-links">
      <Link to={props.transcriptionTo} onClick={props.onNavigate}>
        {t(locale, 'app.nav.transcription')}
      </Link>
      <Link to={props.annotationTo} onClick={props.onNavigate}>
        {t(locale, 'app.nav.annotation')}
      </Link>
    </span>
  );
}

function BoardAudio(props: {
  row: ProjectFileView;
  textId: string;
  editingId: string;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (value: string) => void;
  commitRename: (row: ProjectFileView) => Promise<void>;
  stats: string;
}) {
  const locale = useLocale();
  const { transcriptionTo, annotationTo, rememberFile } = fileTargets(props.textId, props.row);
  return (
    <div className="project-file-audio">
      <div className="project-file-audio-row">
        <span className="project-file-kind">{kindLabel(locale, props.row.format)}</span>
        <Link
          className="project-file-play"
          to={transcriptionTo}
          aria-label={t(locale, 'app.files.play')}
          onClick={rememberFile}
        >
          <WorkbenchGlyph name="play" />
        </Link>
        <span className="project-file-main">
          <BoardName
            row={props.row}
            to={transcriptionTo}
            editingId={props.editingId}
            draft={props.draft}
            setDraft={props.setDraft}
            setEditingId={props.setEditingId}
            commitRename={props.commitRename}
            onNavigate={rememberFile}
          />
        </span>
        <span className="project-file-duration">
          <WorkbenchGlyph name="wave" />
          {formatDuration(props.row.durationSec)}
        </span>
      </div>
      <div className="project-file-audio-sub">
        <div className="project-file-subline">
          <BoardLinks
            transcriptionTo={transcriptionTo}
            annotationTo={annotationTo}
            onNavigate={rememberFile}
          />
          <span className="project-file-progress">{props.stats}</span>
        </div>
      </div>
    </div>
  );
}

function BoardDoc(props: {
  row: ProjectFileView;
  textId: string;
  editingId: string;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (value: string) => void;
  commitRename: (row: ProjectFileView) => Promise<void>;
  stats: string | null;
}) {
  const locale = useLocale();
  const { transcriptionTo, annotationTo, rememberFile } = fileTargets(props.textId, props.row);
  const primaryTo = annotationTo;
  return (
    <div className="project-file-doc">
      <span className="project-file-kind">{kindLabel(locale, props.row.format)}</span>
      <span className="project-file-main">
        <BoardName
          row={props.row}
          to={primaryTo}
          editingId={props.editingId}
          draft={props.draft}
          setDraft={props.setDraft}
          setEditingId={props.setEditingId}
          commitRename={props.commitRename}
          onNavigate={rememberFile}
        />
      </span>
      <span className="project-file-role">{t(locale, 'app.files.linked')}</span>
      <BoardLinks
        transcriptionTo={transcriptionTo}
        annotationTo={annotationTo}
        onNavigate={rememberFile}
      />
      {props.stats ? <span className="project-file-progress">{props.stats}</span> : null}
    </div>
  );
}

export function ProjectFileBrowser(props: {
  textId: string;
  /** Workbench main pane uses `board`; transcription/annotation side panes use `pane`. */
  variant?: 'board' | 'pane';
  currentWorkspace?: 'transcription' | 'annotation';
  audio?: ProjectAudioFile[];
  /** Shown when this project has transcript text but no stored import filename yet. */
  fallbackManuscript?: boolean;
  onChanged?: () => void;
}) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { textId, audio, fallbackManuscript = false, onChanged } = props;
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState('');
  const sources = useQuery({
    queryKey: ['project-source-files', textId],
    queryFn: () => listProjectSourceFiles(textId),
    enabled: textId.trim().length > 0 && audio !== undefined,
  });
  const loaded = useQuery({
    queryKey: ['project-file-views', textId],
    queryFn: () => listProjectFileViews(textId),
    enabled: textId.trim().length > 0 && audio === undefined,
  });
  const progress = useQuery({
    queryKey: ['project-file-progress', textId, locale],
    queryFn: async () => {
      const text = await LinguisticService.timeline.getTextById(textId);
      if (!text) return [];
      return (await loadHomeProjectProgressBundle(text, locale)).records;
    },
    enabled: textId.trim().length > 0 && audio === undefined,
  });
  const progressByMedia = new Map((progress.data ?? []).map((row) => [row.mediaId, row] as const));
  const storedSources = sources.data ?? [];
  const manuscriptSources =
    audio !== undefined && !sources.isLoading && storedSources.length === 0 && fallbackManuscript
      ? [
          {
            id: `src-manuscript-${textId}`,
            name: t(locale, 'app.files.manuscript'),
            format: 'file',
            ...(audio.length === 1 && audio[0]
              ? { mediaId: audio[0].id, linkedMediaFilename: audio[0].filename }
              : {}),
          },
        ]
      : storedSources;
  const files: ProjectFileView[] =
    audio !== undefined ? linkManuscriptsToAudio(audio, manuscriptSources) : (loaded.data ?? []);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['project-source-files', textId] });
    await queryClient.invalidateQueries({ queryKey: ['project-file-views', textId] });
    await queryClient.invalidateQueries({ queryKey: ['homeProjectProgress'] });
    await queryClient.invalidateQueries({ queryKey: ['project-file-progress', textId] });
    onChanged?.();
  };

  const commitRename = async (row: ProjectFileView) => {
    const next = draft.trim();
    setEditingId('');
    if (next.length === 0 || next === row.name) return;
    if (row.kind === 'audio' && row.mediaId) await renameProjectAudio(row.mediaId, next);
    else if (row.id.startsWith('src-manuscript-')) {
      await rememberImportedSourceFile({
        textId,
        name: next,
        format: 'file',
        ...(row.mediaId ? { mediaId: row.mediaId } : {}),
      });
    } else await renameProjectSourceFile(textId, row.id, next);
    await refresh();
  };

  if (textId.trim().length === 0) return null;
  if (audio === undefined && loaded.isLoading) return null;
  if (audio !== undefined && audio.length === 0 && sources.isLoading) return null;
  if (files.length === 0)
    return (
      <p className={props.variant === 'pane' ? 'project-file-empty' : 'home-project-row-time'}>
        {t(locale, 'app.home.noFiles')}
      </p>
    );

  const groups: { audio: ProjectFileView | null; docs: ProjectFileView[] }[] = [];
  for (const row of files) {
    if (row.kind === 'audio') {
      groups.push({ audio: row, docs: [] });
      continue;
    }
    const host = groups.find((group) => group.audio?.id === row.linkedAudioId);
    if (host) host.docs.push(row);
    else groups.push({ audio: null, docs: [row] });
  }

  const statsFor = (row: ProjectFileView): string | null => {
    const storedProgress = row.mediaId ? progressByMedia.get(row.mediaId) : undefined;
    const progressRow =
      row.transcriptionRate !== undefined || !storedProgress
        ? row
        : {
            ...row,
            transcriptionRate: storedProgress.transcriptionRate,
            translationRate: storedProgress.translationRate,
            annotationRate: storedProgress.annotationRate,
          };
    return progressText(locale, progressRow);
  };
  const board = props.variant === 'board';
  const pane = props.variant === 'pane';

  return (
    <section
      className={
        board
          ? 'project-file-section project-file-board'
          : pane
            ? 'project-file-section project-file-pane'
            : 'project-file-section'
      }
      aria-label={t(locale, pane ? 'app.files.list' : 'app.files.recordings')}
      {...(pane ? { 'data-testid': 'project-file-pane' } : {})}
    >
      {board ? (
        <div className="project-file-section-head">
          <h3 className="project-file-section-title">
            <WorkbenchGlyph name="wave" />
            {t(locale, 'app.files.recordings')} ({groups.length})
          </h3>
          <p className="project-file-legend">
            <span className="is-done">{t(locale, 'app.files.legendDone')}</span>
            <span>{t(locale, 'app.files.legendPending')}</span>
          </p>
        </div>
      ) : pane ? null : (
        <h3 className="project-file-section-title">
          {t(locale, 'app.files.recordings')} ({groups.length})
        </h3>
      )}
      <div className="project-file-cards">
        {groups.map((group) => {
          const head = group.audio ?? group.docs[0];
          if (!head) return null;
          return (
            <article key={head.id} className="project-file-card">
              {group.audio ? (
                board ? (
                  <BoardAudio
                    row={group.audio}
                    textId={textId}
                    editingId={editingId}
                    draft={draft}
                    setDraft={setDraft}
                    setEditingId={setEditingId}
                    commitRename={commitRename}
                    stats={statsFor(group.audio) ?? dashProgress(locale)}
                  />
                ) : (
                  <FileLine
                    row={group.audio}
                    textId={textId}
                    editingId={editingId}
                    draft={draft}
                    setDraft={setDraft}
                    setEditingId={setEditingId}
                    commitRename={commitRename}
                    progressByMedia={progressByMedia}
                    showProgress={!pane && group.docs.length === 0}
                    compact={pane}
                    {...(props.currentWorkspace
                      ? { currentWorkspace: props.currentWorkspace }
                      : {})}
                  />
                )
              ) : null}
              {group.docs.map((doc) =>
                board ? (
                  <BoardDoc
                    key={doc.id}
                    row={doc}
                    textId={textId}
                    editingId={editingId}
                    draft={draft}
                    setDraft={setDraft}
                    setEditingId={setEditingId}
                    commitRename={commitRename}
                    stats={group.audio ? null : statsFor(doc)}
                  />
                ) : (
                  <FileLine
                    key={doc.id}
                    row={doc}
                    textId={textId}
                    editingId={editingId}
                    draft={draft}
                    setDraft={setDraft}
                    setEditingId={setEditingId}
                    commitRename={commitRename}
                    progressByMedia={progressByMedia}
                    showProgress={!pane}
                    compact={pane}
                    {...(props.currentWorkspace
                      ? { currentWorkspace: props.currentWorkspace }
                      : {})}
                  />
                ),
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ProjectFilePaneSection(props: {
  textId: string;
  currentWorkspace: 'transcription' | 'annotation';
}) {
  const locale = useLocale();
  if (props.textId.trim().length === 0) return null;
  return (
    <section
      className="app-side-pane-group app-side-pane-files-group"
      aria-label={t(locale, 'app.files.list')}
    >
      <div
        className="app-side-pane-group-toggle app-side-pane-group-toggle-static"
        role="presentation"
      >
        <span className="app-side-pane-section-title">{t(locale, 'app.files.list')}</span>
      </div>
      <div className="app-side-pane-nav app-side-pane-files-wrap">
        <ProjectFileBrowser
          variant="pane"
          currentWorkspace={props.currentWorkspace}
          textId={props.textId}
        />
      </div>
    </section>
  );
}
