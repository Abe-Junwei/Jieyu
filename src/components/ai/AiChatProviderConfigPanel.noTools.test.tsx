// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultAiChatSettings } from '../../ai/providers/providerCatalog';
import {
  isNoToolsThisSession,
  resetNoToolsThisSessionForTests,
} from '../../ai/runtime/noToolsThisSession';
import { AiChatProviderConfigPanel } from './AiChatProviderConfigPanel';

describe('AiChatProviderConfigPanel no-native-tools toggle (R2)', () => {
  beforeEach(() => {
    resetNoToolsThisSessionForTests();
  });
  afterEach(() => {
    cleanup();
    resetNoToolsThisSessionForTests();
  });

  it('marks and clears the shared M2 noToolsThisSession set for the current provider+model', () => {
    const settings = getDefaultAiChatSettings('deepseek');
    render(
      <AiChatProviderConfigPanel
        aiChatSettings={settings}
        activeProviderFields={[]}
        onUpdateAiChatSettings={vi.fn()}
        updateCostGuardSetting={vi.fn()}
        cardMessages={{
          costGuardSessionTokenBudgetLabel: 'b',
          costGuardOutputTokenCapLabel: 'o',
          costGuardOutputTokenRetryCapLabel: 'r',
          webllmWarmingUp: '',
          webllmWarmup: '',
          webllmWarmupCancel: '',
          clearCurrentKey: '',
          webllmRuntimeTitle: '',
          webllmRuntimeSource: '',
          webllmRuntimeDetail: '',
          webllmRuntimeRoute: '',
          webllmWarmupProgressLabel: '',
        }}
        locale="zh-CN"
        onTestAiConnection={undefined}
        isTestingConnection={false}
        setTestConnectionPending={vi.fn()}
        aiConnectionTestStatus="idle"
        aiConnectionTestMessage={null}
        hasApiKeyField={false}
        webllmWarmupState="idle"
        handleWarmupWebllmModel={async () => {}}
        handleCancelWebllmWarmup={() => {}}
        webllmRuntimeStatus={{ available: false, detail: '' }}
        webllmSourceLabel=""
        webllmFallbackLabel=""
        webllmWarmupPercent={0}
        webllmWarmupPhaseLabel={null}
        webllmWarmupMessage={null}
      />,
    );
    const box = screen.getByTestId('ai-no-native-tools-this-session') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(isNoToolsThisSession('deepseek', settings.model)).toBe(true);
    fireEvent.click(box);
    expect(isNoToolsThisSession('deepseek', settings.model)).toBe(false);
  });
});
