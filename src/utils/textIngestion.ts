/**
 * 统一文本摄取：BOM 检测 → XML 声明 → 严格 UTF-8 → 候选回退 → 用户提示
 * Unified text ingestion: BOM → XML declaration → strict UTF-8 → candidate fallback → user prompt
 */

// ── Types | 类型 ────────────────────────────────────────────

export interface TextIngestionResult {
  /** 解码后的文本 | Decoded text */
  text: string;
  /** 检测到的编码名称 | Detected encoding name */
  detectedEncoding: string;
  /** 置信度 | Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

// ── Constants | 常量 ─────────────────────────────────────────

/** 候选编码回退列表（按区域使用频率排序）| Fallback encoding candidates */
const FALLBACK_ENCODINGS = ['gbk', 'big5', 'shift_jis', 'euc-kr', 'iso-8859-1'] as const;

// ── BOM detection | BOM 检测 ─────────────────────────────────

interface BomResult {
  encoding: string;
  offset: number;
}

/**
 * 检测字节序标记 | Detect Byte Order Mark
 */
function detectBom(bytes: Uint8Array): BomResult | null {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { encoding: 'utf-8', offset: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { encoding: 'utf-16be', offset: 2 };
  }
  return null;
}

// ── XML encoding declaration | XML encoding 声明解析 ─────────

/**
 * 从文件头部提取 XML encoding 声明 | Extract XML encoding from declaration
 * 仅检查前 512 字节（覆盖 99%+ 的合法 XML 声明）| Only checks first 512 bytes
 */
function detectXmlEncoding(bytes: Uint8Array): string | null {
  // 先用 ASCII 安全的方式读取前 512 字节 | Read first 512 bytes as ASCII-safe text
  const head = new TextDecoder('ascii', { fatal: false }).decode(bytes.slice(0, Math.min(512, bytes.length)));
  const match = head.match(/<\?xml[^?]*\bencoding\s*=\s*["']([^"']+)["']/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

// ── Core decode logic | 核心解码逻辑 ─────────────────────────

/**
 * 尝试用指定编码解码，如果是 fatal 模式失败则返回 null
 * Try decoding with given encoding; return null on fatal failure
 */
function tryDecode(bytes: Uint8Array, encoding: string, fatal: boolean): string | null {
  try {
    // TextDecoder 构造时如果不认识 encoding 会抛错 | Throws on unknown encoding
    const decoder = new TextDecoder(encoding, { fatal });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 检查文本中是否包含 U+FFFD 替换字符 | Check for replacement characters
 */
function containsReplacementChar(text: string): boolean {
  return text.includes('\uFFFD');
}

// ── Public API ───────────────────────────────────────────────

/**
 * 统一文本文件摄取 | Unified text file ingestion
 *
 * 检测优先级 | Detection priority:
 * 1. forceEncoding → 直接使用 | Use directly
 * 2. BOM 嗅探 | BOM sniffing
 * 3. XML 声明 `<?xml encoding="...">` (仅 xmlMode) | XML declaration (xmlMode only)
 * 4. 严格 UTF-8 解码 | Strict UTF-8
 * 5. 候选回退 (GBK/Big5/Shift_JIS/EUC-KR/ISO-8859-1) | Candidate fallback
 * 6. 兜底 UTF-8 replacement 模式 | Last-resort UTF-8 with replacement
 */
export async function ingestTextFile(
  input: File | Uint8Array,
  options?: {
    /** 强制编码（跳过检测）| Force encoding (skip detection) */
    forceEncoding?: string;
    /** XML 模式：优先解析 <?xml encoding="..."> | XML mode: prioritize XML declaration */
    xmlMode?: boolean;
  },
): Promise<TextIngestionResult> {
  // 将 File 转为 Uint8Array | Convert File to Uint8Array
  const bytes = input instanceof Uint8Array
    ? input
    : new Uint8Array(await input.arrayBuffer());

  // 1. 强制编码 | Forced encoding
  if (options?.forceEncoding) {
    const text = tryDecode(bytes, options.forceEncoding, false);
    if (text !== null) {
      return {
        text,
        detectedEncoding: options.forceEncoding,
        confidence: 'high',
      };
    }
  }

  // 2. BOM 检测 | BOM detection
  const bom = detectBom(bytes);
  if (bom) {
    const sliced = bytes.slice(bom.offset);
    const text = tryDecode(sliced, bom.encoding, false);
    if (text !== null) {
      return { text, detectedEncoding: bom.encoding, confidence: 'high' };
    }
  }

  // 3. XML 声明 (仅 xmlMode) | XML declaration (xmlMode only)
  if (options?.xmlMode) {
    const xmlEnc = detectXmlEncoding(bytes);
    if (xmlEnc && xmlEnc !== 'utf-8') {
      const text = tryDecode(bytes, xmlEnc, false);
      if (text !== null && !containsReplacementChar(text)) {
        return { text, detectedEncoding: xmlEnc, confidence: 'high' };
      }
    }
  }

  // 4. 严格 UTF-8 | Strict UTF-8
  const utf8Strict = tryDecode(bytes, 'utf-8', true);
  if (utf8Strict !== null) {
    return { text: utf8Strict, detectedEncoding: 'utf-8', confidence: 'high' };
  }

  // 5. 候选回退 | Candidate fallback
  for (const encoding of FALLBACK_ENCODINGS) {
    const text = tryDecode(bytes, encoding, false);
    if (text !== null && !containsReplacementChar(text)) {
      return { text, detectedEncoding: encoding, confidence: 'medium' };
    }
  }

  // 6. 兜底：UTF-8 replacement 模式 | Last-resort: UTF-8 with replacement
  const fallback = tryDecode(bytes, 'utf-8', false) ?? '';
  return { text: fallback, detectedEncoding: 'utf-8', confidence: 'low' };
}
