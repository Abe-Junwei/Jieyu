import { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, type DictKey } from '../i18n';
import { fieldLabel, useProjectCustomFieldController } from './useProjectCustomFieldController';
import '../styles/pages/project-custom-fields.css';

const TARGET_LABEL: Record<(typeof CUSTOM_FIELD_TARGETS)[number], DictKey> = {
  project: 'app.projectFields.target.project',
  manuscript: 'app.projectFields.target.manuscript',
  layer: 'app.projectFields.target.layer',
  unit: 'app.projectFields.target.unit',
  media: 'app.projectFields.target.media',
  source: 'app.projectFields.target.source',
  speaker: 'app.projectFields.target.speaker',
  note: 'app.projectFields.target.note',
  conversation: 'app.projectFields.target.conversation',
  message: 'app.projectFields.target.message',
  language: 'app.projectFields.target.language',
  orthography: 'app.projectFields.target.orthography',
  'orthography-bridge': 'app.projectFields.target.orthographyBridge',
  lexeme: 'app.projectFields.target.lexeme',
  'lexeme-sense': 'app.projectFields.target.lexemeSense',
  'analysis-node': 'app.projectFields.target.analysisNode',
  'analysis-relation': 'app.projectFields.target.analysisRelation',
};

const TYPE_LABEL: Record<(typeof CUSTOM_FIELD_TYPES)[number], DictKey> = {
  text: 'app.projectFields.type.text',
  number: 'app.projectFields.type.number',
  boolean: 'app.projectFields.type.boolean',
  select: 'app.projectFields.type.select',
  multiselect: 'app.projectFields.type.multiselect',
  url: 'app.projectFields.type.url',
  ref: 'app.projectFields.type.ref',
};

export function ProjectCustomFieldManager(props: {
  desktopCall: DesktopReadHost['desktopCall'];
  sessionId: string;
}) {
  const fields = useProjectCustomFieldController(props.desktopCall, props.sessionId);
  return (
    <section className="project-custom-fields">
      <h2>{t(fields.locale, 'app.projectFields.title')}</h2>
      <label>
        {t(fields.locale, 'app.projectFields.target')}
        <select
          value={fields.targetType}
          onChange={(event) => fields.chooseTarget(event.target.value)}
        >
          {CUSTOM_FIELD_TARGETS.map((target) => (
            <option key={target} value={target}>
              {t(fields.locale, TARGET_LABEL[target])}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t(fields.locale, 'app.projectFields.name')}
        <input value={fields.name} onChange={(event) => fields.setName(event.target.value)} />
      </label>
      <label>
        {t(fields.locale, 'app.projectFields.type')}
        <select
          value={fields.fieldType}
          onChange={(event) => fields.setFieldType(event.target.value)}
        >
          {CUSTOM_FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(fields.locale, TYPE_LABEL[type])}
            </option>
          ))}
        </select>
      </label>
      <div className="project-custom-fields-actions">
        <button type="button" className="btn btn-primary" onClick={fields.createDefinition}>
          {t(fields.locale, 'app.projectFields.create')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={fields.selectedId === null}
          onClick={fields.renameDefinition}
        >
          {t(fields.locale, 'app.projectFields.rename')}
        </button>
        <button type="button" className="btn" onClick={() => fields.importDefinition('reuse')}>
          {t(fields.locale, 'app.projectFields.importReuse')}
        </button>
        <button type="button" className="btn" onClick={() => fields.importDefinition('create')}>
          {t(fields.locale, 'app.projectFields.importCreate')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={fields.selectedId === null}
          onClick={fields.previewMigration}
        >
          {t(fields.locale, 'app.projectFields.preview')}
        </button>
      </div>
      {fields.error.length > 0 ? <p role="alert">{fields.error}</p> : null}
      {fields.preview === null ? null : (
        <p>
          {tf(fields.locale, 'app.projectFields.previewResult', {
            revision: fields.preview.revision,
            current: fields.preview.current,
            history: fields.preview.history,
          })}
        </p>
      )}
      {fields.visible.length === 0 ? <p>{t(fields.locale, 'app.projectFields.empty')}</p> : null}
      <ul className="project-custom-fields-list">
        {fields.visible.map((definition) => (
          <li key={definition.id}>
            <button
              type="button"
              aria-pressed={definition.id === fields.selectedId}
              onClick={() => fields.chooseDefinition(definition)}
            >
              {fieldLabel(definition.name, fields.locale)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
