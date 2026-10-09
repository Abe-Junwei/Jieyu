import '../styles/pages/home-page.css';
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ContextMenu } from '../components/ContextMenu';
import { ProjectSetupDialog } from '../components/ProjectSetupDialog';
import { FormField, ModalPanel, PanelButton } from '../components/ui';
import { useAppSidePaneHostOptional, useRegisterAppSidePane } from '../contexts/AppSidePaneContext';
import { getTranscriptionAppService } from '../app/TranscriptionAppService';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { t, tf, useLocale, type Locale } from '../i18n';
import { runProjectRemovalWithPrompts } from '../app/projectRemovalFlow';
import { RemovedCloudProjectsSection } from './RemovedCloudProjectsSection';
import {
  loadAllHomeProjectProgressBundles,
  type HomeProjectProgressBundle,
} from '../utils/homeTranscriptionRecordProgress';
import {
  normalizeProjectLanguageIds,
  readProjectLanguageLists,
} from '../utils/projectLanguageLists';
import {
  clearActiveProjectTextId,
  getActiveProjectTextId,
  publishActiveProjectTextId,
  subscribeActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { WorkbenchFilePane } from './workbench/WorkbenchFilePane';

type EditDraft = {
  textId: string;
  primaryTitle: string;
  englishFallbackTitle: string;
  objectLanguages: string;
  workingLanguages: string;
  error: string;
};

function formatUpdated(locale: Locale, iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function splitLanguageIds(value: string): string[] {
  return normalizeProjectLanguageIds(value.split(/[,，\s]+/));
}

export function HomePage() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedTextId, setSelectedTextId] = useState('');
  const [rowMenu, setRowMenu] = useState<{ textId: string; x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [removedListToken, setRemovedListToken] = useState(0);
  const activeTextId = useSyncExternalStore(
    subscribeActiveProjectTextId,
    getActiveProjectTextId,
    () => '',
  );
  const openedTextId =
    selectedTextId.length > 0 ? selectedTextId : activeTextId.length > 0 ? activeTextId : '';

  const {
    data: bundles = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['homeProjectProgress', locale],
    queryFn: () => loadAllHomeProjectProgressBundles(locale),
    staleTime: 0,
  });

  const opened = bundles.find((bundle) => bundle.textId === openedTextId) ?? bundles[0];
  const selectedId = opened?.textId ?? '';

  const refreshProjects = async () => {
    await queryClient.invalidateQueries({ queryKey: ['homeProjectProgress'] });
    await queryClient.invalidateQueries({ queryKey: ['projectRoster'] });
  };

  const selectProject = (textId: string) => {
    publishActiveProjectTextId(textId);
    setSelectedTextId(textId);
  };

  const openRowMenu = (textId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    selectProject(textId);
    const rect = event.currentTarget.getBoundingClientRect();
    setRowMenu({ textId, x: rect.right, y: rect.bottom + 4 });
  };

  const beginEdit = async (bundle: HomeProjectProgressBundle) => {
    setRowMenu(null);
    const text = await LinguisticService.timeline.getTextById(bundle.textId);
    const lists = readProjectLanguageLists(
      (text?.metadata ?? undefined) as Record<string, unknown> | undefined,
    );
    const title = (text?.title ?? {}) as Record<string, string | undefined>;
    const undTitle = title.und?.trim() ?? '';
    const engTitle = title.eng?.trim() ?? '';
    const enUsTitle = title['en-US']?.trim() ?? '';
    setEdit({
      textId: bundle.textId,
      primaryTitle: undTitle.length > 0 ? undTitle : bundle.titleLabel,
      englishFallbackTitle: engTitle.length > 0 ? engTitle : enUsTitle,
      objectLanguages: lists.objectLanguageIds.join(', '),
      workingLanguages: lists.workingLanguageIds.join(', '),
      error: '',
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    const primaryTitle = edit.primaryTitle.trim();
    const objectLanguageIds = splitLanguageIds(edit.objectLanguages);
    if (primaryTitle.length === 0 || objectLanguageIds.length === 0) {
      setEdit({ ...edit, error: t(locale, 'msg.projectSetup.objectLanguageRequired') });
      return;
    }
    setSavingEdit(true);
    try {
      await LinguisticService.timeline.updateProjectLanguageLists({
        textId: edit.textId,
        primaryTitle,
        englishFallbackTitle: edit.englishFallbackTitle.trim(),
        objectLanguageIds,
        workingLanguageIds: splitLanguageIds(edit.workingLanguages),
      });
      setEdit(null);
      await refreshProjects();
    } catch (err) {
      setEdit({
        ...edit,
        error: err instanceof Error ? err.message : t(locale, 'msg.projectSetup.createFailed'),
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteProject = async (textId: string) => {
    setRowMenu(null);
    const appService = getTranscriptionAppService();
    // 协作过的项目只从本机移除（rev5 9.1、D6）| Collaborated projects are only removed locally
    const plan = appService.planDeleteProject(textId);
    const confirmKey =
      plan.mode === 'remove-local'
        ? 'transcription.action.confirmRemoveProjectLocally'
        : 'transcription.action.confirmDeleteProject';
    if (!window.confirm(t(locale, confirmKey))) return;
    const outcome = await runProjectRemovalWithPrompts(appService, textId, {
      confirmRemoveLocally: () => true,
      confirmDiscardUnsynced: (count) =>
        window.confirm(tf(locale, 'transcription.action.confirmDiscardUnsyncedChanges', { count })),
    });
    if (outcome === 'cancelled') return;
    if (outcome === 'remove-local') setRemovedListToken((value) => value + 1);
    if (getActiveProjectTextId() === textId) clearActiveProjectTextId();
    if (selectedTextId === textId) setSelectedTextId('');
    await refreshProjects();
  };

  const menuBundle = bundles.find((bundle) => bundle.textId === rowMenu?.textId);
  const sidePaneHost = useAppSidePaneHostOptional();
  const projectPaneTitle = t(locale, 'transcription.projectHub.group.project');
  useRegisterAppSidePane({
    title: projectPaneTitle,
    subtitle: '',
    content: null,
    enabled: sidePaneHost !== null,
  });
  const [projectPaneSlot, setProjectPaneSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!sidePaneHost) {
      setProjectPaneSlot(null);
      return;
    }
    setProjectPaneSlot(document.getElementById('app-side-pane-body-slot'));
  }, [sidePaneHost]);

  const projectRoster = (
    <div className="home-workbench-roster" aria-label={projectPaneTitle}>
      <button type="button" className="home-roster-create" onClick={() => setSetupOpen(true)}>
        {t(locale, 'transcription.toolbar.newProject')}
      </button>
      {isLoading ? (
        <div className="home-page-loading" aria-busy="true">
          {t(locale, 'app.home.loading')}
        </div>
      ) : null}
      {isError ? (
        <div className="home-page-error" role="alert">
          {t(locale, 'app.home.errorPrefix')}
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}
      {!isLoading && !isError && bundles.length === 0 ? (
        <p className="home-project-row-time">{t(locale, 'app.home.noProjects')}</p>
      ) : null}
      {bundles.map((bundle) => (
        <div
          key={bundle.textId}
          className={
            bundle.textId === selectedId ? 'home-project-row is-selected' : 'home-project-row'
          }
        >
          <button
            type="button"
            className="home-project-row-main"
            aria-label={bundle.titleLabel}
            onClick={() => selectProject(bundle.textId)}
          >
            <span className="home-project-row-title">{bundle.titleLabel}</span>
            <span className="home-project-row-meta">
              <span className="home-project-row-time">
                {formatUpdated(locale, bundle.updatedAt)}
              </span>
              {bundle.textId === selectedId ? (
                <span className="home-project-active">{t(locale, 'app.home.projectActive')}</span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            className="home-project-row-more"
            aria-label={t(locale, 'app.home.projectActions')}
            onClick={(event) => openRowMenu(bundle.textId, event)}
          >
            ···
          </button>
        </div>
      ))}
      <RemovedCloudProjectsSection
        locale={locale}
        refreshToken={removedListToken}
        onRedownloaded={(projectId) => {
          setSelectedTextId(projectId);
          void refreshProjects();
        }}
      />
    </div>
  );

  return (
    <div className="home-page">
      {projectPaneSlot
        ? createPortal(projectRoster, projectPaneSlot)
        : sidePaneHost
          ? null
          : projectRoster}
      <div className="home-workbench-main">
        {opened ? (
          <WorkbenchFilePane
            locale={locale}
            textId={opened.textId}
            title={opened.titleLabel}
            updatedLabel={formatUpdated(locale, opened.updatedAt)}
            {...(opened.currentDocumentLabel !== undefined
              ? { currentDocumentLabel: opened.currentDocumentLabel }
              : {})}
            {...(opened.languageCode !== undefined && opened.languageCode.length > 0
              ? { languageCode: opened.languageCode }
              : {})}
            records={opened.records}
            {...(opened.defaultTranscriptionLayerId !== undefined &&
            opened.defaultTranscriptionLayerId.length > 0
              ? { defaultTranscriptionLayerId: opened.defaultTranscriptionLayerId }
              : {})}
            onConfigureLanguages={() => {
              void beginEdit(opened);
            }}
            onChanged={() => void refetch()}
          />
        ) : !isLoading && !isError ? (
          <div className="home-workbench-empty entry-card entry-card--dashed">
            <p>{t(locale, 'app.home.noProjects')}</p>
            <button type="button" className="btn btn-primary" onClick={() => setSetupOpen(true)}>
              {t(locale, 'transcription.toolbar.newProject')}
            </button>
          </div>
        ) : null}
      </div>
      {rowMenu && menuBundle ? (
        <ContextMenu
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: t(locale, 'app.home.editMetadata'),
              onClick: () => void beginEdit(menuBundle),
            },
            {
              label: t(locale, 'transcription.toolbar.deleteCurrentProject'),
              danger: true,
              onClick: () => void deleteProject(menuBundle.textId),
            },
          ]}
        />
      ) : null}
      <ProjectSetupDialog
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSubmit={async (input) => {
          const result = await getTranscriptionAppService().createProject(input);
          publishActiveProjectTextId(result.textId);
          setSelectedTextId(result.textId);
          setSetupOpen(false);
          await refreshProjects();
        }}
      />
      <ModalPanel
        isOpen={edit !== null}
        onClose={() => setEdit(null)}
        title={t(locale, 'app.home.editMetadata')}
        closeLabel={t(locale, 'msg.projectSetup.close')}
        footer={
          <PanelButton
            type="button"
            variant="primary"
            disabled={savingEdit}
            onClick={() => void saveEdit()}
          >
            {t(locale, 'msg.projectSetup.saveLanguages')}
          </PanelButton>
        }
      >
        {edit ? (
          <>
            <FormField label={t(locale, 'msg.projectSetup.titleZhLabel')}>
              <input
                className="input panel-input"
                type="text"
                value={edit.primaryTitle}
                onChange={(event) =>
                  setEdit({ ...edit, primaryTitle: event.target.value, error: '' })
                }
              />
            </FormField>
            <FormField label={t(locale, 'msg.projectSetup.titleEnLabel')}>
              <input
                className="input panel-input"
                type="text"
                value={edit.englishFallbackTitle}
                onChange={(event) =>
                  setEdit({ ...edit, englishFallbackTitle: event.target.value, error: '' })
                }
              />
            </FormField>
            <FormField
              label={t(locale, 'msg.projectSetup.objectLanguagesLabel')}
              {...(edit.error.length > 0 ? { error: edit.error } : {})}
            >
              <input
                className="input panel-input"
                type="text"
                value={edit.objectLanguages}
                placeholder={t(locale, 'msg.projectSetup.languageCodePlaceholder')}
                onChange={(event) =>
                  setEdit({ ...edit, objectLanguages: event.target.value, error: '' })
                }
              />
            </FormField>
            <FormField label={t(locale, 'msg.projectSetup.workingLanguagesLabel')}>
              <input
                className="input panel-input"
                type="text"
                value={edit.workingLanguages}
                placeholder={t(locale, 'msg.projectSetup.languageCodePlaceholder')}
                onChange={(event) =>
                  setEdit({ ...edit, workingLanguages: event.target.value, error: '' })
                }
              />
            </FormField>
          </>
        ) : null}
      </ModalPanel>
    </div>
  );
}
