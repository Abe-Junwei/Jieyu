# Code scale baselines

Wave / milestone checkpoints for `src/**/*.ts(x)` size and flat-directory counts.

## Commands

- **Stdout only (CI / ad-hoc):** `npm run report:code-scale`
- **Archive under this folder:** `npm run report:code-scale:archive`
  - Creates `baseline-<ISO8601>.json` and overwrites `latest.json`.

`latest.json` and `baseline-*.json` are gitignored; keep this README for the contract.
