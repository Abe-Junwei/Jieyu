import { useCallback, useEffect, useRef, useState } from 'react';
import { fireAndForget } from '../utils/fireAndForget';
import { createLogger } from '../observability/logger';
import type { SttEnhancementConfig, SttEnhancementSelectionKind } from '../services/stt';
import { setCommercialSttRuntimeSnapshot } from '../services/stt/voiceCommercialSttRuntime';

export type CommercialProviderKind = 'groq' | 'gemini' | 'openai-audio' | 'custom-http' | 'minimax' | 'volcengine';

export type CommercialProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  appId?: string;
  accessToken?: string;
};

export type VoiceLocalWhisperConfig = {
  baseUrl?: string;
  model?: string;
};

export type VoiceSttEnhancementConfig = SttEnhancementConfig;

const VOICE_COMMERCIAL_STT_STORAGE_KEY = 'jieyu.voiceAgent.commercialStt';
const VOICE_LOCAL_WHISPER_STORAGE_KEY = 'jieyu.voiceAgent.localWhisper';
const VOICE_STT_ENHANCEMENT_STORAGE_KEY = 'jieyu.voiceAgent.sttEnhancement';
const log = createLogger('useVoiceDock');

function sanitizeCommercialConfig(config: CommercialProviderConfig | undefined): CommercialProviderConfig {
  if (!config) return {};
  return {
    ...(typeof config.baseUrl === 'string' ? { baseUrl: config.baseUrl } : {}),
    ...(typeof config.model === 'string' ? { model: config.model } : {}),
    ...(typeof config.appId === 'string' ? { appId: config.appId } : {}),
  };
}

function isCommercialProviderKind(value: unknown): value is CommercialProviderKind {
  return value === 'groq'
    || value === 'gemini'
    || value === 'openai-audio'
    || value === 'custom-http'
    || value === 'minimax'
    || value === 'volcengine';
}

