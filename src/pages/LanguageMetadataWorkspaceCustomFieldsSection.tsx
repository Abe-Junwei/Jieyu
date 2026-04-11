import { t } from '../i18n';
import type { CustomFieldControllerState } from './languageMetadataWorkspace.customFieldController';
import type { LanguageMetadataDraft, WorkspaceLocale } from './languageMetadataWorkspace.shared';
import { LanguageMetadataWorkspaceCustomFieldDefinitionCard } from './LanguageMetadataWorkspaceCustomFieldDefinitionCard';
import { LanguageMetadataWorkspaceCustomFieldValueField } from './LanguageMetadataWorkspaceCustomFieldValueField';

type LanguageMetadataWorkspaceCustomFieldsSectionProps = {
  locale: WorkspaceLocale;
  draft: LanguageMetadataDraft;
  cf: CustomFieldControllerState;
};

export function LanguageMetadataWorkspaceCustomFieldsSection({ locale, draft, cf }: LanguageMetadataWorkspaceCustomFieldsSectionProps) {
  return (
    <details className="ws-subsection lm-subsection">
      <summary className="lm-subsection-header">
        <h3 className="panel-title-primary">{t(locale, 'workspace.languageMetadata.sectionCustomFields')}</h3>
        <p className="lm-subsection-description">{t(locale, 'workspace.languageMetadata.sectionCustomFieldsDescription')}</p>
      </summary>
      <div className="lm-inline-actions">
        <button type="button" className="btn btn-ghost" onClick={() => cf.handleAddFieldDef()}>{t(locale, 'workspace.languageMetadata.customFieldAdd')}</button>
        {cf.fieldDefs.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => cf.setShowFieldManage((prev) => !prev)}>
            {t(locale, 'workspace.languageMetadata.customFieldManage')}
          </button>
        )}
      </div>

      {cf.fieldDefs.length === 0 ? (
        <p className="lm-state">{t(locale, 'workspace.languageMetadata.customFieldEmpty')}</p>
      ) : (
        <div className="lm-grid">
          {cf.fieldDefs.map((def, index) => (
            <div key={def.id} className="lm-field lm-field-block">
              {cf.showFieldManage ? (
                <LanguageMetadataWorkspaceCustomFieldDefinitionCard
                  locale={locale}
                  definition={def}
                  index={index}
                  total={cf.fieldDefs.length}
                  onLocalChange={cf.handleFieldDefLocalChange}
                  onPersist={cf.handleFieldDefBlur}
                  onTypeChange={cf.handleFieldTypeChange}
                  onMove={cf.handleMoveFieldDef}
                  onDelete={cf.handleDeleteFieldDef}
                />
              ) : (
                <LanguageMetadataWorkspaceCustomFieldValueField
                  locale={locale}
                  definition={def}
                  draftValue={draft.customFieldValues[def.id] ?? ''}
                  onValueChange={(value) => cf.handleCustomFieldValueChange(def.id, value)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
