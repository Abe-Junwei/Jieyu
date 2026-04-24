/**
 * D-4：与 `npm test` / CI 全量门禁互补；staged 变更时做轻量检查。
 * — CSS：对暂存文件跑 stylelint --fix
 * — TS/TSX：全项目 typecheck（与 CI `quality` 一致，避免为单文件拼 tsc 参数）
 */
export default {
  'src/styles/**/*.css': (filenames) => (filenames.length ? `stylelint --fix ${filenames.map((f) => JSON.stringify(f)).join(' ')}` : []),
  'src/**/*.{ts,tsx}': (filenames) => (filenames.length > 0 ? 'npm run typecheck' : []),
};
