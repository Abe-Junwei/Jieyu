/**
 * Electron 主进程没有浏览器 DOMParser；导入 EAF/FlexText/LIFT 前补上 (#427)。
 * Main process has no browser DOMParser; install one before XML import (#427).
 *
 * linkedom 只在缺少 DOMParser 时动态加载，避免浏览器 Vite 打包拉进 cssom (#427 build)。
 * Load linkedom only when DOMParser is missing so the browser Vite build does not pull cssom.
 *
 * Electron/Node ESM 没有裸 require；用 process.getBuiltinModule('module').createRequire (#452)。
 * Electron/Node ESM has no bare require; use process.getBuiltinModule('module').createRequire (#452).
 */
export function ensureDomParser(): void {
  if (typeof globalThis.DOMParser !== 'undefined') return;
  try {
    const { DOMParser: LinkedomDOMParser } = loadLinkedom();
    globalThis.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
  } catch (error) {
    throw new Error(
      `DOMParser is unavailable and linkedom could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function loadLinkedom(): { DOMParser: typeof DOMParser } {
  // Keep linkedom out of the static import graph (browser Vite must not pull cssom).
  const nodeModule = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => {
        createRequire: (filename: string | URL) => NodeRequire;
      };
    }
  ).getBuiltinModule?.('module');
  if (nodeModule?.createRequire === undefined) {
    throw new ReferenceError('require is not defined');
  }
  return nodeModule.createRequire(import.meta.url)('linkedom') as {
    DOMParser: typeof DOMParser;
  };
}
