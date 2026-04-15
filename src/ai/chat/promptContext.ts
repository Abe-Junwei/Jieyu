import { trimTextToMax } from './historyTrim';
import type { AiPromptContext, AiSystemPersonaKey } from './chatDomain.types';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import { decodeEscapedUnicode } from '../../utils/decodeEscapedUnicode';
import { buildLocalContextToolGuide } from './localContextTools';

// ─── Template constants ────────────────────────────────────────────────────────

/** \\u7cfb\\u7edf\\u63d0\\u793a\\u8bcd\\u5de5\\u5177\\u8c03\\u7528\\u90e8\\u5206 */
const AI_FUNCTION_CALLING_SYSTEM_PROMPT = [
  '\\u4f60\\u662f\\u8bed\\u97f3\\u6807\\u6ce8\\u5de5\\u4f5c\\u6d41\\u52a9\\u624b。',
  '\\u5f53\\u7528\\u6237\\u8981\\u6c42\\u6267\\u884c\\u64cd\\u4f5c（\\u5982\\u521b\\u5efa\\u53e5\\u6bb5、\\u5199\\u5165\\u8f6c\\u5199、\\u5199\\u5165\\u7ffb\\u8bd1）\\u65f6，\\u5fc5\\u987b\\u53ea\\u8fd4\\u56de JSON。',
  '\\u5f53\\u7528\\u6237\\u53ea\\u662f\\u95ee\\u5019、\\u95f2\\u804a、\\u63d0\\u95ee、\\u89e3\\u91ca\\u6216\\u603b\\u7ed3\\u65f6\\uff0c\\u4e25\\u7981\\u8fd4\\u56de\\u64cd\\u4f5c\\u7c7b tool_call JSON\\uff08create/delete/set/merge/split/link/unlink/auto_gloss/set_token_*\\uff09\\u3002\\u4f46\\u53ef\\u4ee5\\u4e14\\u5e94\\u5f53\\u8fd4\\u56de\\u67e5\\u8be2\\u7c7b tool_call JSON\\uff08list_units/search_units/get_unit_detail/get_current_selection/get_project_stats/get_waveform_analysis/get_acoustic_summary\\uff09\\u4ee5\\u83b7\\u53d6\\u51c6\\u786e\\u6570\\u636e\\u3002',
  'JSON \\u683c\\u5f0f：{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
  '\\u53ef\\u7528 tool_name \\u53ca\\u8bed\\u4e49（\\u4e25\\u683c\\u533a\\u5206，\\u52ff\\u6df7\\u7528）：',
  '  \\u53e5\\u6bb5\\u64cd\\u4f5c（segment = \\u4e00\\u6761\\u5e26\\u65f6\\u95f4\\u533a\\u95f4\\u7684\\u8f6c\\u5199\\u5355\\u5143，\\u65e0\\u8bed\\u8a00\\u5f52\\u5c5e）：',
    '    create_transcription_segment — \\u5728\\u76ee\\u6807\\u53e5\\u6bb5\\u540e\\u63d2\\u5165\\u65b0\\u7684\\u65f6\\u95f4\\u533a\\u95f4（\\u65b0\\u5efa\\u53e5\\u6bb5），\\u5fc5\\u987b\\u63d0\\u4f9b segmentId',
    '    split_transcription_segment  — \\u5207\\u5206\\u76ee\\u6807\\u53e5\\u6bb5；\\u5fc5\\u987b\\u63d0\\u4f9b segmentId，\\u53ef\\u9009 splitTime（\\u79d2，\\u4f4d\\u4e8e\\u53e5\\u6bb5\\u5185\\u90e8）',
    '    merge_transcription_segments — \\u5408\\u5e76\\u591a\\u4e2a\\u5df2\\u9009\\u53e5\\u6bb5；\\u5fc5\\u987b\\u63d0\\u4f9b segmentIds，\\u4e14\\u6570\\u91cf\\u81f3\\u5c11\\u4e3a 2',
  '    delete_transcription_segment — ⚠️ \\u5220\\u9664\\u5f53\\u524d\\u8fd9\\u4e00\\u6761\\u53e5\\u6bb5（\\u65f6\\u95f4\\u533a\\u95f4 + \\u6587\\u672c\\u5168\\u90e8\\u79fb\\u9664，\\u53ef\\u901a\\u8fc7\\u64a4\\u9500\\u6062\\u590d）',
  '    clear_translation_segment    — \\u4ec5\\u6e05\\u7a7a\\u6307\\u5b9a\\u53e5\\u6bb5\\u5728\\u67d0\\u7ffb\\u8bd1\\u5c42\\u4e0a\\u7684\\u7ffb\\u8bd1\\u6587\\u672c（\\u53e5\\u6bb5\\u672c\\u8eab\\u4fdd\\u7559，\\u4ec5\\u5185\\u5bb9\\u53d8\\u4e3a\\u7a7a）',
  '  \\u5feb\\u6377\\u5408\\u5e76\\u64cd\\u4f5c：',
    '    merge_prev                  — \\u5c06\\u5f53\\u524d\\u53e5\\u6bb5\\u4e0e\\u4e0a\\u4e00\\u53e5\\u6bb5\\u5408\\u5e76；\\u53ef\\u9009 segmentId，\\u82e5\\u7f3a\\u7701\\u5219\\u4f7f\\u7528\\u5f53\\u524d\\u9009\\u4e2d\\u53e5\\u6bb5',
    '    merge_next                  — \\u5c06\\u5f53\\u524d\\u53e5\\u6bb5\\u4e0e\\u4e0b\\u4e00\\u53e5\\u6bb5\\u5408\\u5e76；\\u53ef\\u9009 segmentId，\\u82e5\\u7f3a\\u7701\\u5219\\u4f7f\\u7528\\u5f53\\u524d\\u9009\\u4e2d\\u53e5\\u6bb5',
  '  \\u6587\\u672c\\u64cd\\u4f5c：',
    '    set_transcription_text — \\u5199\\u5165/\\u8986\\u76d6\\u8f6c\\u5199\\u6587\\u672c，\\u9700\\u8981 text，\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b segmentId',
    '    set_translation_text   — \\u5199\\u5165/\\u8986\\u76d6\\u7ffb\\u8bd1\\u6587\\u672c，\\u9700\\u8981 text，\\u4e14\\u5fc5\\u987b\\u63d0\\u4f9b segmentId、layerId',
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
  '【\\u53c2\\u6570\\u7ea6\\u675f】\\u6267\\u884c\\u5199\\u5165/\\u6e05\\u7a7a/\\u5220\\u9664/\\u5207\\u5206/\\u81ea\\u52a8\\u6807\\u6ce8/\\u5c42\\u94fe\\u63a5\\u52a8\\u4f5c\\u65f6，\\u5fc5\\u987b\\u663e\\u5f0f\\u63d0\\u4f9b\\u76ee\\u6807 id（segmentId/layerId/transcriptionLayerId \\u7b49），\\u4e0d\\u8981\\u7701\\u7565。',
  '【\\u5173\\u952e\\u5224\\u65ad】\\u7528\\u6237\\u8bf4"\\u5220\\u9664××\\u8bed\\u8f6c\\u5199\\u884c/\\u8f6c\\u5199\\u5c42/\\u7ffb\\u8bd1\\u5c42" → \\u6709\\u8bed\\u8a00\\u9650\\u5b9a\\u8bcd → \\u6307\\u5411\\u6574\\u5c42 → delete_layer。',
  '【\\u5173\\u952e\\u5224\\u65ad】\\u7528\\u6237\\u8bf4"\\u5220\\u9664\\u8fd9\\u6761/\\u8fd9\\u4e2a\\u53e5\\u6bb5/\\u8fd9\\u4e00\\u884c" → \\u65e0\\u8bed\\u8a00\\u9650\\u5b9a\\u8bcd → \\u6307\\u5411\\u5355\\u6761\\u53e5\\u6bb5 → delete_transcription_segment。',
  '\\u5982\\u679c\\u7528\\u6237\\u4e0d\\u662f\\u5728\\u8bf7\\u6c42\\u6267\\u884c\\u52a8\\u4f5c\\uff0c\\u5219\\u6b63\\u5e38\\u81ea\\u7136\\u8bed\\u8a00\\u56de\\u590d\\u3002',
  '\\u3010\\u53cd\\u5e7b\\u89c9\\u89c4\\u5219\\u3011\\u5f53\\u4f60\\u9700\\u8981\\u5217\\u4e3e\\u5177\\u4f53\\u6761\\u76ee\\uff08\\u8bed\\u6bb5\\u5217\\u8868\\u3001\\u65f6\\u95f4\\u8303\\u56f4\\u3001ID\\u3001\\u6587\\u672c\\u5185\\u5bb9\\u3001\\u58f0\\u5b66\\u7ec6\\u8282\\uff09\\u5374\\u6ca1\\u6709\\u8db3\\u591f\\u6570\\u636e\\u65f6\\uff0c\\u5fc5\\u987b\\u5148\\u8c03\\u7528\\u67e5\\u8be2\\u5de5\\u5177\\u83b7\\u53d6\\u771f\\u5b9e\\u6570\\u636e\\uff0c\\u7981\\u6b62\\u51ed\\u805a\\u5408\\u6570\\u5b57\\u63a8\\u6d4b\\u6216\\u7f16\\u9020\\u3002\\u82e5\\u5de5\\u5177\\u4e0d\\u53ef\\u7528\\u6216\\u7ed3\\u679c\\u88ab\\u622a\\u65ad\\uff0c\\u660e\\u786e\\u544a\\u77e5\\u7528\\u6237\\u6570\\u636e\\u4e0d\\u5b8c\\u6574\\u3002\\u4e0a\\u4e0b\\u6587\\u4e2d\\u7684 worldModelSnapshot \\u662f\\u771f\\u5b9e\\u5feb\\u7167\\uff0c\\u53ef\\u76f4\\u63a5\\u5f15\\u7528\\uff1b\\u7ec6\\u8282\\u7528 list_units \\u7b49\\u5de5\\u5177\\u8865\\u9f50\\u3002',
  '\\u3010\\u4e0a\\u4e0b\\u6587\\u4f18\\u5148\\u89c4\\u5219\\u3011[CONTEXT] \\u662f\\u5b9e\\u65f6\\u5feb\\u7167\\uff0c\\u59cb\\u7ec8\\u53cd\\u6620\\u6700\\u65b0\\u72b6\\u6001\\u3002\\u82e5 [CONTEXT] \\u4e2d\\u7684\\u6570\\u636e\\uff08\\u5982 currentMediaUnitCount\\u3001worldModelSnapshot\\u3001projectStats\\uff09\\u4e0e\\u4e4b\\u524d\\u5bf9\\u8bdd\\u4e2d\\u7684\\u56de\\u7b54\\u77db\\u76fe\\uff0c\\u59cb\\u7ec8\\u4ee5 [CONTEXT] \\u4e3a\\u51c6\\u2014\\u2014\\u7528\\u6237\\u53ef\\u80fd\\u5df2\\u589e\\u5220\\u8bed\\u6bb5\\u6216\\u4fee\\u6539\\u9879\\u76ee\\u3002\\u4e0d\\u8981\\u91cd\\u590d\\u65e7\\u7684\\u56de\\u7b54\\u3002',
].map(decodeEscapedUnicode).join('\n');

