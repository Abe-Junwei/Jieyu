import { useMemo, useRef, useState } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

interface StructureLayer {
  id: string;
  key?: string;
  contentType?: string;
  tierType?: string;
  sortOrder?: number;
}

interface StructureLink {
  layerId: string;
  hostLayerId: string;
  isPreferred?: boolean;
}

/** Layer create, rename, order, height, and delete. The page only passes these through. */
export function useDesktopTranscriptionLayerController(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  manuscriptId: string | null;
  layers: readonly StructureLayer[] | undefined;
  links: readonly StructureLink[] | undefined;
  currentLayerId: string | null;
  refresh: () => Promise<unknown>;
}) {
  const locale = useLocale();
  const [error, setError] = useState('');
  const latest = useRef(input);
  latest.current = input;
  return useMemo(() => {
    const run = async (method: string, args: unknown) => {
      const current = latest.current;
      if (
        current.sessionId === null ||
        current.desktopCall === undefined ||
        current.manuscriptId === null
      ) {
        return;
      }
      setError('');
      try {
        await current.desktopCall(current.sessionId, method, args);
        await current.refresh();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : '';
        setError(layerErrorText(locale, message));
      }
    };
    const create = (kind: 'transcription' | 'translation', label: string) => {
      const current = latest.current;
      const layers = current.layers ?? [];
      const host = transcriptionHost(layers, current.links ?? [], current.currentLayerId);
      if (kind === 'translation' && host === undefined) {
        setError(t(locale, 'app.desktopTranscription.layerActionFailed'));
        return;
      }
      void (async () => {
        const taken = await deletedKeys(latest.current);
        if (taken === null) {
          setError(t(locale, 'app.desktopTranscription.layerActionFailed'));
          return;
        }
        const prefix = kind === 'transcription' ? 'tx' : 'tl';
        const keys = new Set([
          ...layers.map((item) => item.key).filter((key) => key !== undefined),
          ...taken,
        ]);
        let count = layers.length + 1;
        let key = `${prefix}-${count}`;
        while (keys.has(key)) {
          count += 1;
          key = `${prefix}-${count}`;
        }
        void run('layers.create', {
          manuscriptId: current.manuscriptId,
          key,
          name: { zh: label },
          tierType: kind === 'transcription' ? 'time-aligned' : 'symbolic-association',
          contentType: kind,
          sortOrder: Math.max(-1, ...layers.map((item) => item.sortOrder ?? 0)) + 1,
          ...(kind === 'translation' && host !== undefined
            ? { hosts: [{ hostLayerId: host.id, preferred: true }] }
            : {}),
        });
      })();
    };
    const createPair = (kind: 'voice' | 'oral', audioName: string, textName: string) => {
      const current = latest.current;
      const host = transcriptionHost(
        current.layers ?? [],
        current.links ?? [],
        current.currentLayerId,
      );
      if (host === undefined) {
        setError(t(locale, 'app.desktopTranscription.layerActionFailed'));
        return;
      }
      void run('recordings.createPair', {
        hostLayerId: host.id,
        kind,
        audioName: { zh: audioName },
        textName: { zh: textName },
      });
    };
    return {
      error,
      create,
      createPair,
      rename: (id: string, name: Record<string, string>) => {
        void run('layers.rename', { id, name });
      },
      move: (id: string, direction: 'up' | 'down') => {
        void run('layers.move', { id, direction });
      },
      setHeight: (id: string, laneHeight: number) => {
        void run('layers.setHeight', { id, laneHeight });
      },
      remove: (id: string, mode: 'soft' | 'migrate' | 'purge', targetLayerId?: string) => {
        void run('layers.delete', {
          id,
          mode,
          ...(targetLayerId === undefined ? {} : { targetLayerId }),
        });
      },
      setHosts: (input: HostsInput) => {
        void run('layers.setHosts', input);
      },
      clearError: () => setError(''),
      previewHosts: async (input: HostsInput): Promise<HostsPreview | null> => {
        const current = latest.current;
        if (current.sessionId === null || current.desktopCall === undefined) return null;
        setError('');
        try {
          const result = await current.desktopCall(current.sessionId, 'layers.previewHosts', input);
          if (typeof result !== 'object' || result === null) return null;
          return result as HostsPreview;
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : '';
          throw new Error(layerErrorText(locale, message));
        }
      },
    };
  }, [error, locale]);
}

interface HostsInput {
  layerId: string;
  hostLayerIds: string[];
  preferredHostLayerId: string;
  linkType: 'direct' | 'free' | 'literal' | 'pedagogical';
}

interface HostsPreview {
  layerId: string;
  removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
  blocked: boolean;
}

function layerErrorText(locale: Parameters<typeof t>[0], message: string): string {
  if (message.includes('layer text conflicts')) {
    return t(locale, 'app.desktopTranscription.layerTextConflict');
  }
  if (message.includes('layer units conflict')) {
    return t(locale, 'app.desktopTranscription.layerUnitsConflict');
  }
  if (message.includes('layer host still has texts')) {
    return t(locale, 'app.desktopTranscription.layerHostsBlocked');
  }
  if (message.includes('layer host would form a cycle')) {
    return t(locale, 'app.desktopTranscription.layerHostsCycle');
  }
  if (
    message.includes('layer cannot change hosts') ||
    message.includes('layer host is not a transcription layer')
  ) {
    return t(locale, 'app.desktopTranscription.layerHostsRefused');
  }
  return t(locale, 'app.desktopTranscription.layerActionFailed');
}

function transcriptionHost(
  layers: readonly StructureLayer[],
  links: readonly StructureLink[],
  currentLayerId: string | null,
): StructureLayer | undefined {
  const timeAligned = (item: StructureLayer | undefined) =>
    item !== undefined && item.contentType === 'transcription' && item.tierType === 'time-aligned';
  const byId = (id: string | undefined) => layers.find((item) => item.id === id);
  const current = byId(currentLayerId ?? undefined);
  if (timeAligned(current)) return current;
  const hostLink =
    links.find((link) => link.layerId === current?.id && link.isPreferred === true) ??
    links.find((link) => link.layerId === current?.id);
  const hosted = byId(hostLink?.hostLayerId);
  if (timeAligned(hosted)) return hosted;
  return layers.find((item) => timeAligned(item));
}

async function deletedKeys(input: {
  sessionId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  manuscriptId: string | null;
}): Promise<string[] | null> {
  if (input.sessionId === null || input.desktopCall === undefined || input.manuscriptId === null) {
    return null;
  }
  try {
    const deleted = await input.desktopCall(input.sessionId, 'layers.listDeleted', {});
    if (!Array.isArray(deleted)) return [];
    return deleted.flatMap((row) => {
      if (typeof row !== 'object' || row === null) return [];
      const item = row as { manuscriptId?: unknown; key?: unknown };
      return item.manuscriptId === input.manuscriptId && typeof item.key === 'string'
        ? [item.key]
        : [];
    });
  } catch {
    return null;
  }
}
