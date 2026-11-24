import { layerCreateParams, type LayerCreateKind } from './desktopTranscriptionLayerCommands';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useToast } from '../contexts/ToastContext';
import { t, useLocale } from '../i18n';
import { useDesktopTranscriptionLayerDragController } from './useDesktopTranscriptionLayerDragController';
import { readOrthographyRows, type LayerStyleChange } from './DesktopTranscriptionLayerStyleMenu';

interface StructureLayer {
  id: string;
  key?: string;
  name?: Record<string, string>;
  contentType?: string;
  tierType?: string;
  sortOrder?: number;
  languageId?: string | null;
  parentId?: string | null;
}

interface StructureLink {
  layerId: string;
  hostLayerId: string;
  isPreferred?: boolean;
  sortOrder?: number;
  linkType?: 'direct' | 'free' | 'literal' | 'pedagogical';
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
  onLayerMoved?: (layerId: string, hostIds: readonly string[]) => void;
}) {
  const locale = useLocale();
  const toast = useToast();
  const [error, setError] = useState('');
  const showFailure = useCallback(
    (text: string) => {
      setError(text);
      toast.showToast(text, 'error');
    },
    [toast],
  );
  const latest = useRef(input);
  latest.current = input;
  const dragLayers = useMemo(
    () =>
      (input.layers ?? []).flatMap((layer) =>
        layer.contentType === undefined || layer.tierType === undefined
          ? []
          : [
              {
                id: layer.id,
                contentType: layer.contentType,
                tierType: layer.tierType,
                ...(layer.sortOrder === undefined ? {} : { sortOrder: layer.sortOrder }),
                ...(layer.parentId === undefined ? {} : { parentId: layer.parentId }),
                ...(layer.name === undefined ? {} : { name: layer.name }),
              },
            ],
      ),
    [input.layers],
  );
  const dragLinks = useMemo(
    () =>
      (input.links ?? []).map((link) => ({
        layerId: link.layerId,
        hostLayerId: link.hostLayerId,
        isPreferred: link.isPreferred === true,
        ...(link.sortOrder === undefined ? {} : { sortOrder: link.sortOrder }),
        ...(link.linkType === undefined ? {} : { linkType: link.linkType }),
      })),
    [input.links],
  );
  const drag = useDesktopTranscriptionLayerDragController({
    sessionId: input.sessionId,
    desktopCall: input.desktopCall,
    layers: dragLayers,
    links: dragLinks,
    currentLayerId: input.currentLayerId,
    refresh: input.refresh,
    report: (message) => showFailure(layerErrorText(locale, message)),
    ...(input.onLayerMoved === undefined ? {} : { onLayerMoved: input.onLayerMoved }),
  });
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
        showFailure(layerErrorText(locale, message));
      }
    };
    const create = (kind: LayerCreateKind, label: string, sourceLayerId?: string) => {
      const current = latest.current;
      void (async () => {
        try {
          const taken = await deletedKeys(current);
          if (taken === null) throw new Error('layer is missing');
          await run(
            'layers.create',
            layerCreateParams({
              ...current,
              layers: current.layers ?? [],
              links: current.links ?? [],
              currentLayerId: sourceLayerId ?? current.currentLayerId,
              kind,
              label,
              deletedKeys: taken,
            }),
          );
        } catch (caught) {
          showFailure(layerErrorText(locale, caught instanceof Error ? caught.message : ''));
        }
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
        showFailure(t(locale, 'app.desktopTranscription.layerActionFailed'));
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
      setStyle: (id: string, input: LayerStyleChange) => {
        void run('layers.setStyle', { id, ...input });
      },
      orthographies: async (languageId: string) => {
        const current = latest.current;
        if (current.sessionId === null || current.desktopCall === undefined) return [];
        return readOrthographyRows(
          await current.desktopCall(current.sessionId, 'orthographies.list', { languageId }),
        );
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
      drag,
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
  }, [drag, error, locale, showFailure]);
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
  if (message.includes('recording pair already exists'))
    return t(locale, 'app.desktopTranscription.recordingPairExists');
  if (message.includes('layer has orthography dependents'))
    return t(locale, 'app.desktopTranscription.orthographyDeleteBlocked');
  if (message.includes('orthography layer requires one host'))
    return t(locale, 'app.desktopTranscription.layerHostsRefused');
  if (message.includes('layer text conflicts')) {
    return t(locale, 'app.desktopTranscription.layerTextConflict');
  }
  if (message.includes('layer units conflict')) {
    return t(locale, 'app.desktopTranscription.layerUnitsConflict');
  }
  if (message.includes('layer host still has texts')) {
    return t(locale, 'app.desktopTranscription.layerHostsBlocked');
  }
  if (message.includes('unit text stays on its layer')) {
    return t(locale, 'app.desktopTranscription.layerTextStays');
  }
  if (message.includes('layer is already first'))
    return t(locale, 'app.desktopTranscription.layerMoveFirst');
  if (message.includes('layer is already last'))
    return t(locale, 'app.desktopTranscription.layerMoveLast');
  if (message.includes('layer cannot leave its host')) {
    return t(locale, 'app.desktopTranscription.layerHostsRefused');
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
