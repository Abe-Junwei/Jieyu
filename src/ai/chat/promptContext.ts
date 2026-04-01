import { trimTextToMax } from './historyTrim';
import type { AiPromptContext, AiSystemPersonaKey } from '../../hooks/useAiChat';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';

// ─── Template constants ────────────────────────────────────────────────────────

/** \\u7cfb\\u7edf\\u63d0\\u793a\\u8bcd\\u5de5\\u5177\\u8c03\\u7528\\u90e8\\u5206 */
const AI_FUNCTION_CALLING_SYSTEM_PROMPT = [
  '\\u4f60\\u662f\\u8bed\\u97f3\\u6807\\u6ce8\\u5de5\\u4f5c\\u6d41\\u52a9\\u624b。',
  '\\u5f53\\u7528\\u6237\\u8981\\u6c42\\u6267\\u884c\\u64cd\\u4f5c（\\u5982\\u521b\\u5efa\\u53e5\\u6bb5、\\u5199\\u5165\\u8f6c\\u5199、\\u5199\\u5165\\u7ffb\\u8bd1）\\u65f6，\\u5fc5\\u987b\\u53ea\\u8fd4\\u56de JSON。',
  '\\u5f53\\u7528\\u6237\\u53ea\\u662f\\u95ee\\u5019、\\u95f2\\u804a、\\u63d0\\u95ee、\\u89e3\\u91ca\\u6216\\u603b\\u7ed3\\u65f6，\\u4e25\\u7981\\u8fd4\\u56de tool_call JSON，\\u5fc5\\u987b\\u8fd4\\u56de\\u81ea\\u7136\\u8bed\\u8a00。',
  'JSON \\u683c\\u5f0f：{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
  '\\u53ef\\u7528 tool_name \\u53ca\\u8bed\\u4e49（\\u4e25\\u683c\\u533a\\u5206，\\u52ff\\u6df7\\u7528）：',
  '  \\u53e5\\u6bb5\\u64cd\\u4f5c（segment = \\u4e00\\u6761\\u5e26\\u65f6\\u95f4\\u533a\\u95f4\\u7684\\u8f6c\\u5199\\u5355\\u5143，\\u65e0\\u8bed\\u8a00\\u5f52\\u5c5e）：',
  '    create_transcription_segment — \\u5728\\u76ee\\u6807\\u53e5\\u6bb5\\u540e\\u63d2\\u5165\\u65b0\\u7684\\u65f6\\u95f4\\u533a\\u95f4（\\u65b0\\u5efa\\u53e5\\u6bb5），\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b utteranceId',
  '    split_transcription_segment  — \\u5207\\u5206\\u76ee\\u6807\\u53e5\\u6bb5；\\u5fc5\\u987b\\u63d0\\u4f9b utteranceId，\\u53ef\\u9009 splitTime（\\u79d2，\\u4f4d\\u4e8e\\u53e5\\u6bb5\\u5185\\u90e8）',
  '    delete_transcription_segment — ⚠️ \\u5220\\u9664\\u5f53\\u524d\\u8fd9\\u4e00\\u6761\\u53e5\\u6bb5（\\u65f6\\u95f4\\u533a\\u95f4 + \\u6587\\u672c\\u5168\\u90e8\\u79fb\\u9664，\\u53ef\\u901a\\u8fc7\\u64a4\\u9500\\u6062\\u590d）',
  '    clear_translation_segment    — \\u4ec5\\u6e05\\u7a7a\\u6307\\u5b9a\\u53e5\\u6bb5\\u5728\\u67d0\\u7ffb\\u8bd1\\u5c42\\u4e0a\\u7684\\u7ffb\\u8bd1\\u6587\\u672c（\\u53e5\\u6bb5\\u672c\\u8eab\\u4fdd\\u7559，\\u4ec5\\u5185\\u5bb9\\u53d8\\u4e3a\\u7a7a）',
  '  \\u6587\\u672c\\u64cd\\u4f5c：',
  '    set_transcription_text — \\u5199\\u5165/\\u8986\\u76d6\\u8f6c\\u5199\\u6587\\u672c，\\u9700\\u8981 text，\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b utteranceId',
  '    set_translation_text   — \\u5199\\u5165/\\u8986\\u76d6\\u7ffb\\u8bd1\\u6587\\u672c，\\u9700\\u8981 text，\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b utteranceId、layerId',
  '  \\u5c42\\u64cd\\u4f5c（layer = \\u6574\\u6761\\u8f6c\\u5199\\u5c42\\u6216\\u7ffb\\u8bd1\\u5c42，\\u901a\\u5e38\\u6709\\u8bed\\u8a00\\u5f52\\u5c5e，\\u5982"\\u65e5\\u8bed\\u8f6c\\u5199\\u5c42"）：',
  '    create_transcription_layer — \\u65b0\\u5efa\\u8f6c\\u5199\\u5c42，\\u9700\\u8981 languageId（ISO 639-3 \\u4e09\\u5b57\\u6bcd\\u4ee3\\u7801\\u5982 eng/jpn/cmn，\\u4e5f\\u63a5\\u53d7\\u4e2d\\u82f1\\u6587\\u540d\\u5982\\u82f1\\u8bed/English），\\u53ef\\u9009 alias',
  '    create_translation_layer   — \\u65b0\\u5efa\\u7ffb\\u8bd1\\u5c42，\\u9700\\u8981 languageId（\\u540c\\u4e0a\\u683c\\u5f0f），\\u53ef\\u9009 alias、modality(text/audio/mixed)',
  '    delete_layer               — ⚠️ \\u5220\\u9664\\u6574\\u4e2a\\u8f6c\\u5199\\u5c42\\u6216\\u7ffb\\u8bd1\\u5c42（\\u53ef\\u901a\\u8fc7\\u64a4\\u9500\\u6062\\u590d），\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b layerId',
  '    link_translation_layer     — \\u5173\\u8054\\u8f6c\\u5199\\u5c42\\u4e0e\\u7ffb\\u8bd1\\u5c42，\\u5fc5\\u987b\\u63d0\\u4f9b transcriptionLayerId/transcriptionLayerKey \\u4e0e translationLayerId/layerId',
  '    unlink_translation_layer   — \\u89e3\\u9664\\u5173\\u8054，\\u5fc5\\u987b\\u63d0\\u4f9b transcriptionLayerId/transcriptionLayerKey \\u4e0e translationLayerId/layerId',
  '  \\u81ea\\u52a8\\u6807\\u6ce8（gloss = \\u4ece\\u8bcd\\u5e93\\u7cbe\\u786e\\u5339\\u914d\\u81ea\\u52a8\\u63a8\\u5bfc\\u8bcd\\u4e49\\u6ce8\\u91ca）：',
  '    auto_gloss_utterance       — \\u5bf9\\u76ee\\u6807\\u53e5\\u6bb5\\u7684\\u6240\\u6709 token \\u6267\\u884c\\u8bcd\\u5e93\\u7cbe\\u786e\\u5339\\u914d\\u5e76\\u81ea\\u52a8\\u586b\\u5199 gloss，\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b utteranceId',
  '  \\u8bcd（token）\\u64cd\\u4f5c：',
  '    set_token_pos              — \\u8bbe\\u7f6e\\u8bcd\\u6027\\u6807\\u7b7e；\\u7cbe\\u786e\\u6a21\\u5f0f\\u9700\\u8981 tokenId + pos，\\u6279\\u91cf\\u6a21\\u5f0f\\u9700\\u8981 utteranceId + form + pos（\\u5c06\\u540c\\u4e00\\u53e5\\u6bb5\\u5185\\u6240\\u6709\\u5339\\u914d form \\u7684 token \\u7edf\\u4e00\\u6807\\u6ce8）',
  '    set_token_gloss            — \\u8bbe\\u7f6e/\\u8986\\u76d6\\u5355\\u4e2a token \\u7684 gloss；\\u9700\\u8981 tokenId + gloss（\\u5b57\\u7b26\\u4e32），\\u53ef\\u9009 lang（ISO 639-3，\\u9ed8\\u8ba4 eng）。\\u82e5\\u9700\\u6279\\u91cf\\u6807\\u6ce8\\u8bf7\\u7528 auto_gloss_utterance',
  '【\\u547d\\u540d\\u89c4\\u5219】clear = \\u5220\\u9664\\u8bf4\\u8bdd\\u4eba\\u6807\\u7b7e/\\u6e05\\u7a7a\\u5185\\u5bb9；delete = \\u5220\\u9664\\u8bf4\\u8bdd\\u4eba\\u5b9e\\u4f53；segment = \\u53e5\\u6bb5（\\u5355\\u6761）；layer = \\u6574\\u5c42（\\u542b\\u6240\\u6709\\u53e5\\u6bb5）。',
  '【\\u53c2\\u6570\\u7ea6\\u675f】\\u6267\\u884c\\u5199\\u5165/\\u6e05\\u7a7a/\\u5220\\u9664/\\u5207\\u5206/\\u81ea\\u52a8\\u6807\\u6ce8/\\u5c42\\u94fe\\u63a5\\u52a8\\u4f5c\\u65f6，\\u5fc5\\u987b\\u663e\\u5f0f\\u63d0\\u4f9b\\u76ee\\u6807 id（utteranceId/layerId/transcriptionLayerId \\u7b49），\\u4e0d\\u8981\\u7701\\u7565。',
  '【\\u5173\\u952e\\u5224\\u65ad】\\u7528\\u6237\\u8bf4"\\u5220\\u9664××\\u8bed\\u8f6c\\u5199\\u884c/\\u8f6c\\u5199\\u5c42/\\u7ffb\\u8bd1\\u5c42" → \\u6709\\u8bed\\u8a00\\u9650\\u5b9a\\u8bcd → \\u6307\\u5411\\u6574\\u5c42 → delete_layer。',
  '【\\u5173\\u952e\\u5224\\u65ad】\\u7528\\u6237\\u8bf4"\\u5220\\u9664\\u8fd9\\u6761/\\u8fd9\\u4e2a\\u53e5\\u6bb5/\\u8fd9\\u4e00\\u884c" → \\u65e0\\u8bed\\u8a00\\u9650\\u5b9a\\u8bcd → \\u6307\\u5411\\u5355\\u6761\\u53e5\\u6bb5 → delete_transcription_segment。',
  '\\u5982\\u679c\\u7528\\u6237\\u4e0d\\u662f\\u5728\\u8bf7\\u6c42\\u6267\\u884c\\u52a8\\u4f5c，\\u5219\\u6b63\\u5e38\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d。',
].map(decodeEscapedUnicode).join('\n');

