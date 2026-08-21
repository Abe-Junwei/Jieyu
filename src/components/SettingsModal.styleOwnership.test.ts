import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SettingsModal style ownership', () => {
  it('loads global settings styles with the component instead of the transcription bundle', () => {
    const componentCode = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/SettingsModal.tsx'),
      'utf8',
    );
    const transcriptionPanelEntry = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/panel-blocks.css'),
      'utf8',
    );

    expect(componentCode).toContain("import '../styles/panels/settings-modal.css';");
    expect(transcriptionPanelEntry).not.toContain("@import './panels/settings-modal.css';");
  });
});
