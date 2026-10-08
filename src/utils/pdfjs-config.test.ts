/**
 * JY-14：pdf.js 文档参数固定 isEvalSupported:false，且依赖版本不在 GHSA-hq66-cqwq-w95j 范围内。
 * JY-14: pdf.js document params pin isEvalSupported:false and the dependency is outside the
 * GHSA-hq66-cqwq-w95j range.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPdfJsDocumentParams, type PdfJsDocumentParams } from './pdfjs-config';

function versionTuple(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10));
}

function atLeast(version: string, minimum: string): boolean {
  const [a, b] = [versionTuple(version), versionTuple(minimum)];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

describe('JY-14: pdf.js hardening', () => {
  it('pins isEvalSupported:false even if a caller tries to enable it', () => {
    const params = buildPdfJsDocumentParams({
      url: '/x.pdf',
      isEvalSupported: true,
    } as PdfJsDocumentParams);
    expect(params.isEvalSupported).toBe(false);
    expect(params.url).toBe('/x.pdf');
  });

  it('declares and installs pdfjs-dist ≥ 6.2.108 (GHSA-hq66-cqwq-w95j fixed)', () => {
    const root = process.cwd();
    const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const installed = JSON.parse(
      readFileSync(join(root, 'node_modules/pdfjs-dist/package.json'), 'utf8'),
    ) as { version: string };
    expect(atLeast(declared.dependencies['pdfjs-dist']!.replace(/^[^\d]*/, ''), '6.2.108')).toBe(
      true,
    );
    expect(atLeast(installed.version, '6.2.108')).toBe(true);
  });
});
