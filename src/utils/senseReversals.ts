import type { SenseReversal, SenseReversalNode } from '../types/jieyuDbDocTypes';

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeReversalNode(value: unknown): SenseReversalNode | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as { text?: unknown; main?: unknown };
  const text = readText(record.text);
  const main = normalizeReversalNode(record.main);
  if (text.length === 0) return main;
  return main ? { text, main } : { text };
}

/** Drop blank writing systems and blank heads. A blank owner is skipped and its child kept. */
export function normalizeSenseReversals(value: unknown): SenseReversal[] {
  if (!Array.isArray(value)) return [];
  const reversals: SenseReversal[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as { lang?: unknown; text?: unknown; main?: unknown };
    const lang = readText(record.lang);
    const text = readText(record.text);
    if (lang.length === 0 || text.length === 0) continue;
    const main = normalizeReversalNode(record.main);
    reversals.push(main ? { lang, text, main } : { lang, text });
  }
  return reversals;
}

export function formatSenseReversal(reversal: SenseReversal): string {
  const parts = [reversal.text.trim()];
  let node = reversal.main;
  while (node) {
    const text = node.text.trim();
    if (text.length > 0) parts.push(text);
    node = node.main;
  }
  return `${reversal.lang.trim()}: ${parts.join(' › ')}`;
}

export function reversalDraftsWithAdded(reversals: SenseReversal[]): SenseReversal[] {
  return [...reversals, { lang: '', text: '' }];
}

export function reversalDraftsWithout(reversals: SenseReversal[], index: number): SenseReversal[] {
  return reversals.filter((_, rowIndex) => rowIndex !== index);
}

export function reversalDraftsWithField(
  reversals: SenseReversal[],
  index: number,
  field: 'lang' | 'text',
  value: string,
): SenseReversal[] {
  return reversals.map((reversal, rowIndex) =>
    rowIndex === index ? { ...reversal, [field]: value } : reversal,
  );
}

function appendEmptyMain(node: SenseReversalNode | undefined): SenseReversalNode {
  if (!node) return { text: '' };
  return { ...node, main: appendEmptyMain(node.main) };
}

export function reversalDraftsWithAddedMain(
  reversals: SenseReversal[],
  index: number,
): SenseReversal[] {
  return reversals.map((reversal, rowIndex) =>
    rowIndex === index ? { ...reversal, main: appendEmptyMain(reversal.main) } : reversal,
  );
}

function withoutMainKey(node: SenseReversalNode): SenseReversalNode {
  const { main: _main, ...rest } = node;
  return rest;
}

function withMainText(
  node: SenseReversalNode | undefined,
  depth: number,
  value: string,
): SenseReversalNode | undefined {
  if (!node) return undefined;
  if (depth === 0) return { ...node, text: value };
  const main = withMainText(node.main, depth - 1, value);
  return main ? { ...node, main } : withoutMainKey(node);
}

export function reversalDraftsWithMainText(
  reversals: SenseReversal[],
  index: number,
  depth: number,
  value: string,
): SenseReversal[] {
  return reversals.map((reversal, rowIndex) => {
    if (rowIndex !== index) return reversal;
    const main = withMainText(reversal.main, depth, value);
    if (!main) {
      const { main: _main, ...rest } = reversal;
      return rest;
    }
    return { ...reversal, main };
  });
}

function withoutMainAt(
  node: SenseReversalNode | undefined,
  depth: number,
): SenseReversalNode | undefined {
  if (!node) return undefined;
  if (depth === 0) return node.main;
  const main = withoutMainAt(node.main, depth - 1);
  return main ? { ...node, main } : withoutMainKey(node);
}

export function reversalDraftsWithoutMain(
  reversals: SenseReversal[],
  index: number,
  depth: number,
): SenseReversal[] {
  return reversals.map((reversal, rowIndex) => {
    if (rowIndex !== index) return reversal;
    const main = withoutMainAt(reversal.main, depth);
    if (!main) {
      const { main: _main, ...rest } = reversal;
      return rest;
    }
    return { ...reversal, main };
  });
}