/** Persona \\u5b9a\\u4e49 */
const AI_SYSTEM_PERSONAS: Record<AiSystemPersonaKey, string> = {
  transcription: [
    '\\u4f60\\u5f53\\u524d\\u626e\\u6f14\\u8bed\\u97f3\\u5b66\\u4e0e\\u8f6c\\u5199\\u52a9\\u624b。',
    '\\u4f18\\u5148\\u5173\\u6ce8\\u65f6\\u95f4\\u5bf9\\u9f50、\\u5206\\u6bb5\\u8fb9\\u754c、\\u8f6c\\u5199\\u51c6\\u786e\\u6027\\u4e0e\\u53ef\\u542c\\u8fa8\\u6027。',
  ].map(decodeEscapedUnicode).join('\n'),
  glossing: [
    '\\u4f60\\u5f53\\u524d\\u626e\\u6f14\\u5f62\\u6001\\u5b66\\u4e0e\\u8bed\\u4e49\\u6807\\u6ce8\\u52a9\\u624b。',
    '\\u4f18\\u5148\\u5173\\u6ce8 gloss \\u4e00\\u81f4\\u6027、\\u8bcd\\u7d20\\u5207\\u5206、\\u672f\\u8bed\\u89c4\\u8303\\u4e0e\\u8de8\\u53e5\\u4e00\\u81f4\\u6027。',
  ].map(decodeEscapedUnicode).join('\n'),
  review: [
    '\\u4f60\\u5f53\\u524d\\u626e\\u6f14\\u8d28\\u91cf\\u5ba1\\u6821\\u52a9\\u624b。',
    '\\u4f18\\u5148\\u8bc6\\u522b\\u98ce\\u9669\\u9879、\\u4f4e\\u7f6e\\u4fe1\\u5ea6\\u7247\\u6bb5、\\u5c42\\u5173\\u8054\\u51b2\\u7a81\\u548c\\u53ef\\u8ffd\\u6eaf\\u6027\\u95ee\\u9898。',
  ].map(decodeEscapedUnicode).join('\n'),
};