function loadCommercialSttConfig(): { kind: CommercialProviderKind; config: CommercialProviderConfig } {
  try {
    const raw = window.localStorage.getItem(VOICE_COMMERCIAL_STT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ kind: CommercialProviderKind; config: CommercialProviderConfig }>;
      return {
        kind: isCommercialProviderKind(parsed.kind) ? parsed.kind : 'groq',
        config: sanitizeCommercialConfig(parsed.config),
      };
    }
  } catch (error) {
    log.warn('Failed to load commercial STT config from localStorage', {
      key: VOICE_COMMERCIAL_STT_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { kind: 'groq', config: {} };
}

function saveCommercialSttConfig(kind: CommercialProviderKind, config: CommercialProviderConfig): void {
  try {
    window.localStorage.setItem(VOICE_COMMERCIAL_STT_STORAGE_KEY, JSON.stringify({ kind, config: sanitizeCommercialConfig(config) }));
  } catch (error) {
    log.warn('Failed to save commercial STT config to localStorage', {
      key: VOICE_COMMERCIAL_STT_STORAGE_KEY,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function loadLocalWhisperConfig(): VoiceLocalWhisperConfig {
  try {
    const raw = window.localStorage.getItem(VOICE_LOCAL_WHISPER_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as VoiceLocalWhisperConfig;
  } catch (error) {
    log.warn('Failed to load local Whisper config from localStorage', {
      key: VOICE_LOCAL_WHISPER_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { baseUrl: 'http://localhost:3040', model: 'ggml-small-q5_k.bin' };
}

function sanitizeEnhancementConfig(config: VoiceSttEnhancementConfig | undefined): VoiceSttEnhancementConfig {
  if (!config) return {};
  return {
    ...(typeof config.endpointUrl === 'string' ? { endpointUrl: config.endpointUrl } : {}),
    ...(typeof config.model === 'string' ? { model: config.model } : {}),
    ...(typeof config.language === 'string' ? { language: config.language } : {}),
  };
}

function isEnhancementKind(value: unknown): value is Exclude<SttEnhancementSelectionKind, 'none'> {
  return value === 'whisperx-align' || value === 'mfa-align' || value === 'pyannote-diarize';
}

function loadSttEnhancementSelection(): {
  kind: SttEnhancementSelectionKind;
  config: VoiceSttEnhancementConfig;
} {
  try {
    const raw = window.localStorage.getItem(VOICE_STT_ENHANCEMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ kind: SttEnhancementSelectionKind; config: VoiceSttEnhancementConfig }>;
      return {
        kind: isEnhancementKind(parsed.kind) ? parsed.kind : 'none',
        config: sanitizeEnhancementConfig(parsed.config),
      };
    }
  } catch (error) {
    log.warn('Failed to load STT enhancement config from localStorage', {
      key: VOICE_STT_ENHANCEMENT_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { kind: 'none', config: {} };
}

function saveSttEnhancementSelection(kind: SttEnhancementSelectionKind, config: VoiceSttEnhancementConfig): void {
  try {
    window.localStorage.setItem(VOICE_STT_ENHANCEMENT_STORAGE_KEY, JSON.stringify({ kind, config: sanitizeEnhancementConfig(config) }));
  } catch (error) {
    log.warn('Failed to save STT enhancement config to localStorage', {
      key: VOICE_STT_ENHANCEMENT_STORAGE_KEY,
      kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function saveLocalWhisperConfig(config: VoiceLocalWhisperConfig): void {
  try {
    window.localStorage.setItem(VOICE_LOCAL_WHISPER_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    log.warn('Failed to save local Whisper config to localStorage', {
      key: VOICE_LOCAL_WHISPER_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

type UseVoiceDockParams = {
  activeTextPrimaryLanguageId?: string | null;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
};

export function useVoiceDock({
  activeTextPrimaryLanguageId,
  getActiveTextPrimaryLanguageId,
}: UseVoiceDockParams) {
  const [voiceCorpusLang, setVoiceCorpusLang] = useState('cmn');
  const [voiceCorpusLangOverride, setVoiceCorpusLangOverride] = useState<string | null>(null);
  const [voiceDockExpanded, setVoiceDockExpanded] = useState(false);
  const [voiceDockPos, setVoiceDockPos] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 16 });
  const [voiceDockDragging, setVoiceDockDragging] = useState(false);
  const voiceDockDragRef = useRef<{ pointerId: number; startX: number; startY: number; startRight: number; startBottom: number; moved: boolean } | null>(null);
  const voiceDockContainerRef = useRef<HTMLElement | null>(null);
  const voiceDockDraggedAtRef = useRef(0);
  const [commercialProviderKind, setCommercialProviderKind] = useState<CommercialProviderKind>(() => loadCommercialSttConfig().kind);
  const [commercialProviderConfig, setCommercialProviderConfig] = useState<CommercialProviderConfig>(() => loadCommercialSttConfig().config);
  const [localWhisperConfig, setLocalWhisperConfig] = useState<VoiceLocalWhisperConfig>(() => loadLocalWhisperConfig());
  const [sttEnhancementKind, setSttEnhancementKind] = useState<SttEnhancementSelectionKind>(() => loadSttEnhancementSelection().kind);
  const [sttEnhancementConfig, setSttEnhancementConfig] = useState<VoiceSttEnhancementConfig>(() => loadSttEnhancementSelection().config);

  useEffect(() => {
    const preferredLanguage = activeTextPrimaryLanguageId?.trim();
    if (preferredLanguage) {
      setVoiceCorpusLang(preferredLanguage);
      return;
    }
    let cancelled = false;
    fireAndForget((async () => {
      const fallbackLanguage = (await getActiveTextPrimaryLanguageId())?.trim();
      if (!cancelled && fallbackLanguage) {
        setVoiceCorpusLang(fallbackLanguage);
      }
    })());
    return () => { cancelled = true; };
  }, [activeTextPrimaryLanguageId, getActiveTextPrimaryLanguageId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('jieyu.voiceDock.pos');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { right?: unknown; bottom?: unknown };
      const right = typeof parsed.right === 'number' ? parsed.right : 16;
      const bottom = typeof parsed.bottom === 'number' ? parsed.bottom : 16;
      setVoiceDockPos({ right: Math.max(8, right), bottom: Math.max(8, bottom) });
    } catch (err) {
      console.error('[Jieyu] useVoiceDock: failed to read voice dock position from localStorage', err);
    }
  }, []);

  useEffect(() => {
    if (voiceDockDragging) return;
    window.localStorage.setItem('jieyu.voiceDock.pos', JSON.stringify(voiceDockPos));
  }, [voiceDockDragging, voiceDockPos]);

  // Persist commercial STT config to localStorage when it changes
  useEffect(() => {
    setCommercialSttRuntimeSnapshot(commercialProviderKind, commercialProviderConfig);
  }, [commercialProviderKind, commercialProviderConfig]);

  useEffect(() => {
    saveCommercialSttConfig(commercialProviderKind, commercialProviderConfig);
  }, [commercialProviderKind, commercialProviderConfig]);

  useEffect(() => {
    saveLocalWhisperConfig(localWhisperConfig);
  }, [localWhisperConfig]);

  useEffect(() => {
    saveSttEnhancementSelection(sttEnhancementKind, sttEnhancementConfig);
  }, [sttEnhancementConfig, sttEnhancementKind]);

  const effectiveVoiceCorpusLang = (voiceCorpusLangOverride ?? voiceCorpusLang ?? 'cmn').toLowerCase();

  const handleVoiceSetLangOverride = useCallback((lang: string | null) => {
    const next = lang?.trim() ?? '';
    setVoiceCorpusLangOverride(next ? next.toLowerCase() : null);
  }, []);

  const handleCommercialConfigChange = useCallback((config: CommercialProviderConfig) => {
    setCommercialProviderConfig(config);
  }, []);

  const handleLocalWhisperConfigChange = useCallback((config: VoiceLocalWhisperConfig) => {
    setLocalWhisperConfig(config);
  }, []);

  const handleSttEnhancementKindChange = useCallback((kind: SttEnhancementSelectionKind) => {
    setSttEnhancementKind(kind);
  }, []);

  const handleSttEnhancementConfigChange = useCallback((config: VoiceSttEnhancementConfig) => {
    setSttEnhancementConfig(config);
  }, []);

  const handleVoiceDockDragStart = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    setVoiceDockDragging(true);
    voiceDockDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRight: voiceDockPos.right,
      startBottom: voiceDockPos.bottom,
      moved: false,
    };
    event.preventDefault();
  }, [voiceDockPos.bottom, voiceDockPos.right]);

  const handleVoiceDockDragMove = useCallback((event: PointerEvent) => {
    const drag = voiceDockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= 4) {
      drag.moved = true;
    }
    const nextRight = Math.max(8, Math.min(window.innerWidth - 56, drag.startRight - dx));
    const nextBottom = Math.max(8, Math.min(window.innerHeight - 56, drag.startBottom - dy));
    setVoiceDockPos({ right: nextRight, bottom: nextBottom });
  }, []);

  const handleVoiceDockDragEnd = useCallback((event: PointerEvent) => {
    const drag = voiceDockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    voiceDockDragRef.current = null;
    setVoiceDockDragging(false);

    if (drag.moved) {
      voiceDockDraggedAtRef.current = Date.now();
    }

    const edge = 16;
    const dockWidth = voiceDockContainerRef.current?.offsetWidth ?? 460;
    const dockHeight = voiceDockContainerRef.current?.offsetHeight ?? 168;
    const maxRight = Math.max(edge, window.innerWidth - dockWidth - edge);
    const maxBottom = Math.max(edge, window.innerHeight - dockHeight - edge);

    setVoiceDockPos((current) => {
      const snapRight = current.right <= maxRight / 2 ? edge : maxRight;
      const snapBottom = Math.max(edge, Math.min(maxBottom, current.bottom));
      return { right: snapRight, bottom: snapBottom };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handleVoiceDockDragMove);
    window.addEventListener('pointerup', handleVoiceDockDragEnd);
    window.addEventListener('pointercancel', handleVoiceDockDragEnd);
    return () => {
      window.removeEventListener('pointermove', handleVoiceDockDragMove);
      window.removeEventListener('pointerup', handleVoiceDockDragEnd);
      window.removeEventListener('pointercancel', handleVoiceDockDragEnd);
    };
  }, [handleVoiceDockDragEnd, handleVoiceDockDragMove]);

  return {
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    voiceDockExpanded,
    setVoiceDockExpanded,
    voiceDockPos,
    voiceDockDragging,
    voiceDockContainerRef,
    voiceDockDraggedAtRef,
    handleVoiceSetLangOverride,
    handleCommercialConfigChange,
    handleVoiceDockDragStart,
    commercialProviderKind,
    setCommercialProviderKind,
    commercialProviderConfig,
    setCommercialProviderConfig,
    localWhisperConfig,
    setLocalWhisperConfig,
    handleLocalWhisperConfigChange,
    sttEnhancementKind,
    setSttEnhancementKind,
    sttEnhancementConfig,
    setSttEnhancementConfig,
    handleSttEnhancementKindChange,
    handleSttEnhancementConfigChange,
  };
}
