import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { evaluateUiDraftGate, isUiDraftTriggerPath } from './check-ui-design-draft.mjs';

const COMPLETE = `
- [x] **UI1** Pixso 画板：01 转写 · 样态 · standard
- [x] **UI2** DESIGN.md §7
- [x] **UI3** npm run test:e2e:desktop-project
`;

describe('isUiDraftTriggerPath', () => {
  it('matches desktop pages and styles, and only new shared components', () => {
    expect(isUiDraftTriggerPath('src/pages/DesktopProjectReadPage.tsx', 'M')).toBe(true);
    expect(isUiDraftTriggerPath('src/pages/DesktopProjectReadPage.test.tsx', 'M')).toBe(false);
    expect(isUiDraftTriggerPath('src/styles/pages/desktop-project-read.css', 'M')).toBe(true);
    expect(isUiDraftTriggerPath('src/components/WaveformToolbar.tsx', 'M')).toBe(false);
    expect(isUiDraftTriggerPath('src/components/WaveformToolbar.tsx', 'A')).toBe(true);
    expect(isUiDraftTriggerPath('src/pages/TranscriptionPage.tsx', 'M')).toBe(false);
  });
});

describe('evaluateUiDraftGate', () => {
  it('skips when no desktop UI path changed', () => {
    const result = evaluateUiDraftGate({
      files: [{ path: 'src/db/desktop/units.ts', status: 'M' }],
      body: '',
      enforce: true,
    });
    expect(result.verdict).toBe('skip');
  });

  it('fails a pull request that changes a desktop page without the checklist', () => {
    const result = evaluateUiDraftGate({
      files: [{ path: 'src/pages/DesktopProjectReadPage.tsx', status: 'M' }],
      body: '## Summary\n- times',
      eventName: 'pull_request',
      enforce: true,
    });
    expect(result.verdict).toBe('fail');
  });

  it('passes when each item is ticked or marked N/A', () => {
    const result = evaluateUiDraftGate({
      files: [{ path: 'src/styles/pages/desktop-transcription-workspace.css', status: 'M' }],
      body: COMPLETE.replace('**UI2** DESIGN.md §7', '**UI2** N/A：只改一行间距'),
      enforce: true,
    });
    expect(result.verdict).toBe('pass');
  });
});