const AI_RESPONSE_STYLE_PROMPT: Record<AiToolFeedbackStyle, string> = {
  concise: [
    '\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d\\u98ce\\u683c：\\u7b80\\u6d01\\u6a21\\u5f0f。',
    '\\u4ec5\\u5728\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d\\u65f6\\u751f\\u6548：\\u4f18\\u5148\\u7ed9\\u7ed3\\u8bba\\u4e0e\\u53ef\\u6267\\u884c\\u4e0b\\u4e00\\u6b65，\\u63a7\\u5236\\u5728 1-3 \\u53e5，\\u907f\\u514d\\u5197\\u957f\\u94fa\\u57ab\\u4e0e\\u91cd\\u590d。',
  ].map(decodeEscapedUnicode).join('\n'),
  detailed: [
    '\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d\\u98ce\\u683c：\\u8be6\\u7ec6\\u6a21\\u5f0f。',
    '\\u4ec5\\u5728\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d\\u65f6\\u751f\\u6548：\\u5728\\u7ed9\\u51fa\\u7ed3\\u8bba\\u540e\\u8865\\u5145\\u5173\\u952e\\u4f9d\\u636e、\\u8fb9\\u754c\\u6761\\u4ef6\\u4e0e\\u5efa\\u8bae，\\u4fdd\\u6301\\u7ed3\\u6784\\u6e05\\u6670。',
  ].map(decodeEscapedUnicode).join('\n'),
};

