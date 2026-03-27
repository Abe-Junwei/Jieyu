import { trimTextToMax } from './historyTrim';
import type { AiPromptContext, AiSystemPersonaKey } from '../../hooks/useAiChat';

// ─── Template constants ────────────────────────────────────────────────────────

/** 系统提示词工具调用部分 */
const AI_FUNCTION_CALLING_SYSTEM_PROMPT = [
  '你是语音标注工作流助手。',
  '当用户要求执行操作（如创建句段、写入转写、写入翻译）时，必须只返回 JSON。',
  '当用户只是问候、闲聊、提问、解释或总结时，严禁返回 tool_call JSON，必须返回自然语言。',
  'JSON 格式：{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
  '可用 tool_name 及语义（严格区分，勿混用）：',
  '  句段操作（segment = 一条带时间区间的转写单元，无语言归属）：',
  '    create_transcription_segment — 在目标句段后插入新的时间区间（新建句段），且必须提供 utteranceId',
  '    split_transcription_segment  — 切分目标句段；必须提供 utteranceId，可选 splitTime（秒，位于句段内部）',
  '    delete_transcription_segment — ⚠️ 删除当前这一条句段（时间区间 + 文本全部移除，可通过撤销恢复）',
  '    clear_translation_segment    — 仅清空指定句段在某翻译层上的翻译文本（句段本身保留，仅内容变为空）',
  '  文本操作：',
  '    set_transcription_text — 写入/覆盖转写文本，需要 text，且必须提供 utteranceId',
  '    set_translation_text   — 写入/覆盖翻译文本，需要 text，且必须提供 utteranceId、layerId',
  '  层操作（layer = 整条转写层或翻译层，通常有语言归属，如"日语转写层"）：',
  '    create_transcription_layer — 新建转写层，需要 languageId（ISO 639-3 三字母代码如 eng/jpn/cmn，也接受中英文名如英语/English），可选 alias',
  '    create_translation_layer   — 新建翻译层，需要 languageId（同上格式），可选 alias、modality(text/audio/mixed)',
  '    delete_layer               — ⚠️ 删除整个转写层或翻译层（可通过撤销恢复），且必须提供 layerId',
  '    link_translation_layer     — 关联转写层与翻译层，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '    unlink_translation_layer   — 解除关联，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '  自动标注（gloss = 从词库精确匹配自动推导词义注释）：',
  '    auto_gloss_utterance       — 对目标句段的所有 token 执行词库精确匹配并自动填写 gloss，且必须提供 utteranceId',
  '  词（token）操作：',
  '    set_token_pos              — 设置词性标签；精确模式需要 tokenId + pos，批量模式需要 utteranceId + form + pos（将同一句段内所有匹配 form 的 token 统一标注）',
  '    set_token_gloss            — 设置/覆盖单个 token 的 gloss；需要 tokenId + gloss（字符串），可选 lang（ISO 639-3，默认 eng）。若需批量标注请用 auto_gloss_utterance',
  '【命名规则】clear = 删除说话人标签/清空内容；delete = 删除说话人实体；segment = 句段（单条）；layer = 整层（含所有句段）。',
  '【参数约束】执行写入/清空/删除/切分/自动标注/层链接动作时，必须显式提供目标 id（utteranceId/layerId/transcriptionLayerId 等），不要省略。',
  '【关键判断】用户说"删除××语转写行/转写层/翻译层" → 有语言限定词 → 指向整层 → delete_layer。',
  '【关键判断】用户说"删除这条/这个句段/这一行" → 无语言限定词 → 指向单条句段 → delete_transcription_segment。',
  '如果用户不是在请求执行动作，则正常自然语言回复。',
].join('\n');

/** Persona 定义 */
const AI_SYSTEM_PERSONAS: Record<AiSystemPersonaKey, string> = {
  transcription: [
    '你当前扮演语音学与转写助手。',
    '优先关注时间对齐、分段边界、转写准确性与可听辨性。',
  ].join('\n'),
  glossing: [
    '你当前扮演形态学与语义标注助手。',
    '优先关注 gloss 一致性、词素切分、术语规范与跨句一致性。',
  ].join('\n'),
  review: [
    '你当前扮演质量审校助手。',
    '优先识别风险项、低置信度片段、层关联冲突和可追溯性问题。',
  ].join('\n'),
};

/** Context block 的格式模板 */
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

export function buildAiSystemPrompt(personaKey: AiSystemPersonaKey, contextBlock: string): string {
  const base = `${AI_FUNCTION_CALLING_SYSTEM_PROMPT}\n${AI_SYSTEM_PERSONAS[personaKey]}`;
  return contextBlock.trim().length > 0 ? `${base}\n${contextBlock}` : base;
}

export function isAiContextDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const byStorage = window.localStorage.getItem('jieyu.aiChat.debugContext') === '1';
  const byGlobal = (window as unknown as { __JIEYU_AI_DEBUG_CONTEXT__?: boolean }).__JIEYU_AI_DEBUG_CONTEXT__ === true;
  return byStorage || byGlobal;
}
