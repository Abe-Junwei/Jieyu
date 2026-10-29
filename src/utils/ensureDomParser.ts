/**
 * Electron 主进程没有浏览器 DOMParser；导入 EAF/FlexText/LIFT 前补上 (#427)。
 * Main process has no browser DOMParser; install one before XML import (#427).
 */
import { DOMParser as LinkedomDOMParser } from 'linkedom';

export function ensureDomParser(): void {
  if (typeof globalThis.DOMParser !== 'undefined') return;
  globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
}
