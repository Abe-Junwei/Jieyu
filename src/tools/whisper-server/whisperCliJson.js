/**
 * whisperCliJson — whisper-cli 参数构建与 JSON 输出解析（纯函数，便于测试）
 * whisper-cli argument building and JSON output parsing (pure functions, unit-tested).
 *
 * 依据 whisper.cpp examples/cli/cli.cpp（v1.9.5）的 output_json：
 * Based on whisper.cpp examples/cli/cli.cpp output_json (v1.9.5):
 *   -ojf / --output-json-full  → 写 `<-of>.json`，并开启 token 级时间戳（wparams.token_timestamps）
 *                                writes `<-of>.json` and enables token timestamps
 *   {
 *     "result": { "language": "<detected>" },
 *     "transcription": [{
 *       "offsets": { "from": <ms>, "to": <ms> }, "text": "...",
 *       "tokens": [{ "text": "...", "offsets"?: { "from": <ms>, "to": <ms> }, "id": n, "p": 0..1, "t_dtw": n }]
 *     }]
 *   }
 * 特殊 token（"[_BEG_]"、"[_TT_…]" 等）以 "[_" 开头，会被过滤。
 * Special tokens ("[_BEG_]", "[_TT_…]", …) start with "[_" and are filtered out.
 */

const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u{20000}-\u{2fa1f}]/u;

/**
 * @param {{ model: string, language: string, audioPath: string, outputBase: string, threads: number }} options
 * @returns {string[]}
 */
export function buildWhisperCliArgs({ model, language, audioPath, outputBase, threads }) {
  return [
    '-m', model,
    // 只传一次语言参数（'auto' 由 whisper.cpp 自动检测）| Language passed once ('auto' = auto-detect)
    '-l', language || 'auto',
    '-f', audioPath,
    '-ojf',            // JSON 输出 + token 级时间戳 | JSON output with token-level timestamps
    '-of', outputBase, // 写入 `${outputBase}.json` | written to `${outputBase}.json`
    '-np',             // 不打印进度/计时 | no progress / timing prints
    '-t', String(threads),
  ];
}

/**
 * whisper-cli 只转义引号和反斜杠；若字符串里混入原始控制字符，标准 JSON.parse 会失败。
 * whisper-cli only escapes quotes and backslashes; raw control characters inside strings would
 * break JSON.parse, so retry once with them escaped.
 * @param {string} raw
 */
export function parseWhisperCliJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (inString) {
        if (escaped) { escaped = false; out += ch; continue; }
        if (ch === '\\') { escaped = true; out += ch; continue; }
        if (ch === '"') { inString = false; out += ch; continue; }
        const code = ch.codePointAt(0) ?? 0;
        out += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : ch;
      } else {
        if (ch === '"') inString = true;
        out += ch;
      }
    }
    return JSON.parse(out);
  }
}

function isSpecialToken(text) {
  return typeof text !== 'string' || text.startsWith('[_');
}

function msToSec(ms) {
  return Math.round(ms) / 1000;
}

/**
 * 把 token 合并成词：前导空白开始新词；CJK 字符各自成词；标点并入前一个词。
 * Merge tokens into words: leading whitespace starts a new word; CJK tokens are their own words;
 * punctuation attaches to the previous word.
 */
function tokensToWords(tokens) {
  const words = [];
  let current = null;
  for (const token of tokens) {
    if (isSpecialToken(token.text) || !token.offsets) continue;
    const text = token.text;
    const trimmed = text.trim();
    if (!trimmed) continue;
    const startsNewWord =
      current === null
      || /^\s/.test(text)
      || CJK_PATTERN.test(trimmed[0] ?? '')
      || CJK_PATTERN.test(current.word.slice(-1));
    const isPunctuationOnly = /^[\p{P}\p{S}]+$/u.test(trimmed);
    if (startsNewWord && !(isPunctuationOnly && current !== null)) {
      current = { word: trimmed, start: msToSec(token.offsets.from), end: msToSec(token.offsets.to), probs: [token.p] };
      words.push(current);
    } else if (current) {
      current.word += trimmed;
      current.end = msToSec(token.offsets.to);
      current.probs.push(token.p);
    }
  }
  return words.map(({ probs, ...word }) => ({
    ...word,
    probability: Number((probs.reduce((a, b) => a + b, 0) / probs.length).toFixed(4)),
  }));
}

function averageLogprob(tokens) {
  const probs = tokens
    .filter((token) => !isSpecialToken(token.text) && typeof token.p === 'number' && token.p > 0)
    .map((token) => Math.log(token.p));
  if (probs.length === 0) return 0;
  return Number((probs.reduce((a, b) => a + b, 0) / probs.length).toFixed(4));
}

/**
 * 把 whisper-cli 的 JSON 转为 OpenAI verbose_json 风格响应（时间单位：秒）。
 * 保留 text + language 以兼容旧客户端。
 * Convert whisper-cli JSON into an OpenAI verbose_json-style response (times in seconds),
 * keeping `text` + `language` for backward compatibility.
 *
 * @param {any} cliJson
 * @param {string} requestedLanguage
 */
export function buildTranscriptionResponse(cliJson, requestedLanguage) {
  const transcription = Array.isArray(cliJson?.transcription) ? cliJson.transcription : [];
  const segments = transcription.map((segment, index) => {
    const tokens = Array.isArray(segment.tokens) ? segment.tokens : [];
    return {
      id: index,
      start: msToSec(segment.offsets?.from ?? 0),
      end: msToSec(segment.offsets?.to ?? 0),
      text: String(segment.text ?? '').trim(),
      avg_logprob: averageLogprob(tokens),
      words: tokensToWords(tokens),
    };
  });
  const detected = typeof cliJson?.result?.language === 'string' ? cliJson.result.language : null;
  const language = detected ?? (requestedLanguage && requestedLanguage !== 'auto' ? requestedLanguage : null);
  const lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
  return {
    text: transcription.map((segment) => String(segment.text ?? '')).join('').trim(),
    language,
    duration: lastEnd,
    segments,
    words: segments.flatMap((segment) => segment.words),
  };
}
