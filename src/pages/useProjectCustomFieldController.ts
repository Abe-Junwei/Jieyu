import { useEffect, useMemo, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export interface ProjectFieldDefinition {
  id: string;
  targetType: string;
  name: Record<string, string>;
  fieldType: string;
  revision: number;
}

export interface ProjectFieldPreview {
  revision: number;
  current: number;
  history: number;
}

export function fieldName(text: string, locale: string): Record<string, string> {
  return { [locale.startsWith('zh') ? 'zh' : 'en']: text.trim() };
}

export function fieldLabel(name: Record<string, string>, locale: string): string {
  const preferred = locale.startsWith('zh') ? name.zh : name.en;
  return preferred ?? name.zh ?? name.en ?? Object.values(name)[0] ?? '';
}

export function useProjectCustomFieldController(
  desktopCall: DesktopReadHost['desktopCall'],
  sessionId: string,
) {
  const locale = useLocale();
  const client = useMemo(() => createDesktopClient({ desktopCall }), [desktopCall]);
  const [definitions, setDefinitions] = useState<ProjectFieldDefinition[]>([]);
  const [targetType, setTargetType] = useState('unit');
  const [fieldType, setFieldType] = useState('text');
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectFieldPreview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void client
      .listCustomFieldDefinitions(sessionId)
      .then((rows) => {
        if (!cancelled) setDefinitions(rows);
      })
      .catch(() => {
        if (!cancelled) setError(t(locale, 'app.projectFields.failed'));
      });
    return () => {
      cancelled = true;
    };
  }, [client, locale, sessionId]);

  const visible = definitions.filter((definition) => definition.targetType === targetType);
  const selected = visible.find((definition) => definition.id === selectedId) ?? null;

  const reload = async () => {
    setDefinitions(await client.listCustomFieldDefinitions(sessionId));
  };

  const fail = () => {
    setError(t(locale, 'app.projectFields.failed'));
  };

  const createDefinition = () => {
    const label = fieldName(name, locale);
    if (Object.values(label)[0]?.length === 0) return;
    setError('');
    void client
      .createCustomFieldDefinition(sessionId, { targetType, name: label, fieldType })
      .then(async (created) => {
        await reload();
        setSelectedId(created.id);
        setPreview(null);
      })
      .catch(fail);
  };

  const renameDefinition = () => {
    if (selected === null) return;
    const label = fieldName(name, locale);
    if (Object.values(label)[0]?.length === 0) return;
    setError('');
    void client
      .updateCustomFieldDefinition(sessionId, {
        id: selected.id,
        expectedRevision: selected.revision,
        name: label,
      })
      .then(async () => {
        await reload();
        setPreview(null);
      })
      .catch(fail);
  };

  const importDefinition = (mode: 'reuse' | 'create') => {
    const label = fieldName(name, locale);
    if (Object.values(label)[0]?.length === 0) return;
    setError('');
    void client
      .importCustomFieldDefinition(sessionId, {
        mode,
        definition: { targetType, name: label, fieldType },
      })
      .then(async (imported) => {
        await reload();
        setSelectedId(imported.id);
        setPreview(null);
      })
      .catch(fail);
  };

  const previewMigration = () => {
    if (selected === null) return;
    setError('');
    void client
      .previewCustomFieldMigration(sessionId, selected.id)
      .then((result) => {
        setPreview({
          revision: result.revision,
          current: result.current.length,
          history: result.history.length,
        });
      })
      .catch(fail);
  };

  const chooseTarget = (next: string) => {
    setTargetType(next);
    setSelectedId(null);
    setPreview(null);
  };

  const chooseDefinition = (definition: ProjectFieldDefinition) => {
    setSelectedId(definition.id);
    setName(fieldLabel(definition.name, locale));
    setFieldType(definition.fieldType);
    setPreview(null);
  };

  return {
    locale,
    visible,
    selectedId,
    targetType,
    fieldType,
    name,
    preview,
    error,
    setName,
    setFieldType,
    chooseTarget,
    chooseDefinition,
    createDefinition,
    renameDefinition,
    importDefinition,
    previewMigration,
  };
}