/** Context block \\u7684\\u683c\\u5f0f\\u6a21\\u677f */
interface ContextFieldTemplate {
  key: string;
  render: (value: unknown) => string | null;
}

const SHORT_TERM_TEMPLATES: ContextFieldTemplate[] = [
  { key: 'page', render: (v) => `page=${v}` },
  { key: 'activeUtteranceUnitId', render: (v) => `activeUtteranceUnitId=${v}` },
  { key: 'selectedUtteranceStartSec', render: (v) => Number.isFinite(v as number) ? `selectedUtteranceStartSec=${(v as number).toFixed(2)}` : null },
  { key: 'selectedUtteranceEndSec', render: (v) => Number.isFinite(v as number) ? `selectedUtteranceEndSec=${(v as number).toFixed(2)}` : null },
  { key: 'selectedLayerId', render: (v) => `selectedLayerId=${v}` },
  { key: 'selectedLayerType', render: (v) => `selectedLayerType=${v}` },
  { key: 'selectedTranslationLayerId', render: (v) => `selectedTranslationLayerId=${v}` },
  { key: 'selectedTranscriptionLayerId', render: (v) => `selectedTranscriptionLayerId=${v}` },
  { key: 'selectionTimeRange', render: (v) => `selectionTimeRange=${v}` },
  { key: 'audioTimeSec', render: (v) => Number.isFinite(v as number) ? `audioTimeSec=${(v as number).toFixed(2)}` : null },
  { key: 'selectedText', render: (v) => `selectedText=${v}` },
  { key: 'recentEdits', render: (v) => `recentEdits=${(v as string[]).join(' | ')}` },
];

