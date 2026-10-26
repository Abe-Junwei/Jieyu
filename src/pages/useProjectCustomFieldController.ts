import { useEffect, useMemo, useRef, useState } from 'react';
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

export interface ProjectFieldPurge {
  sessionId: string;
  definitionId: string;
  label: string;
  revision: number;
  previewFingerprint: string;
  current: { targetType: string; targetId: string; lexemeId?: string; unitId?: string }[];
  historyIds: string[];
}

export interface ProjectFieldDangling {
  lexemeId: string;
  senseId: string | null;
  gap?: string;
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
  const [required, setRequired] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectFieldPreview | null>(null);
  const [purge, setPurge] = useState<ProjectFieldPurge | null>(null);
  const [missingNames, setMissingNames] = useState<string[] | null>(null);
  const [dangling, setDangling] = useState<ProjectFieldDangling[] | null>(null);
  const [error, setError] = useState('');
  const purgeTicket = useRef(0);
  const dropPurge = () => {
    purgeTicket.current += 1;
    setPurge(null);
  };

  useEffect(() => {
    dropPurge();
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
      .createCustomFieldDefinition(sessionId, {
        targetType,
        name: label,
        fieldType,
        ...(required ? { required: true } : {}),
      })
      .then(async (created) => {
        await reload();
        setSelectedId(created.id);
        setPreview(null);
        dropPurge();
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
        dropPurge();
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

  const previewPurge = () => {
    if (selected === null) return;
    setError('');
    const ticket = ++purgeTicket.current;
    const definitionId = selected.id;
    const label = fieldLabel(selected.name, locale);
    const boundSession = sessionId;
    void client
      .previewCustomFieldPurge(boundSession, definitionId)
      .then((result) => {
        if (ticket !== purgeTicket.current || result.definitionId !== definitionId) return;
        setPurge({
          sessionId: boundSession,
          definitionId,
          label,
          revision: result.revision,
          previewFingerprint: result.previewFingerprint,
          current: result.current,
          historyIds: result.history.map((item) => item.id),
        });
      })
      .catch(fail);
  };

  const confirmPurge = () => {
    if (purge === null || purge.sessionId !== sessionId) return;
    setError('');
    void client
      .purgeCustomFieldDefinition(sessionId, {
        definitionId: purge.definitionId,
        expectedRevision: purge.revision,
        previewFingerprint: purge.previewFingerprint,
      })
      .then(async () => {
        setSelectedId(null);
        dropPurge();
        setPreview(null);
        await reload();
      })
      .catch(fail);
  };

  const checkMissing = () => {
    if (targetId.trim().length === 0) return;
    setError('');
    void client
      .missingFields(sessionId, targetType, targetId.trim())
      .then((ids) => {
        setMissingNames(
          ids.map((id) => {
            const found = definitions.find((definition) => definition.id === id);
            return found === undefined ? id : fieldLabel(found.name, locale);
          }),
        );
      })
      .catch(fail);
  };

  const showDangling = () => {
    setError('');
    void client
      .listLexemeLinks(sessionId)
      .then((links) => {
        setDangling(
          links
            .filter((link) => link.linkState === 'target-missing')
            .map((link) => ({
              lexemeId: link.lexemeId,
              senseId: link.senseId,
              ...(link.gap === undefined ? {} : { gap: link.gap }),
            })),
        );
      })
      .catch(fail);
  };

  const chooseTarget = (next: string) => {
    dropPurge();
    setTargetType(next);
    setSelectedId(null);
    setPreview(null);
    setMissingNames(null);
  };

  const chooseDefinition = (definition: ProjectFieldDefinition) => {
    dropPurge();
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
    required,
    targetId,
    preview,
    purge,
    missingNames,
    dangling,
    error,
    setName,
    setRequired,
    setTargetId,
    setFieldType,
    chooseTarget,
    chooseDefinition,
    createDefinition,
    renameDefinition,
    importDefinition,
    previewMigration,
    previewPurge,
    confirmPurge,
    checkMissing,
    showDangling,
  };
}
