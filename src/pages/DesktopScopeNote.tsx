import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';

type Scope =
  | { kind: 'project' }
  | { kind: 'manuscript'; manuscriptId: string }
  | { kind: 'layer'; layerId: string }
  | { kind: 'unit_text'; unitId: string; unitTextId: string }
  | { kind: 'analysis_node'; unitId: string; nodeId: string };

export function DesktopScopeNote(props: {
  sessionId: string;
  desktopCall: DesktopReadHost['desktopCall'];
  scope: Scope;
  label: string;
  saveLabel: string;
}) {
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const { sessionId, desktopCall, scope, label, saveLabel } = props;

  useEffect(() => {
    let cancelled = false;
    void createDesktopClient({ desktopCall })
      .listNotes(sessionId, listQuery(scope))
      .then((notes) => {
        if (cancelled) return;
        setSaved(
          notes
            .filter((note) => scope.kind !== 'unit_text' || note.unitTextId === scope.unitTextId)
            .map((note) => note.content.default ?? '')
            .filter((text) => text.length > 0),
        );
      })
      .catch(() => {
        if (!cancelled) setSaved([]);
      });
    return () => {
      cancelled = true;
    };
  }, [desktopCall, scope, sessionId]);

  const save = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    void createDesktopClient({ desktopCall })
      .createNote(sessionId, { anchor: anchorOf(scope), content: { default: body } })
      .then(() => {
        setSaved((current) => [...current, body]);
        setDraft('');
      })
      .catch(() => undefined);
  };

  return (
    <span>
      {saved.map((text) => (
        <span key={text}>{text}</span>
      ))}
      <input
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
      />
      <button type="button" onClick={save}>
        {saveLabel}
      </button>
    </span>
  );
}

function listQuery(scope: Scope) {
  const attachment = 'active' as const;
  switch (scope.kind) {
    case 'project':
      return { anchorKind: scope.kind, attachment };
    case 'manuscript':
      return { anchorKind: scope.kind, manuscriptId: scope.manuscriptId, attachment };
    case 'layer':
      return { anchorKind: scope.kind, layerId: scope.layerId, attachment };
    case 'unit_text':
      return { anchorKind: scope.kind, unitId: scope.unitId, attachment };
    case 'analysis_node':
      return { anchorKind: scope.kind, unitId: scope.unitId, nodeId: scope.nodeId, attachment };
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

function anchorOf(scope: Scope) {
  switch (scope.kind) {
    case 'project':
      return { kind: scope.kind };
    case 'manuscript':
      return { kind: scope.kind, manuscriptId: scope.manuscriptId };
    case 'layer':
      return { kind: scope.kind, layerId: scope.layerId };
    case 'unit_text':
      return { kind: scope.kind, unitTextId: scope.unitTextId };
    case 'analysis_node':
      return { kind: scope.kind, unitId: scope.unitId, nodeId: scope.nodeId };
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}
