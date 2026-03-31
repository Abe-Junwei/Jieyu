import { describe, it, expect } from 'vitest';
import { ingestTextFile } from './textIngestion';

// ── helpers ──────────────────────────────────────────────────

/** 将字符串编码为 UTF-8 Uint8Array | Encode string to UTF-8 bytes */
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** 拼接多个 Uint8Array | Concatenate Uint8Array chunks */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// ── BOM 检测 | BOM detection ─────────────────────────────────

describe('textIngestion: BOM detection', () => {
  it('UTF-8 BOM', async () => {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const r = await ingestTextFile(concat(bom, utf8('hello')));
    expect(r.detectedEncoding).toBe('utf-8');
    expect(r.text).toBe('hello');
    expect(r.confidence).toBe('high');
  });

  it('UTF-16 LE BOM', async () => {
    const bom = new Uint8Array([0xFF, 0xFE]);
    // "AB" in UTF-16 LE
    const body = new Uint8Array([0x41, 0x00, 0x42, 0x00]);
    const r = await ingestTextFile(concat(bom, body));
    expect(r.detectedEncoding).toBe('utf-16le');
    expect(r.text).toBe('AB');
    expect(r.confidence).toBe('high');
  });

  it('UTF-16 BE BOM', async () => {
    const bom = new Uint8Array([0xFE, 0xFF]);
    // "AB" in UTF-16 BE
    const body = new Uint8Array([0x00, 0x41, 0x00, 0x42]);
    const r = await ingestTextFile(concat(bom, body));
    expect(r.detectedEncoding).toBe('utf-16be');
    expect(r.text).toBe('AB');
    expect(r.confidence).toBe('high');
  });
});

// ── XML encoding 声明 | XML declaration ──────────────────────

describe('textIngestion: XML declaration', () => {
  it('解析 GBK encoding 声明 | Parse GBK encoding declaration', async () => {
    // "测试" in GBK = 0xB2, 0xE2, 0xCA, 0xD4
    const xmlDecl = '<?xml version="1.0" encoding="GBK"?>\n';
    const encoder = new TextEncoder();
    const declBytes = encoder.encode(xmlDecl);
    const gbkBody = new Uint8Array([0xB2, 0xE2, 0xCA, 0xD4]);
    const bytes = concat(declBytes, gbkBody);

    const r = await ingestTextFile(bytes, { xmlMode: true });
    expect(r.detectedEncoding).toBe('gbk');
    expect(r.confidence).toBe('high');
    expect(r.text).toContain('测试');
  });

  it('不在非 xmlMode 下解析 XML 声明 | Skip XML declaration without xmlMode', async () => {
    // GBK encoded text with XML declaration — without xmlMode should NOT detect GBK via XML
    const xmlDecl = '<?xml version="1.0" encoding="GBK"?>\n';
    const declBytes = new TextEncoder().encode(xmlDecl);
    const gbkBody = new Uint8Array([0xB2, 0xE2, 0xCA, 0xD4]);
    const bytes = concat(declBytes, gbkBody);

    const r = await ingestTextFile(bytes);
    // 无 xmlMode，不应解析 XML 声明，而是走 fallback 路径
    // Without xmlMode, GBK falls through to candidate fallback
    expect(r.detectedEncoding).not.toBe('utf-8');
  });
});

// ── 纯 UTF-8 | Pure UTF-8 ───────────────────────────────────

describe('textIngestion: UTF-8', () => {
  it('合法 UTF-8 无 BOM | Valid UTF-8 without BOM', async () => {
    const r = await ingestTextFile(utf8('你好世界'));
    expect(r.text).toBe('你好世界');
    expect(r.detectedEncoding).toBe('utf-8');
    expect(r.confidence).toBe('high');
  });

  it('空文件 | Empty file', async () => {
    const r = await ingestTextFile(new Uint8Array(0));
    expect(r.text).toBe('');
    expect(r.detectedEncoding).toBe('utf-8');
    expect(r.confidence).toBe('high');
  });
});

// ── 候选回退 | Candidate fallback ────────────────────────────

describe('textIngestion: candidate fallback', () => {
  it('GBK 回退 | GBK fallback', async () => {
    // "中文" in GBK = 0xD6, 0xD0, 0xCE, 0xC4
    const gbk = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]);
    const r = await ingestTextFile(gbk);
    expect(r.text).toBe('中文');
    expect(r.detectedEncoding).toBe('gbk');
    expect(r.confidence).toBe('medium');
  });
});

// ── 强制编码 | Force encoding ────────────────────────────────

describe('textIngestion: forceEncoding', () => {
  it('强制 GBK 编码 | Force GBK encoding', async () => {
    const gbk = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]);
    const r = await ingestTextFile(gbk, { forceEncoding: 'gbk' });
    expect(r.text).toBe('中文');
    expect(r.detectedEncoding).toBe('gbk');
    expect(r.confidence).toBe('high');
  });
});

// ── File input | File 输入 ───────────────────────────────────

describe('textIngestion: File input', () => {
  it('接受 File 对象 | Accept File object', async () => {
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const file = new File([blob], 'test.txt');
    const r = await ingestTextFile(file);
    expect(r.text).toBe('hello world');
    expect(r.detectedEncoding).toBe('utf-8');
  });
});
