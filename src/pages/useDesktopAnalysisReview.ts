import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export interface DesktopAnalysisCandidate {
  id: string;
  action: 'accept' | 'restore';
  label: string;
}

interface AnalysisView {
  labels: string[];
}

export function useDesktopAnalysisReview(
  host: DesktopReadHost | null,
  sessionId: string | null,
  unitId: string | null,
) {
  const locale = useLocale();
  const [view, setView] = useState<AnalysisView | null>(null);
  const [candidates, setCandidates] = useState<DesktopAnalysisCandidate[]>([]);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    if (host === null || sessionId === null || unitId === null) {
      setView(null);
      setCandidates([]);
      return;
    }
    const id = ++request.current;
    let cancelled = false;
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    void Promise.all([
      client.readAnalysisState(sessionId, unitId),
      client.listCandidates(sessionId, unitId),
    ])
      .then(([state, listed]) => {
        if (cancelled || id !== request.current) return;
        setView({
          labels: state.graph === null ? [] : state.graph.nodes.map((node) => node.label),
        });
        setCandidates(
          listed.flatMap((item) => {
            const action = candidateAction(item.kind, item.status);
            if (action === null) return [];
            return [
              {
                id: item.id,
                action,
                label: item.graph.nodes.map((node) => node.label).join(' '),
              },
            ];
          }),
        );
      })
      .catch(() => {
        if (!cancelled && id === request.current) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, revision, sessionId, unitId]);

  const commit = (action: 'accept' | 'restore', candidateId: string) => {
    if (host === null || sessionId === null || unitId === null) return;
    setError('');
    const id = ++request.current;
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    void (async () => {
      try {
        const current = await client.readAnalysisState(sessionId, unitId);
        const expected = {
          manuscriptGeneration: current.manuscriptGeneration,
          analysisGeneration: current.analysisGeneration,
          graphFingerprint: current.graphFingerprint,
        };
        if (action === 'accept') await client.acceptAnalysis(sessionId, { candidateId, expected });
        else await client.restoreAnalysis(sessionId, { candidateId, expected });
        if (id === request.current) setRevision((value) => value + 1);
      } catch {
        if (id !== request.current) return;
        setError(t(locale, 'workspace.analysis.writeFailed'));
        setRevision((value) => value + 1);
      }
    })();
  };

  return {
    view,
    candidates,
    error,
    accept: (candidateId: string) => {
      commit('accept', candidateId);
    },
    restore: (candidateId: string) => {
      commit('restore', candidateId);
    },
  };
}

function candidateAction(kind: string, status: string): 'accept' | 'restore' | null {
  if (kind === 'suggestion' && status === 'pending') return 'accept';
  if (kind === 'review-snapshot' && status === 'stored') return 'restore';
  return null;
}
