import { Fragment, useLayoutEffect, useMemo } from 'react';

export type StreamTextSlice = {
  segment: string;
  isWord: boolean;
  start: number;
  end: number;
};

/** 仅对末尾这么多「词」做逐段 span，更早内容合并为纯文本，控制极长回复的 DOM 规模 */
export const DEFAULT_STREAM_WORD_TAIL_WORDS = 80;

/**
 * 返回 `slices` 中「尾部最多 maxTailWords 个词」的起始下标；此前片段应合并为纯文本。
 */
export function computeStreamTailSliceCut(slices: StreamTextSlice[], maxTailWords: number): number {
  if (maxTailWords <= 0 || slices.length === 0) return 0;
  let wordsFromEnd = 0;
  let cut = 0;
  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const slice = slices[i];
    if (!slice) continue;
    if (slice.isWord) {
      wordsFromEnd += 1;
      if (wordsFromEnd > maxTailWords) {
        cut = i + 1;
        break;
      }
    }
  }
  return cut;
}

/** TS lib 未含 Segmenter 时的最小类型 | Minimal typing when lib lacks Segmenter */
type IntlSegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'word' },
) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

/**
 * 按「词」切分流式正文，便于逐词渐入。优先 Intl.Segmenter（中英混排更合理）。
 */
export function sliceAssistantStreamText(text: string, locale: string): StreamTextSlice[] {
  if (text.length === 0) return [];
  const SegmenterCtor = (Intl as unknown as { Segmenter?: IntlSegmenterCtor }).Segmenter;
  if (typeof Intl !== 'undefined' && typeof SegmenterCtor === 'function') {
    try {
      const seg = new SegmenterCtor(locale || undefined, { granularity: 'word' });
      const out: StreamTextSlice[] = [];
      let start = 0;
      for (const s of seg.segment(text)) {
        const segment = s.segment;
        const end = start + segment.length;
        const isWord = Boolean(s.isWordLike);
        out.push({ segment, isWord, start, end });
        start = end;
      }
      return out;
    } catch {
      // locale 无效等 | Invalid locale
    }
  }
  const out: StreamTextSlice[] = [];
  const re = /\S+|\s+/gu;
  let m: RegExpExecArray | null;
  let start = 0;
  while ((m = re.exec(text)) !== null) {
    const segment = m[0];
    const end = start + segment.length;
    out.push({ segment, isWord: /\S/.test(segment), start, end });
    start = end;
  }
  return out.length > 0 ? out : [{ segment: text, isWord: true, start: 0, end: text.length }];
}

// Module-level cache: safe for browser SPA; avoid in SSR or concurrent-mode
// roots with overlapping streamKeys. Cleaned up on component unmount.
const streamAssistantPrevByKey = new Map<string, string>();

export interface StreamWordsTextProps {
  /** 每条流式分支唯一，避免多实例共享状态 | Unique per stream branch */
  streamKey: string;
  text: string;
  locale: string;
  /** 仅末尾若干词保留 span，更早内容合并为一段文本 | DOM cap for long streams */
  maxTailWords?: number;
}

/**
 * 流式助手正文：按词渐入；`prefers-reduced-motion` 由 CSS 关闭动画。
 */
export function StreamWordsText({
  streamKey,
  text,
  locale,
  maxTailWords = DEFAULT_STREAM_WORD_TAIL_WORDS,
}: StreamWordsTextProps) {
  const slices = useMemo(() => sliceAssistantStreamText(text, locale), [text, locale]);

  const prevRaw = streamAssistantPrevByKey.get(streamKey) ?? '';
  const prevCommitted = text.startsWith(prevRaw) ? prevRaw : '';

  useLayoutEffect(() => {
    streamAssistantPrevByKey.set(streamKey, text);
  }, [streamKey, text]);

  useLayoutEffect(() => () => {
    streamAssistantPrevByKey.delete(streamKey);
  }, [streamKey]);

  const tailCut = useMemo(
    () => computeStreamTailSliceCut(slices, maxTailWords),
    [slices, maxTailWords],
  );
  const headSlices = tailCut > 0 ? slices.slice(0, tailCut) : [];
  const tailSlices = tailCut > 0 ? slices.slice(tailCut) : slices;
  const headPlain = headSlices.length > 0 ? headSlices.map((s) => s.segment).join('') : null;

  return (
    <>
      {headPlain !== null ? headPlain : null}
      {tailSlices.map((s) => {
        // 仅「整词起点」已在新后缀内时渐入，避免同一英文词随 delta 变长时重复闪动画
        const animateWord = s.isWord && s.start >= prevCommitted.length;
        const key = `${s.start}-${s.end}`;
        if (animateWord) {
          return (
            <span key={key} className="ai-chat-stream-word">
              {s.segment}
            </span>
          );
        }
        return <Fragment key={key}>{s.segment}</Fragment>;
      })}
    </>
  );
}
