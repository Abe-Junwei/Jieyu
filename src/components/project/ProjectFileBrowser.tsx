import '../../styles/components/project-file-list.css';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { t, tf, useLocale, type Locale } from '../../i18n';
import { LinguisticService } from '../../services/LinguisticService';
import {
  linkProjectSourceFileToAudio,
  listProjectFileViews,
  listProjectSourceFiles,
  observeProjectFileSources,
  rememberImportedSourceFile,
  renameProjectAudio,
  renameProjectSourceFile,
} from '../../services/projectFileOps';
import {
  isSyntheticManuscriptId,
  linkManuscriptsToAudio,
  syntheticManuscriptId,
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

type AudioOption = { id: string; name: string };

/**
 * 手动关联录音（rev5 4.2-4）：只列本项目的录音；文件名唯一匹配的那条标为“建议”，但不自动选中。
 * Manual recording link (rev5 4.2-4): lists this project's recordings; a unique filename match is marked
 * as a suggestion but never preselected.
 */
function SourceLinkSelect(props: {
  row: ProjectFileView;
  audioOptions: readonly AudioOption[];
  onLink: (row: ProjectFileView, mediaId: string | null) => Promise<void>;
}) {
  const locale = useLocale();
  const { row, audioOptions } = props;
  if (row.kind !== 'manuscript' || isSyntheticManuscriptId(row.id) || audioOptions.length === 0) {
    return null;
  }
  return (
    <select
      className="project-file-link-select"
      data-testid="project-file-link-select"
      aria-label={t(locale, 'app.files.linkRecording')}
      value={row.linkedAudioId ?? ''}
      onChange={(event) => void props.onLink(row, event.target.value || null)}
    >
      <option value="">{t(locale, 'app.files.unlinked')}</option>
      {audioOptions.map((option) => (
        <option key={option.id} value={option.id}>
          {option.id === row.suggestedAudioId
            ? tf(locale, 'app.files.suggestedRecording', { name: option.name })
            : option.name}
        </option>
      ))}
    </select>
  );
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
  audioOptions?: readonly AudioOption[];
  onLink?: (row: ProjectFileView, mediaId: string | null) => Promise<void>;
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
      ) : !props.compact && props.onLink && (props.audioOptions?.length ?? 0) > 0 ? (
        <span className="project-file-meta">
          <SourceLinkSelect
            row={row}
            audioOptions={props.audioOptions ?? []}
            onLink={props.onLink}
          />
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

function BoardAudio(props: {
  row: ProjectFileView;
  textId: string;
  editingId: string;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (value: string) => void;
  commitRename: (row: ProjectFileView) => Promise<void>;
  docs: ProjectFileView[];
  audioOptions?: readonly AudioOption[];
  onLink?: (row: ProjectFileView, mediaId: string | null) => Promise<void>;
}) {
  const locale = useLocale();
  const { transcriptionTo, annotationTo, rememberFile } = fileTargets(props.textId, props.row);
  const stages = [
    { label: t(locale, 'app.home.progress.transcription'), rate: props.row.transcriptionRate },
    { label: t(locale, 'app.home.progress.translation'), rate: props.row.translationRate },
    { label: t(locale, 'app.home.progress.annotation'), rate: props.row.annotationRate },
  ];
  return (
    <div className="project-file-audio">
      <div className="project-file-audio-top">
        <span className="project-file-audio-icon">
          <WorkbenchGlyph name="wave" />
        </span>
        <span className="project-file-kind">
          {kindLabel(locale, props.row.audioFormat || props.row.format)}
        </span>
        <span className="project-file-duration">
          {formatDuration(props.row.durationSec) || t(locale, 'app.home.progress.na')}
        </span>
      </div>
      <div className="project-file-audio-title">
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
      </div>
      {props.docs.map((doc) => (
        <BoardDoc
          key={doc.id}
          row={doc}
          textId={props.textId}
          editingId={props.editingId}
          draft={props.draft}
          setDraft={props.setDraft}
          setEditingId={props.setEditingId}
          commitRename={props.commitRename}
          {...(props.audioOptions ? { audioOptions: props.audioOptions } : {})}
          {...(props.onLink ? { onLink: props.onLink } : {})}
        />
      ))}
      <p className="project-file-audio-meta">
        {props.row.sentenceCount !== undefined
          ? `${t(locale, 'app.overview.sentences')} ${props.row.sentenceCount}`
          : t(locale, 'app.files.audio')}
        {props.docs.length > 0
          ? ` · ${t(locale, 'app.overview.manuscriptCount')} ${props.docs.length}`
          : ''}
      </p>
      <div className="project-file-stages">
        {stages.map(({ label, rate }) => (
          <div key={label}>
            <div className="project-file-stage-label">
              <span>{label}</span>
              <strong>{formatRate(locale, rate)}</strong>
            </div>
            {rate === null || rate === undefined ? (
              <span className="project-file-stage-meter" aria-hidden="true" />
            ) : (
              <progress
                className="project-file-stage-meter"
                value={rate}
                max={1}
                aria-label={`${label} ${formatRate(locale, rate)}`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="project-file-audio-actions">
        <Link className="project-file-primary-action" to={transcriptionTo} onClick={rememberFile}>
          {t(locale, 'app.files.enterTranscription')} <span aria-hidden="true">→</span>
        </Link>
        <Link className="project-file-annotation-action" to={annotationTo} onClick={rememberFile}>
          {t(locale, 'app.nav.annotation')}
        </Link>
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
  audioOptions?: readonly AudioOption[];
  onLink?: (row: ProjectFileView, mediaId: string | null) => Promise<void>;
}) {
  const locale = useLocale();
  const { annotationTo, rememberFile } = fileTargets(props.textId, props.row);
  return (
    <div className="project-file-doc">
      <span className="project-file-role">{t(locale, 'app.files.linked')}</span>
      <div className="project-file-doc-row">
        <span className="project-file-kind">{kindLabel(locale, props.row.format)}</span>
        <BoardName
          row={props.row}
          to={annotationTo}
          editingId={props.editingId}
          draft={props.draft}
          setDraft={props.setDraft}
          setEditingId={props.setEditingId}
          commitRename={props.commitRename}
          onNavigate={rememberFile}
        />
      </div>
      {props.onLink ? (
        <SourceLinkSelect
          row={props.row}
          audioOptions={props.audioOptions ?? []}
          onLink={props.onLink}
        />
      ) : null}
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
  const [search, setSearch] = useState('');
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
  useEffect(
    () =>
      observeProjectFileSources(textId, () => {
        void queryClient.invalidateQueries({ queryKey: ['project-source-files', textId] });
        void queryClient.invalidateQueries({ queryKey: ['project-file-views', textId] });
        void queryClient.invalidateQueries({ queryKey: ['project-file-progress', textId] });
      }),
    [queryClient, textId],
  );
  const progressByMedia = new Map((progress.data ?? []).map((row) => [row.mediaId, row] as const));
  const storedSources = sources.data ?? [];
  const manuscriptSources =
    audio !== undefined && !sources.isLoading && storedSources.length === 0 && fallbackManuscript
      ? [
          {
            id: syntheticManuscriptId(textId),
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
    else if (isSyntheticManuscriptId(row.id)) {
      await rememberImportedSourceFile({
        textId,
        name: next,
        format: 'file',
        ...(row.mediaId ? { mediaId: row.mediaId } : {}),
      });
    } else await renameProjectSourceFile(textId, row.id, next);
    await refresh();
  };

  const linkAudio = async (row: ProjectFileView, mediaId: string | null) => {
    await linkProjectSourceFileToAudio(textId, row.id, mediaId);
    await refresh();
  };
  const audioOptions: AudioOption[] = files
    .filter((row) => row.kind === 'audio')
    .map((row) => ({ id: row.id, name: row.name }));

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
  const visibleGroups = groups.filter((group) =>
    [group.audio, ...group.docs].some((row) =>
      row?.name.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  const recordingCount = groups.filter((group) => group.audio !== null).length;

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
            {t(locale, 'app.files.recordings')}
          </h3>
          <span className="project-file-board-count">
            {tf(locale, 'app.files.recordingCount', { count: recordingCount })}
          </span>
          <input
            className="project-file-board-search"
            type="search"
            value={search}
            placeholder={t(locale, 'app.files.search')}
            aria-label={t(locale, 'app.files.search')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      ) : pane ? null : (
        <h3 className="project-file-section-title">
          {t(locale, 'app.files.recordings')} ({groups.length})
        </h3>
      )}
      <div className="project-file-cards">
        {visibleGroups.map((group) => {
          const head = group.audio ?? group.docs[0];
          if (!head) return null;
          return (
            <article
              key={head.id}
              className={
                board && !group.audio ? 'project-file-card is-document-only' : 'project-file-card'
              }
            >
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
                    docs={group.docs}
                    audioOptions={audioOptions}
                    onLink={linkAudio}
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
              {(!board || !group.audio) &&
                group.docs.map((doc) =>
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
                      audioOptions={audioOptions}
                      onLink={linkAudio}
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
                      audioOptions={audioOptions}
                      onLink={linkAudio}
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
      {board && visibleGroups.length === 0 ? (
        <p className="project-file-empty">{t(locale, 'app.files.noMatches')}</p>
      ) : null}
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
