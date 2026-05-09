/**
 * D-4：与 `npm test` / CI 全量门禁互补；staged 变更时做轻量检查。 | Complements `npm test` and CI gates with staged-only checks.
 * — CSS：对暂存文件跑 stylelint --fix | Run stylelint --fix for staged CSS files.
 * — TS/TSX：先对暂存文件做 ESLint 严格检查，再跑全项目 typecheck | Run strict staged ESLint first, then full typecheck.
 */
export default {
  'src/styles/**/*.css': (filenames) =>
    filenames.length
      ? [
          `stylelint --fix ${filenames.map((f) => JSON.stringify(f)).join(' ')}`,
          `prettier --write ${filenames.map((f) => JSON.stringify(f)).join(' ')}`,
        ]
      : [],
  'src/**/*.{ts,tsx}': (filenames) =>
    filenames.length > 0
      ? [
          `prettier --write ${filenames.map((f) => JSON.stringify(f)).join(' ')}`,
          `eslint --max-warnings=0 --no-warn-ignored ${filenames.map((f) => JSON.stringify(f)).join(' ')}`,
          'npm run typecheck',
        ]
      : [],
};
