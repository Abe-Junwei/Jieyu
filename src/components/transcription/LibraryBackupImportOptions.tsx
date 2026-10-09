/**
 * JYB 导入对话框里的选项：选择项目、逐项目导入（默认）或灾难恢复（rev5 7.5、D7、T30、T34）。
 * Options of the JYB import dialog: project selection, per-project import (default) or disaster
 * restore (rev5 7.5, D7, T30, T34).
 */
import { t, tf, type Locale } from '../../i18n';
import type {
  JieyuLibraryBackupPreview,
  ProjectArchiveRestoreMode,
} from '../../services/JymService';
import { PanelChip } from '../ui/PanelChip';

interface LibraryBackupImportOptionsProps {
  locale: Locale;
  backup: JieyuLibraryBackupPreview;
  restoreMode: ProjectArchiveRestoreMode;
  selectedProjectIds: readonly string[];
  disabled: boolean;
  onRestoreModeChange: (mode: ProjectArchiveRestoreMode) => void;
  onSelectedProjectIdsChange: (ids: string[]) => void;
}

export function LibraryBackupImportOptions({
  locale,
  backup,
  restoreMode,
  selectedProjectIds,
  disabled,
  onRestoreModeChange,
  onSelectedProjectIdsChange,
}: LibraryBackupImportOptionsProps) {
  const disaster = backup.disasterRestore;
  const isDisaster = restoreMode === 'disaster-restore';
  return (
    <div className="left-rail-project-import-jyb" data-testid="jyb-import-options">
      <div className="panel-meta">
        <PanelChip data-testid="jyb-media-chip">
          {t(
            locale,
            backup.mediaIncluded
              ? 'transcription.projectHub.jybMediaIncluded'
              : 'transcription.projectHub.jybMediaExcluded',
          )}
        </PanelChip>
      </div>
      <fieldset className="left-rail-project-import-strategy">
        <label>
          <input
            type="radio"
            name="jyb-import-mode"
            data-testid="jyb-mode-projects"
            disabled={disabled}
            checked={!isDisaster}
            onChange={() => onRestoreModeChange('restore-as-new')}
          />
          <span>{t(locale, 'transcription.projectHub.jybModeProjects')}</span>
        </label>
        <label>
          <input
            type="radio"
            name="jyb-import-mode"
            data-testid="jyb-mode-disaster"
            disabled={disabled || !disaster.available}
            checked={isDisaster}
            onChange={() => onRestoreModeChange('disaster-restore')}
          />
          <span>
            {tf(locale, 'transcription.projectHub.jybModeDisaster', {
              count: disaster.localProjectCount,
            })}
          </span>
        </label>
      </fieldset>
      {!disaster.available ? (
        <p data-testid="jyb-disaster-blocked">
          {disaster.reason === 'collaborated'
            ? t(locale, 'transcription.projectHub.jybDisasterBlockedCollaborated')
            : tf(locale, 'transcription.projectHub.jybDisasterBlockedBytes', {
                count: disaster.bytesAtRiskCount,
              })}
        </p>
      ) : null}
      {isDisaster ? (
        <p role="alert" data-testid="jyb-disaster-warning">
          {t(locale, 'transcription.projectHub.jybDisasterWarning')}
        </p>
      ) : (
        <fieldset className="left-rail-project-import-jyb-projects">
          <legend>{t(locale, 'transcription.projectHub.jybProjectsTitle')}</legend>
          {backup.projects.map((project) => (
            <label key={project.id}>
              <input
                type="checkbox"
                data-testid={`jyb-project-${project.id}`}
                disabled={disabled}
                checked={selectedProjectIds.includes(project.id)}
                onChange={(event) =>
                  onSelectedProjectIdsChange(
                    event.target.checked
                      ? [...selectedProjectIds, project.id]
                      : selectedProjectIds.filter((id) => id !== project.id),
                  )
                }
              />
              <span>
                {tf(locale, 'transcription.projectHub.jybProjectRow', {
                  title: project.title,
                  incoming: project.incoming,
                })}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
