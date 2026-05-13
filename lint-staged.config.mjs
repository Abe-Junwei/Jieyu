/**
 * D-4：与 `npm test` / CI 全量门禁互补；staged 变更时做轻量检查。 | Complements `npm test` and CI gates with staged-only checks.
 * — CSS：对暂存文件跑 stylelint --fix | Run stylelint --fix for staged CSS files.
 * — TS/TSX：先对暂存文件做 ESLint 严格检查，再跑全项目 typecheck | Run strict staged ESLint first, then full typecheck.
 * — src/pages 或 src/db：提示更新 docs/architecture 现状清单（staleness 风险）。
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
  '{src/pages,src/db}/**/*.{ts,tsx}': (filenames) =>
    filenames.length > 0
      ? [
          // Soft reminder: page/db changes often invalidate docs/architecture
          // current-state docs. The staleness guard reports any in-scope doc
          // older than 90d (WARN) / 180d (FAIL).
          'node scripts/check-current-state-freshness.mjs',
        ]
      : [],
};
