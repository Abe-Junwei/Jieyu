/**
 * Electron 主进程没有浏览器 DOMParser；导入 EAF/FlexText/LIFT 前补上 (#427)。
 * Main process has no browser DOMParser; install one before XML import (#427).
 *
 * linkedom 只在缺少 DOMParser 时动态加载，避免浏览器 Vite 打包拉进 cssom (#427 build)。
 * Load linkedom only when DOMParser is missing so the browser Vite build does not pull cssom.
 */
export function ensureDomParser(): void {
  if (typeof globalThis.DOMParser !== 'undefined') return;
  try {
    // Keep the module id out of the static import graph (Node/Electron main only).
    const { DOMParser: LinkedomDOMParser } = eval('require')('linkedom') as {
      DOMParser: typeof DOMParser;
    };
    globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
  } catch (error) {
    throw new Error(
      `DOMParser is unavailable and linkedom could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
