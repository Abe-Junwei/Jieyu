import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import type { TranscriptionModel, ProjectTranscriptionResult } from '../desktop/transcriptionTypes';

export function useDesktopModelCandidatesController(props: {
  host: DesktopReadHost;
  sessionId: string;
  manuscriptId: string;
  layerId: string;
  onAccepted: () => void;
}) {
  const { host, sessionId, manuscriptId, layerId, onAccepted } = props;
  const [model, setModel] = useState<TranscriptionModel | null>(null);
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [phase, setPhase] = useState<
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'ready'
    | 'empty'
    | 'error'
    | 'cancelled'
    | 'interrupted'
    | 'saved'
    | 'abandoned'
  >('idle');
  const [result, setResult] = useState<ProjectTranscriptionResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState(false);
  const live = useRef(true);
  const busy = useRef(false);
  const request = useRef<string | null>(null);
  const pendingRun = useRef<string | null>(null);
  const operations = useRef(new Map<string, string>());
  const client = createDesktopClient({ desktopCall: host.desktopCall });

  useEffect(() => {
    live.current = true;
    const api = createDesktopClient({ desktopCall: host.desktopCall });
    void Promise.all([api.listManuscripts(sessionId), api.listMedia(sessionId)])
      .then(([manuscripts, media]) => {
        const target = manuscripts.find((item) => item.id === manuscriptId);
        if (live.current)
          setEnd(String(media.find((item) => item.id === target?.mediaId)?.duration ?? ''));
      })
      .catch(() => {
        if (live.current) setPhase('error');
      });
    return () => {
      live.current = false;
      if (request.current !== null)
        void host.cancelProjectTranscription?.(sessionId, request.current).catch(() => {});
      if (pendingRun.current !== null)
        void api.abandonModelRun(sessionId, pendingRun.current).catch(() => {});
    };
  }, [host, sessionId, manuscriptId]);

  const chooseModel = async (local = false) => {
    const choose = local ? host.chooseLocalWhisper : host.chooseTranscriptionModel;
    if (busy.current || pendingRun.current !== null || !choose) return;
    busy.current = true;
    setSaving(true);
    try {
      const chosen = await choose(sessionId);
      if (live.current && !('cancelled' in chosen)) {
        setModel(chosen);
        setPhase('idle');
      }
    } catch {
      if (live.current) setPhase('error');
    } finally {
      busy.current = false;
      if (live.current) setSaving(false);
    }
  };
  const run = async () => {
    if (busy.current || pendingRun.current !== null || !model || !host.transcribeProject) return;
    const first = Number(start),
      last = Number(end);
    if (
      start.trim() === '' ||
      end.trim() === '' ||
      !Number.isFinite(first) ||
      !Number.isFinite(last) ||
      first < 0 ||
      last <= first
    ) {
      setPhase('error');
      return;
    }
    operations.current.clear();
    busy.current = true;
    request.current = crypto.randomUUID();
    setPhase('running');
    setWarning(false);
    setResult(null);
    try {
      const returned = await host.transcribeProject(sessionId, {
        modelId: model.id,
        manuscriptId,
        layerId,
        start: first,
        end: last,
        requestId: request.current,
      });
      if (!live.current) {
        if (returned.status === 'ok')
          void client.abandonModelRun(sessionId, returned.runId).catch(() => {});
        return;
      }
      request.current = null;
      setResult(returned);
      setWarning(returned.warnings.length > 0);
      if (returned.status === 'ok') {
        pendingRun.current = returned.candidates.length > 0 ? returned.runId : null;
        setPhase(returned.candidates.length > 0 ? 'ready' : 'empty');
      } else setPhase(returned.status);
    } catch {
      if (live.current) setPhase('error');
    } finally {
      busy.current = false;
      request.current = null;
    }
  };
  const cancel = async () => {
    if (request.current === null) return;
    setPhase('cancelling');
    try {
      await host.cancelProjectTranscription?.(sessionId, request.current);
    } catch {
      if (live.current) setPhase('error');
    }
  };
  const edit = (id: string, text: string) =>
    setResult((current) =>
      current === null
        ? null
        : {
            ...current,
            candidates: current.candidates.map((row) =>
              row.candidateId === id ? { ...row, text } : row,
            ),
          },
    );
  const accept = async (id: string) => {
    if (busy.current || !result) return;
    const candidate = result.candidates.find((row) => row.candidateId === id);
    if (!candidate || candidate.occupied || candidate.text.trim() === '') return;
    busy.current = true;
    setSaving(true);
    let operationId = operations.current.get(id);
    if (!operationId) {
      operationId = crypto.randomUUID();
      operations.current.set(id, operationId);
    }
    try {
      const receipt = await client.readModelRunAcceptance(sessionId, operationId);
      if (receipt !== null && (receipt.runId !== result.runId || receipt.candidateId !== id))
        throw new Error('transcription receipt mismatch');
      if (receipt === null)
        await client.acceptModelRun(sessionId, {
          operationId,
          runId: result.runId,
          chunkIndex: candidate.chunkIndex,
          segmentIndex: candidate.segmentIndex,
          mediaStart: candidate.mediaStart,
          mediaEnd: candidate.mediaEnd,
          timeMappingRevision: result.timeMappingRevision,
          targetFingerprint: candidate.targetFingerprint,
          text: candidate.text,
        });
      if (!live.current) return;
      const candidates = result.candidates.filter((row) => row.candidateId !== id);
      setResult({ ...result, candidates });
      if (candidates.length === 0) {
        pendingRun.current = null;
        setPhase('saved');
      }
      await onAccepted();
    } catch {
      if (live.current) setPhase('error');
    } finally {
      busy.current = false;
      if (live.current) setSaving(false);
    }
  };
  const abandon = async () => {
    if (busy.current || pendingRun.current === null) return;
    busy.current = true;
    setSaving(true);
    try {
      await client.abandonModelRun(sessionId, pendingRun.current);
      if (live.current) {
        pendingRun.current = null;
        setResult(null);
        setPhase('abandoned');
      }
    } catch {
      if (live.current) setPhase('error');
    } finally {
      busy.current = false;
      if (live.current) setSaving(false);
    }
  };
  return {
    model,
    start,
    end,
    setStart,
    setEnd,
    phase,
    result,
    saving,
    warning,
    chooseModel,
    run,
    cancel,
    edit,
    accept,
    abandon,
  };
}