/** Persona \\u5b9a\\u4e49 */
const AI_SYSTEM_PERSONAS: Record<AiSystemPersonaKey, string> = {
  transcription: [
    '\\u4f60\\u5f53\\u524d\\u626e\\u6f14\\u8bed\\u97f3\\u5b66\\u4e0e\\u8f6c\\u5199\\u52a9\\u624b。',
    '\\u4f18\\u5148\\u5173\\u6ce8\\u65f6\\u95f4\\u5bf9\\u9f50、\\u5206\\u6bb5\\u8fb9\\u754c、\\u8f6c\\u5199\\u51c6\\u786e\\u6027\\u4e0e\\u53ef\\u542c\\u8fa8\\u6027。',
    '\\u4e0a\\u4e0b\\u6587\\u4e2d waveformAnalysis \\u7684 gaps \\u4ec5\\u8868\\u793a\\u300c\\u5206\\u6790\\u7528\\u65f6\\u95f4\\u6761\\u4e4b\\u95f4\\u8d85\\u8fc7\\u9608\\u503c\\u7684\\u95f4\\u9699\\u6bb5\\u300d\\u6570\\u91cf\\uff0c\\u4e0d\\u53ef\\u7528 gaps+1 \\u6216\\u968f\\u610f\\u62df\\u9020\\u8bed\\u6bb5\\u603b\\u6570\\u6216\\u5b8c\\u6574\\u65f6\\u95f4\\u8868\\u3002',
    'projectUnitCount = total units in the whole project (authoritative). currentTrack.unitCount = units only on the currently selected audio track; they may differ. When user asks count questions, prioritize projectUnitCount. list_units/search_units cover the whole project. selectedUnitCount = full multi-select cardinality; selectedUnitIds may be capped for prompt size. waveformAnalysis gaps count track gap segments, not unit count.',
    'When sessionMemoryDigest is present, treat it as a lossy summary of earlier chat turns. Detailed acoustics may be omitted from [CONTEXT] under budget pressure — use get_acoustic_summary (and other local query tools) for authoritative metrics.',
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
  tier?: 1 | 2 | 3;
  render: (value: unknown) => string | null;
}

const SHORT_TERM_TEMPLATES: ContextFieldTemplate[] = [
  { key: 'page', tier: 1, render: (v) => `page=${v}` },
  {
    key: 'projectUnitCount',
    tier: 1,
    render: (v) => (typeof v === 'number' && Number.isFinite(v)
      ? `projectUnitCount=${v} [authoritative — total units in project]`
      : null),
  },
  {
    key: 'currentMediaUnitCount',
    tier: 1,
    render: (v) => (typeof v === 'number' && Number.isFinite(v)
      ? `currentTrack.unitCount=${v} [current audio track only, may differ from projectUnitCount]`
      : null),
  },
  {
    key: 'unitIndexComplete',
    tier: 1,
    render: (v) => (v === false
      ? 'unitIndexComplete=false [segment-backed unit index still loading; empty unit lists are not authoritative]'
      : null),
  },
  {
    key: 'worldModelSnapshot',
    tier: 1,
    render: (v) => (typeof v === 'string' && v.length > 0 ? `worldModelSnapshot=\n${v}` : null),
  },
  { key: 'activeUnitId', tier: 1, render: (v) => `activeUnitId=${v}` },
  { key: 'activeSegmentUnitId', tier: 1, render: (v) => `activeSegmentUnitId=${v}` },
  { key: 'selectedUnitKind', tier: 1, render: (v) => `selectedUnitKind=${v}` },
  {
    key: 'selectedUnitCount',
    tier: 1,
    render: (v) => (typeof v === 'number' && Number.isFinite(v)
      ? `selectedUnitCount=${v} [full selection size; selectedUnitIds list may be truncated]`
      : null),
  },
  { key: 'selectedUnitIds', tier: 1, render: (v) => `selectedUnitIds=${(v as string[]).join(',')}` },
  { key: 'selectedUnitStartSec', tier: 1, render: (v) => Number.isFinite(v as number) ? `selectedUnitStartSec=${(v as number).toFixed(2)} [utterance or segment per selectedUnitKind]` : null },
  { key: 'selectedUnitEndSec', tier: 1, render: (v) => Number.isFinite(v as number) ? `selectedUnitEndSec=${(v as number).toFixed(2)} [utterance or segment per selectedUnitKind]` : null },
  { key: 'selectedLayerId', tier: 1, render: (v) => `selectedLayerId=${v}` },
  { key: 'selectedLayerType', tier: 1, render: (v) => `selectedLayerType=${v}` },
  { key: 'selectedTranslationLayerId', tier: 1, render: (v) => `selectedTranslationLayerId=${v}` },
  { key: 'selectedTranscriptionLayerId', tier: 1, render: (v) => `selectedTranscriptionLayerId=${v}` },
  { key: 'selectionTimeRange', tier: 1, render: (v) => `selectionTimeRange=${v}` },
  { key: 'audioTimeSec', tier: 1, render: (v) => Number.isFinite(v as number) ? `audioTimeSec=${(v as number).toFixed(2)}` : null },
  { key: 'selectedText', tier: 1, render: (v) => `selectedText=${v}` },
  { key: 'recentActions', tier: 1, render: (v) => `recentActions=${(v as string[]).join(' | ')}` },
  {
    key: 'sessionMemoryDigest',
    tier: 2,
    render: (v) => (typeof v === 'string' && v.trim().length > 0 ? `sessionMemoryDigest=\n${v.trim()}` : null),
  },
];

const LONG_TERM_TEMPLATES: ContextFieldTemplate[] = [
  {
    key: 'projectStats',
    tier: 2,
    render: (v) => {
      const s = v as { unitCount?: number; utteranceCount?: number; translationLayerCount?: number; aiConfidenceAvg?: number | null };
      return `projectStats(units=${s.unitCount ?? s.utteranceCount ?? 0}, translationLayers=${s.translationLayerCount ?? 0}, aiConfidenceAvg=${typeof s.aiConfidenceAvg === 'number' ? s.aiConfidenceAvg.toFixed(3) : 'n/a'})`;
    },
  },
  {
    key: 'waveformAnalysis',
    tier: 2,
    render: (v) => {
      const summary = v as {
        lowConfidenceCount?: number;
        overlapCount?: number;
        gapCount?: number;
        maxGapSeconds?: number;
        selectionLowConfidenceCount?: number;
        selectionOverlapCount?: number;
        selectionGapCount?: number;
        activeSignals?: string[];
      };
      const segments = [
        `trackLowConfidence=${summary.lowConfidenceCount ?? 0}`,
        `trackOverlaps=${summary.overlapCount ?? 0}`,
        `trackGaps=${summary.gapCount ?? 0}`,
        `trackMaxGapSec=${typeof summary.maxGapSeconds === 'number' ? summary.maxGapSeconds.toFixed(1) : '0.0'}`,
      ];
      if (summary.selectionLowConfidenceCount !== undefined) segments.push(`selectionLowConfidence=${summary.selectionLowConfidenceCount}`);
      if (summary.selectionOverlapCount !== undefined) segments.push(`selectionOverlaps=${summary.selectionOverlapCount}`);
      if (summary.selectionGapCount !== undefined) segments.push(`selectionGaps=${summary.selectionGapCount}`);
      if (summary.activeSignals && summary.activeSignals.length > 0) segments.push(`activeSignals=${summary.activeSignals.join(' | ')}`);
      return `waveformAnalysis(${segments.join(', ')})`;
    },
  },
  {
    key: 'acousticSummary',
    tier: 3,
    render: (v) => {
      const summary = v as {
        selectionStartSec: number;
        selectionEndSec: number;
        f0MinHz?: number | null;
        f0MaxHz?: number | null;
        f0MeanHz?: number | null;
        intensityPeakDb?: number | null;
        reliabilityMean?: number | null;
        spectralCentroidMeanHz?: number | null;
        spectralRolloffMeanHz?: number | null;
        zeroCrossingRateMean?: number | null;
        spectralFlatnessMean?: number | null;
        loudnessMeanDb?: number | null;
        mfccMeanCoefficients?: number[] | null;
        sampleRateHz?: number;
        algorithmVersion?: string;
        analysisWindowSec?: number;
        frameStepSec?: number;
        formantF1MeanHz?: number | null;
        formantF2MeanHz?: number | null;
        vowelSpaceSpread?: number | null;
        voicedFrameCount?: number;
        frameCount?: number;
        hotspots?: Array<{ kind: string; timeSec: number; score: number }>;
      };
      const hotspots = summary.hotspots && summary.hotspots.length > 0
        ? `, hotspots=${summary.hotspots.map((item) => `${item.kind}@${item.timeSec.toFixed(2)}s`).join('|')}`
        : '';
      return `acousticSummary(selectionSec=${summary.selectionStartSec.toFixed(2)}-${summary.selectionEndSec.toFixed(2)}, f0Min=${typeof summary.f0MinHz === 'number' ? Math.round(summary.f0MinHz) : 'n/a'}, f0Max=${typeof summary.f0MaxHz === 'number' ? Math.round(summary.f0MaxHz) : 'n/a'}, f0Mean=${typeof summary.f0MeanHz === 'number' ? Math.round(summary.f0MeanHz) : 'n/a'}, intensityPeak=${typeof summary.intensityPeakDb === 'number' ? `${summary.intensityPeakDb.toFixed(1)}dB` : 'n/a'}, reliability=${typeof summary.reliabilityMean === 'number' ? summary.reliabilityMean.toFixed(2) : 'n/a'}, centroidMean=${typeof summary.spectralCentroidMeanHz === 'number' ? Math.round(summary.spectralCentroidMeanHz) : 'n/a'}, rolloffMean=${typeof summary.spectralRolloffMeanHz === 'number' ? Math.round(summary.spectralRolloffMeanHz) : 'n/a'}, zcrMean=${typeof summary.zeroCrossingRateMean === 'number' ? `${(summary.zeroCrossingRateMean * 100).toFixed(1)}%` : 'n/a'}, flatnessMean=${typeof summary.spectralFlatnessMean === 'number' ? summary.spectralFlatnessMean.toFixed(3) : 'n/a'}, loudnessMean=${typeof summary.loudnessMeanDb === 'number' ? `${summary.loudnessMeanDb.toFixed(1)}dB` : 'n/a'}, mfcc=${Array.isArray(summary.mfccMeanCoefficients) && summary.mfccMeanCoefficients.length > 0 ? summary.mfccMeanCoefficients.slice(0, 3).map((value) => value.toFixed(2)).join('/') : 'n/a'}, formantF1Mean=${typeof summary.formantF1MeanHz === 'number' ? Math.round(summary.formantF1MeanHz) : 'n/a'}, formantF2Mean=${typeof summary.formantF2MeanHz === 'number' ? Math.round(summary.formantF2MeanHz) : 'n/a'}, vowelSpread=${typeof summary.vowelSpaceSpread === 'number' ? Math.round(summary.vowelSpaceSpread) : 'n/a'}, runtime=${summary.algorithmVersion ?? 'unknown'}@${typeof summary.sampleRateHz === 'number' ? `${summary.sampleRateHz}Hz` : 'n/a'}, win=${typeof summary.analysisWindowSec === 'number' ? summary.analysisWindowSec.toFixed(3) : 'n/a'}s, step=${typeof summary.frameStepSec === 'number' ? summary.frameStepSec.toFixed(3) : 'n/a'}s, voicedFrames=${summary.voicedFrameCount ?? 0}/${summary.frameCount ?? 0}${hotspots})`;
    },
  },
  { key: 'observerStage', tier: 2, render: (v) => `observerStage=${v}` },
  { key: 'topLexemes', tier: 2, render: (v) => `topLexemes=${(v as string[]).join(', ')}` },
  { key: 'recommendations', tier: 2, render: (v) => `recommendations=${(v as string[]).join(' | ')}` },
];

// ─── Context block builder (Phase 14 — tiered assembly) ─────────────────────

const CONTEXT_SNAPSHOT_HEADER = '[CONTEXT — real-time snapshot, overrides any prior conversation data]';
const WORLD_SNAPSHOT_PREFIX = 'worldModelSnapshot=\n';

/** Tier-1 keys dropped only if the block still overflows after snapshot compression. */
const TIER1_SHORT_DROP_KEYS_LAST_FIRST = [
  'recentActions',
  'selectedText',
  'selectionTimeRange',
  'audioTimeSec',
  'selectedTranscriptionLayerId',
  'selectedTranslationLayerId',
  'selectedLayerType',
] as const;

interface ContextLineEntry {
  text: string;
  tier: 1 | 2 | 3;
  key: string;
}

function renderContextBlock(shortLines: string[], longLines: string[]): string {
  const blocks: string[] = [CONTEXT_SNAPSHOT_HEADER];
  if (shortLines.length > 0) {
    blocks.push('ShortTerm:');
    blocks.push(...shortLines.map((line) => `- ${line}`));
  }
  if (longLines.length > 0) {
    blocks.push('LongTerm:');
    blocks.push(...longLines.map((line) => `- ${line}`));
  }
  return blocks.join('\n');
}

function contextBlockLength(shortLines: string[], longLines: string[]): number {
  return renderContextBlock(shortLines, longLines).length;
}

function fitWorldModelSnapshotBody(
  shortLines: string[],
  snapshotIndex: number,
  longLines: string[],
  maxChars: number,
): { short: string[]; long: string[] } {
  const line = shortLines[snapshotIndex];
  if (!line?.startsWith(WORLD_SNAPSHOT_PREFIX)) {
    return { short: shortLines, long: longLines };
  }
  const fullBody = line.slice(WORLD_SNAPSHOT_PREFIX.length);
  const working = shortLines.slice();
  let lo = 0;
  let hi = fullBody.length;
  let best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    working[snapshotIndex] = `${WORLD_SNAPSHOT_PREFIX}${trimTextToMax(fullBody, mid)}`;
    if (contextBlockLength(working, longLines) <= maxChars) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  working[snapshotIndex] = `${WORLD_SNAPSHOT_PREFIX}${trimTextToMax(fullBody, best)}`;
  return { short: working, long: longLines };
}

function assembleTieredPromptContext(
  entries: { short: ContextLineEntry[]; long: ContextLineEntry[] },
  maxChars: number,
): string {
  const tier1Short = entries.short.filter((e) => e.tier === 1);
  const tier2Short = entries.short.filter((e) => e.tier === 2);
  const tier3Short = entries.short.filter((e) => e.tier === 3);
  const tier1Long = entries.long.filter((e) => e.tier === 1);
  const tier2Long = entries.long.filter((e) => e.tier === 2);
  const tier3Long = entries.long.filter((e) => e.tier === 3);

  let tier1Pairs = tier1Short.map((e) => ({ key: e.key, text: e.text }));
  const long1 = tier1Long.map((e) => e.text);
  const linesFromPairs = (pairs: Array<{ text: string }>) => pairs.map((p) => p.text);

  let short1 = linesFromPairs(tier1Pairs);
  let snapshotIndex = tier1Pairs.findIndex((p) => p.key === 'worldModelSnapshot');

  if (snapshotIndex >= 0 && contextBlockLength(short1, long1) > maxChars) {
    const fitted = fitWorldModelSnapshotBody(short1, snapshotIndex, long1, maxChars);
    short1 = fitted.short;
    tier1Pairs = tier1Pairs.map((p, i) => (i === snapshotIndex ? { ...p, text: short1[i]! } : p));
  }

  if (contextBlockLength(short1, long1) > maxChars) {
    for (const dropKey of TIER1_SHORT_DROP_KEYS_LAST_FIRST) {
      if (contextBlockLength(short1, long1) <= maxChars) break;
      let dropIdx = -1;
      for (let i = tier1Pairs.length - 1; i >= 0; i -= 1) {
        if (tier1Pairs[i]!.key === dropKey) {
          dropIdx = i;
          break;
        }
      }
      if (dropIdx < 0) continue;
      tier1Pairs.splice(dropIdx, 1);
      short1 = linesFromPairs(tier1Pairs);
    }
  }

  if (contextBlockLength(short1, long1) > maxChars) {
    snapshotIndex = tier1Pairs.findIndex((p) => p.key === 'worldModelSnapshot');
    if (snapshotIndex >= 0) {
      const fitted = fitWorldModelSnapshotBody(short1, snapshotIndex, long1, maxChars);
      short1 = fitted.short;
    }
  }

  if (contextBlockLength(short1, long1) > maxChars) {
    return trimTextToMax(renderContextBlock(short1, long1), maxChars);
  }

  let shortOut = [...short1];
  let longOut = [...long1];

  const appendLine = (line: string, toShort: boolean, allowPartialClip = true): boolean => {
    const nextShort = toShort ? [...shortOut, line] : shortOut;
    const nextLong = toShort ? longOut : [...longOut, line];
    let candidate = renderContextBlock(nextShort, nextLong);
    if (candidate.length <= maxChars) {
      shortOut = nextShort;
      longOut = nextLong;
      return true;
    }
    if (!allowPartialClip) return false;
    const base = renderContextBlock(shortOut, longOut);
    const room = maxChars - base.length - '\n- '.length;
    if (room < 40) return false;
    const clipped = trimTextToMax(line, room);
    const clippedShort = toShort ? [...shortOut, clipped] : shortOut;
    const clippedLong = toShort ? longOut : [...longOut, clipped];
    candidate = renderContextBlock(clippedShort, clippedLong);
    if (candidate.length > maxChars) return false;
    shortOut = clippedShort;
    longOut = clippedLong;
    return true;
  };

  for (const e of tier2Short) {
    appendLine(e.text, true);
  }
  for (const e of tier2Long) {
    appendLine(e.text, false);
  }

  let tier3Omitted = false;
  for (const e of tier3Short) {
    if (!appendLine(e.text, true, false)) tier3Omitted = true;
  }
  for (const e of tier3Long) {
    if (!appendLine(e.text, false, false)) tier3Omitted = true;
  }

  if (tier3Omitted) {
    appendLine(
      'contextNote=Detailed acoustic line may be omitted when the budget is tight; use get_acoustic_summary for full metrics.',
      false,
    );
  }

  return renderContextBlock(shortOut, longOut);
}

export function buildPromptContextBlock(
  context: AiPromptContext | null | undefined,
  maxChars: number,
): string {
  if (!context) return '';

  const shortEntries: ContextLineEntry[] = [];
  const longEntries: ContextLineEntry[] = [];
  const short = context.shortTerm;
  const long = context.longTerm;

  for (const tmpl of SHORT_TERM_TEMPLATES) {
    if (short === undefined) break;
    const val = (short as Record<string, unknown>)[tmpl.key];
    if (val !== undefined) {
      const rendered = tmpl.render(val);
      if (rendered !== null) {
        shortEntries.push({ text: rendered, tier: tmpl.tier ?? 2, key: tmpl.key });
      }
    }
  }

  for (const tmpl of LONG_TERM_TEMPLATES) {
    if (long === undefined) break;
    const val = (long as Record<string, unknown>)[tmpl.key];
    if (val !== undefined) {
      const rendered = tmpl.render(val);
      if (rendered !== null) {
        longEntries.push({ text: rendered, tier: tmpl.tier ?? 2, key: tmpl.key });
      }
    }
  }

  if (shortEntries.length === 0 && longEntries.length === 0) return '';

  return assembleTieredPromptContext({ short: shortEntries, long: longEntries }, maxChars);
}

export function buildAiSystemPrompt(
  personaKey: AiSystemPersonaKey,
  contextBlock: string,
  style: AiToolFeedbackStyle = 'detailed',
): string {
  const base = `${AI_FUNCTION_CALLING_SYSTEM_PROMPT}\n${AI_SYSTEM_PERSONAS[personaKey]}\n${AI_RESPONSE_STYLE_PROMPT[style]}\n${buildLocalContextToolGuide()}`;
  return contextBlock.trim().length > 0 ? `${base}\n${contextBlock}` : base;
}

export function isAiContextDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const byStorage = window.localStorage.getItem('jieyu.aiChat.debugContext') === '1';
  const byGlobal = (window as unknown as { __JIEYU_AI_DEBUG_CONTEXT__?: boolean }).__JIEYU_AI_DEBUG_CONTEXT__ === true;
  return byStorage || byGlobal;
}
