/**
 * XML 导出共用的转义与非法字符处理（JY-08）。
 * Shared escaping and illegal-character handling for XML exports (JY-08).
 *
 * XML 1.0 只允许 #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]。
 * 文本里出现别的码位（Word 粘贴来的 U+000B 软换行、U+0001 等控制字符、孤立代理项、U+FFFE/FFFF），
 * 导出的文件 ELAN、FLEx 和 Jieyu 自己都打不开。
 * XML 1.0 only allows the code points above; any other one (U+000B soft line breaks pasted from
 * Word, U+0001-style controls, lone surrogates, U+FFFE/FFFF) makes the exported file unreadable for
 * ELAN, FLEx and Jieyu itself.
 *
 * 处理方式 | Policy:
 * - U+000B 是软换行，语义上就是换行：改成 `\n`。在属性值里，XML 解析器会把 `\n` 规范成空格，
 *   正好符合名称、编号这类单行字段的语义。
 *   U+000B is a soft line break, i.e. a line break: it becomes `\n`. Inside attribute values the
 *   XML parser normalizes `\n` to a space, which is what single-line fields (names, ids) need.
 * - 其他非法码位删除，并计数，由调用方告诉用户。
 *   Other illegal code points are removed and counted so the caller can tell the user.
 * - IPA、声调字母、组合附加符、增补平面、RTL / ZWJ 等都是合法字符，逐码位保留。
 *   IPA, tone letters, combining marks, astral characters, RTL / ZWJ are legal and kept as is.
 */

export type XmlSanitizeReport = {
  /** U+000B 改成换行的个数 | U+000B soft breaks turned into newlines */
  lineBreaks: number;
  /** 删除的非法码位个数 | Illegal code points removed */
  removed: number;
};

const SOFT_LINE_BREAK = '\u000B';
// u 标志下孤立代理项按单个码位匹配 | With the u flag a lone surrogate matches as one code point
const XML_ILLEGAL_CHAR_RE = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 整篇导出文本统一处理一次 | Sanitize a whole exported document once */
export function sanitizeXmlDocument(xml: string): { xml: string; report: XmlSanitizeReport } {
  let lineBreaks = 0;
  let removed = 0;
  const out = xml.replace(XML_ILLEGAL_CHAR_RE, (char) => {
    if (char === SOFT_LINE_BREAK) {
      lineBreaks += 1;
      return '\n';
    }
    removed += 1;
    return '';
  });
  return { xml: out, report: { lineBreaks, removed } };
}

/** 处理并在有改动时回调 | Sanitize and call back only when something changed */
export function finalizeXmlExport(
  xml: string,
  onXmlSanitized: ((report: XmlSanitizeReport) => void) | undefined,
): string {
  const result = sanitizeXmlDocument(xml);
  if (result.report.lineBreaks > 0 || result.report.removed > 0) {
    onXmlSanitized?.(result.report);
  }
  return result.xml;
}

export function mergeXmlSanitizeReports(reports: readonly XmlSanitizeReport[]): XmlSanitizeReport {
  return reports.reduce(
    (sum, report) => ({
      lineBreaks: sum.lineBreaks + report.lineBreaks,
      removed: sum.removed + report.removed,
    }),
    { lineBreaks: 0, removed: 0 },
  );
}

export type XmlSanitizeTranslate = (key: string, params: Record<string, number>) => string;

/** 给用户看的提示（没有改动时为空串）| User-facing notice (empty when nothing changed) */
export function formatXmlSanitizeNotice(
  report: XmlSanitizeReport | null,
  translate: XmlSanitizeTranslate,
): string {
  if (!report) return '';
  const parts: string[] = [];
  if (report.lineBreaks > 0) {
    parts.push(
      translate('transcription.importExport.exportDone.xmlSoftLineBreaks', {
        count: report.lineBreaks,
      }),
    );
  }
  if (report.removed > 0) {
    parts.push(
      translate('transcription.importExport.exportDone.xmlIllegalCharsRemoved', {
        count: report.removed,
      }),
    );
  }
  return parts.join(' ');
}
