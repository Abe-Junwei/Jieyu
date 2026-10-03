import { useEffect, useRef, useState } from 'react';
import { LinguisticService } from '../app/languageAssetPageAccess';
import {
  pickAnnotationPlaybackMedia,
  resolveAnnotationMediaSrc,
} from './annotation/playAnnotationUnitRange';
import {
  buildSentenceAcousticFigure,
  encodeWavPcm16,
  slicePcm,
  type SentenceAcousticFigure,
} from './annotation/sentenceAcousticFigure';

export type AnnotationSentenceAcoustic = {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  figure: SentenceAcousticFigure | null;
  audioUrl: string | null;
};

const pcmCache = new Map<string, { sampleRate: number; pcm: Float32Array }>();

async function decodeMediaPcm(src: string): Promise<{ sampleRate: number; pcm: Float32Array }> {
  const response = await fetch(src);
  if (!response.ok) throw new Error('media fetch failed');
  const bytes = await response.arrayBuffer();
  const Ctx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('AudioContext unavailable');
  const context = new Ctx();
  try {
    const audio = await context.decodeAudioData(bytes.slice(0));
    return { sampleRate: audio.sampleRate, pcm: audio.getChannelData(0).slice() };
  } finally {
    await context.close();
  }
}

export function useAnnotationSentenceAcoustic(input: {
  textId: string;
  mediaId: string;
  startTime: number;
  endTime: number;
  enabled: boolean;
}): AnnotationSentenceAcoustic {
  const [state, setState] = useState<AnnotationSentenceAcoustic>({
    status: 'idle',
    figure: null,
    audioUrl: null,
  });
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!input.enabled || input.textId.length === 0 || !(input.endTime > input.startTime)) {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setState({ status: 'idle', figure: null, audioUrl: null });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', figure: null, audioUrl: null });
    void (async () => {
      try {
        const items = await LinguisticService.media.listByTextId(input.textId);
        const media = pickAnnotationPlaybackMedia(items, input.mediaId);
        const resolved = media ? resolveAnnotationMediaSrc(media) : null;
        if (!resolved) {
          if (!cancelled) setState({ status: 'unavailable', figure: null, audioUrl: null });
          return;
        }
        const cacheKey = `${input.textId}:${media?.id ?? input.mediaId}`;
        let decoded = pcmCache.get(cacheKey);
        try {
          if (!decoded) {
            decoded = await decodeMediaPcm(resolved.src);
            pcmCache.clear();
            pcmCache.set(cacheKey, decoded);
          }
        } finally {
          if (resolved.objectUrl) URL.revokeObjectURL(resolved.objectUrl);
        }
        const slice = slicePcm(decoded.pcm, decoded.sampleRate, input.startTime, input.endTime);
        const figure =
          slice.length > 0 ? buildSentenceAcousticFigure(slice, decoded.sampleRate) : null;
        const audioUrl =
          slice.length > 0 ? URL.createObjectURL(encodeWavPcm16(slice, decoded.sampleRate)) : null;
        if (cancelled) {
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          return;
        }
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = audioUrl;
        setState(
          figure && audioUrl
            ? { status: 'ready', figure, audioUrl }
            : { status: 'unavailable', figure: null, audioUrl: null },
        );
      } catch {
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
        if (!cancelled) setState({ status: 'unavailable', figure: null, audioUrl: null });
      }
    })();
    return () => {
      cancelled = true;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, [input.enabled, input.endTime, input.mediaId, input.startTime, input.textId]);

  return state;
}