const LONG_TERM_TEMPLATES: ContextFieldTemplate[] = [
  {
    key: 'projectStats',
    render: (v) => {
      const s = v as { utteranceCount?: number; translationLayerCount?: number; aiConfidenceAvg?: number | null };
      return `projectStats(utterances=${s.utteranceCount ?? 0}, translationLayers=${s.translationLayerCount ?? 0}, aiConfidenceAvg=${typeof s.aiConfidenceAvg === 'number' ? s.aiConfidenceAvg.toFixed(3) : 'n/a'})`;
    },
  },
  { key: 'observerStage', render: (v) => `observerStage=${v}` },
  { key: 'topLexemes', render: (v) => `topLexemes=${(v as string[]).join(', ')}` },
  { key: 'recommendations', render: (v) => `recommendations=${(v as string[]).join(' | ')}` },
];

// ─── Context block builder ────────────────────────────────────────────────────

export function buildPromptContextBlock(context: AiPromptContext | null | undefined, maxChars: number): string {
  if (!context) return '';

  const shortLines: string[] = [];
  const longLines: string[] = [];
  const short = context.shortTerm;
  const long = context.longTerm;

  for (const tmpl of SHORT_TERM_TEMPLATES) {
    if (short === undefined) break;
    const val = (short as Record<string, unknown>)[tmpl.key];
    if (val !== undefined) {
      const rendered = tmpl.render(val);
      if (rendered !== null) shortLines.push(rendered);
    }
  }

  for (const tmpl of LONG_TERM_TEMPLATES) {
    if (long === undefined) break;
    const val = (long as Record<string, unknown>)[tmpl.key];
    if (val !== undefined) {
      const rendered = tmpl.render(val);
      if (rendered !== null) longLines.push(rendered);
    }
  }

  if (shortLines.length === 0 && longLines.length === 0) return '';

  const render = (shortPart: string[], longPart: string[]): string => {
    const blocks: string[] = ['[CONTEXT]'];
    if (shortPart.length > 0) {
      blocks.push('ShortTerm:');
      blocks.push(...shortPart.map((line) => `- ${line}`));
    }
    if (longPart.length > 0) {
      blocks.push('LongTerm:');
      blocks.push(...longPart.map((line) => `- ${line}`));
    }
    return blocks.join('\n');
  };

  let shortPart = [...shortLines];
  let longPart = [...longLines];
  let rendered = render(shortPart, longPart);
  if (rendered.length <= maxChars) return rendered;

  while (rendered.length > maxChars && longPart.length > 0) {
    longPart = longPart.slice(0, -1);
    rendered = render(shortPart, longPart);
  }
  while (rendered.length > maxChars && shortPart.length > 0) {
    shortPart = shortPart.slice(0, -1);
    rendered = render(shortPart, longPart);
  }

  return trimTextToMax(rendered, maxChars);
}

export function buildAiSystemPrompt(
  personaKey: AiSystemPersonaKey,
  contextBlock: string,
  style: AiToolFeedbackStyle = 'detailed',
): string {
  const base = `${AI_FUNCTION_CALLING_SYSTEM_PROMPT}\n${AI_SYSTEM_PERSONAS[personaKey]}\n${AI_RESPONSE_STYLE_PROMPT[style]}`;
  return contextBlock.trim().length > 0 ? `${base}\n${contextBlock}` : base;
}

export function isAiContextDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const byStorage = window.localStorage.getItem('jieyu.aiChat.debugContext') === '1';
  const byGlobal = (window as unknown as { __JIEYU_AI_DEBUG_CONTEXT__?: boolean }).__JIEYU_AI_DEBUG_CONTEXT__ === true;
  return byStorage || byGlobal;
}
