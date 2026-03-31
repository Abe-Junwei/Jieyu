import type { OrthographyRenderPolicy } from './layerDisplayStyle';

const LTR_ISOLATE = '\u2066';
const RTL_ISOLATE = '\u2067';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

const BIDI_ISOLATE_CONTROL_RE = /[\u2066\u2067\u2068\u2069]/g;

/**
 * 为复制/纯文本导出包裹方向隔离符 | Wrap copy/plain-text export with directional isolates
 */
export function wrapPlainTextWithBidiIsolation(
  text: string,
  renderPolicy?: Pick<OrthographyRenderPolicy, 'textDirection' | 'isolateInlineRuns'>,
): string {
  if (!text || !renderPolicy?.isolateInlineRuns) return text;

  const prefix = renderPolicy.textDirection === 'rtl' ? RTL_ISOLATE : LTR_ISOLATE;
  if (text.startsWith(prefix) && text.endsWith(POP_DIRECTIONAL_ISOLATE)) {
    return text;
  }

  return `${prefix}${text}${POP_DIRECTIONAL_ISOLATE}`;
}

/**
 * 导入时移除由解语插入的 bidi 隔离控制符 | Strip Jieyu-added bidi isolation controls on import
 */
export function stripPlainTextBidiIsolation(text: string): string {
  return text.replace(BIDI_ISOLATE_CONTROL_RE, '');
}