// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceDock } from './useVoiceDock';
import { getCommercialSttRuntimeSnapshot, resetCommercialSttRuntimeSnapshotForTests } from '../services/stt/voiceCommercialSttRuntime';

const COMMERCIAL_STT_STORAGE_KEY = 'jieyu.voiceAgent.commercialStt';

describe('useVoiceDock', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCommercialSttRuntimeSnapshotForTests();
  });

  it('sanitizes legacy commercial config loaded from localStorage', async () => {
    window.localStorage.setItem(COMMERCIAL_STT_STORAGE_KEY, JSON.stringify({
      kind: 'groq',
      config: {
        apiKey: 'sk-voice-secret',
        accessToken: 'voice-token',
        baseUrl: 'https://voice.example.com',
        model: 'whisper-large-v3',
        appId: 'voice-app',
      },
    }));

    const { result } = renderHook(() => useVoiceDock({
      activeTextPrimaryLanguageId: 'cmn',
      getActiveTextPrimaryLanguageId: async () => null,
    }));

    expect(result.current.commercialProviderConfig).toEqual({
      baseUrl: 'https://voice.example.com',
      model: 'whisper-large-v3',
      appId: 'voice-app',
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(COMMERCIAL_STT_STORAGE_KEY)).toBe(JSON.stringify({
        kind: 'groq',
        config: {
          baseUrl: 'https://voice.example.com',
          model: 'whisper-large-v3',
          appId: 'voice-app',
        },
      }));
    });
  });

  it('does not persist apiKey or accessToken after config updates', async () => {
    const { result } = renderHook(() => useVoiceDock({
      activeTextPrimaryLanguageId: 'cmn',
      getActiveTextPrimaryLanguageId: async () => null,
    }));

    act(() => {
      result.current.handleCommercialConfigChange({
        apiKey: 'sk-runtime-secret',
        accessToken: 'runtime-token',
        baseUrl: 'https://voice.example.com',
        model: 'whisper-medium',
        appId: 'voice-app-2',
      });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(COMMERCIAL_STT_STORAGE_KEY)).toBe(JSON.stringify({
        kind: 'groq',
        config: {
          baseUrl: 'https://voice.example.com',
          model: 'whisper-medium',
          appId: 'voice-app-2',
        },
      }));
    });
  });

  it('stores apiKey and accessToken only in runtime snapshot', async () => {
    const { result } = renderHook(() => useVoiceDock({
      activeTextPrimaryLanguageId: 'cmn',
      getActiveTextPrimaryLanguageId: async () => null,
    }));

    act(() => {
      result.current.setCommercialProviderKind('volcengine');
      result.current.handleCommercialConfigChange({
        appId: 'voice-app-3',
        accessToken: 'runtime-token-only',
        apiKey: 'sk-runtime-only',
        baseUrl: 'https://voice.example.com',
      });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(COMMERCIAL_STT_STORAGE_KEY)).toBe(JSON.stringify({
        kind: 'volcengine',
        config: {
          baseUrl: 'https://voice.example.com',
          appId: 'voice-app-3',
        },
      }));
    });

    expect(getCommercialSttRuntimeSnapshot()).toEqual({
      kind: 'volcengine',
      config: {
        appId: 'voice-app-3',
        accessToken: 'runtime-token-only',
        apiKey: 'sk-runtime-only',
        baseUrl: 'https://voice.example.com',
      },
    });
  });
});