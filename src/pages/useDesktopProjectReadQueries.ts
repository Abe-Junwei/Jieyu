import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDesktopClient,
  loadDesktopProjectRead,
  type ContentNoteCategory,
  type DesktopProjectReadApi,
} from '../app/desktopProjectReadPageAccess';
import { desktopQueryKeys } from '../desktop/desktopQueryKeys';
import type { DesktopReadHost } from '../desktop/projectReadHost';

/** Local single-library reads: no retry, no focus refetch; writes refresh through the invalidation table or `refetch`. */
const DESKTOP_READ_QUERY = { staleTime: 0, retry: false, refetchOnWindowFocus: false } as const;

interface Picked {
  sessionId: string;
  locateKey: string;
  manuscriptId: string | undefined;
  layerId: string | undefined;
  /** A manuscript picked in the page falls back to the first one when it is gone (e.g. just deleted). */
  fallback: boolean;
}

/** Project read model, shown notes, and title, each keyed by session so a slow old-session answer cannot land. */
export function useDesktopProjectReadQueries(
  host: DesktopReadHost | null,
  sessionId: string | null,
  includeMedia: boolean,
  locate: { manuscriptId: string | undefined; layerId: string | undefined },
) {
  const queryClient = useQueryClient();
  const locateKey = `${locate.manuscriptId ?? ''}\n${locate.layerId ?? ''}`;
  const [picked, setPicked] = useState<Picked | null>(null);
  const selection =
    picked !== null && picked.sessionId === sessionId && picked.locateKey === locateKey
      ? picked
      : { manuscriptId: locate.manuscriptId, layerId: locate.layerId, fallback: false };
  const readKey = desktopQueryKeys.projectRead(
    sessionId ?? '',
    selection.manuscriptId ?? null,
    selection.layerId ?? null,
    includeMedia,
  );

  const read = useQuery({
    ...DESKTOP_READ_QUERY,
    queryKey: readKey,
    enabled: host !== null && sessionId !== null,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === sessionId ? previous : undefined,
    queryFn: async () => {
      const api = readApi(requireHost(host));
      const id = sessionId ?? '';
      try {
        return await loadDesktopProjectRead(
          api,
          id,
          selection.manuscriptId,
          includeMedia,
          selection.layerId,
        );
      } catch (error) {
        if (!selection.fallback || !(error instanceof Error)) throw error;
        if (error.message !== 'manuscript is missing') throw error;
        return loadDesktopProjectRead(api, id, undefined, includeMedia);
      }
    },
  });
  const manuscriptId = read.data?.manuscriptId ?? null;
  const notes = useQuery({
    ...DESKTOP_READ_QUERY,
    queryKey: desktopQueryKeys.unitNotes(sessionId ?? '', manuscriptId),
    enabled: host !== null && sessionId !== null && read.data !== undefined,
    queryFn: () => loadShownNotes(requireHost(host), sessionId ?? '', manuscriptId),
  });
  const project = useQuery({
    ...DESKTOP_READ_QUERY,
    queryKey: desktopQueryKeys.project(sessionId ?? ''),
    enabled: host !== null && sessionId !== null,
    queryFn: async () =>
      shownProjectTitle(
        (
          await createDesktopClient({ desktopCall: requireHost(host).desktopCall }).getProject(
            sessionId ?? '',
          )
        )?.title,
      ),
  });

  return {
    model: read.data ?? null,
    notes: notes.data ?? [],
    projectTitle: project.data ?? '',
    loadFailed: read.isError || notes.isError || project.isError,
    selectManuscript: (id: string, layerId?: string) => {
      if (sessionId === null) return;
      setPicked({ sessionId, locateKey, manuscriptId: id, layerId, fallback: true });
    },
    /** Re-reads this session's project reads; rejects when the read model fails. */
    refetch: async (seen: string) => {
      await queryClient.refetchQueries(
        { queryKey: desktopQueryKeys.projectReads(seen), type: 'active' },
        { throwOnError: true },
      );
    },
    refetchNotes: async (seen: string) => {
      await queryClient.refetchQueries(
        { queryKey: desktopQueryKeys.unitNotes(seen, manuscriptId), type: 'active' },
        { throwOnError: true },
      );
    },
    dropSession: (old: string | null) => {
      setPicked(null);
      if (old !== null) queryClient.removeQueries({ queryKey: desktopQueryKeys.session(old) });
    },
  };
}

export interface UnitNote {
  id: string;
  unitId: string | null;
  text: string;
  category: ContentNoteCategory | null;
  view: 'timeline' | 'waveform' | null;
}

const SHOWN_NOTE_KINDS = ['unit'] as const;

async function loadShownNotes(
  host: DesktopReadHost,
  sessionId: string,
  manuscriptId: string | null,
): Promise<UnitNote[]> {
  if (manuscriptId === null) return [];
  const rows = await createDesktopClient({ desktopCall: host.desktopCall }).listNotes(sessionId, {
    manuscriptId,
    attachment: 'active',
  });
  return rows
    .filter((row) => SHOWN_NOTE_KINDS.some((kind) => kind === row.anchorKind))
    .map((row) => ({
      id: row.id,
      unitId: row.unitId,
      text: row.content.default ?? '',
      category: row.category,
      view: row.view,
    }));
}

function requireHost(host: DesktopReadHost | null): DesktopReadHost {
  if (host === null) throw new Error('desktop host is missing');
  return host;
}

function readApi(host: DesktopReadHost): DesktopProjectReadApi {
  const client = createDesktopClient({ desktopCall: host.desktopCall });
  return {
    listManuscripts: (sessionId) => client.listManuscripts(sessionId),
    listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
    listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
    mediaPlayUrl: async (sessionId, mediaId) =>
      (await host.desktopMediaUrl(sessionId, mediaId)).url,
  };
}

function shownProjectTitle(title: Record<string, string> | undefined): string {
  if (title === undefined) return '';
  const und = title.und?.trim() ?? '';
  if (und.length > 0) return und;
  for (const value of Object.values(title)) {
    const text = value.trim();
    if (text.length > 0) return text;
  }
  return '';
}
