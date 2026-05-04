import { useCallback, useRef } from 'react';
import type { SttResult } from '../services/VoiceInputService';
import { tryConsumeSttThroughDictationPipeline } from '../services/voiceAgentServiceDictationSttRoute';
import { SpeechAnnotationPipeline, type DictationPipelineCallbacks, type QuickDictationConfig } from '../services/SpeechAnnotationPipeline';

interface UseVoiceAgentDictationPipelineOptions {
  dictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  setDetectedLang: (lang: string | null) => void;
  setError: (message: string | null) => void;
  setInterimText: (text: string) => void;
  setFinalText: (text: string) => void;
  setConfidence: (value: number) => void;
  setAgentState: (state: 'idle') => void;
}

export function useVoiceAgentDictationPipeline(options: UseVoiceAgentDictationPipelineOptions) {
  const dictationPipelineRef = useRef<SpeechAnnotationPipeline | null>(null);

  const stopDictationPipeline = useCallback(() => {
    dictationPipelineRef.current?.stop();
    dictationPipelineRef.current = null;
  }, []);

  const startDictationPipeline = useCallback(() => {
    if (!options.dictationPipeline) return;
    stopDictationPipeline();
    dictationPipelineRef.current = new SpeechAnnotationPipeline(
      options.dictationPipeline.callbacks,
      options.dictationPipeline.config,
    );
    void dictationPipelineRef.current.start();
  }, [options.dictationPipeline, stopDictationPipeline]);

  const handlePipelineResult = useCallback((result: SttResult) => {
    const activeDictationPipeline = dictationPipelineRef.current;
    return tryConsumeSttThroughDictationPipeline({
      pipeline: activeDictationPipeline,
      result,
      setDetectedLang: options.setDetectedLang,
      clearErrorOnNonEmptyInterim: () => {
        options.setError(null);
      },
      clearError: () => {
        options.setError(null);
      },
      setInterimText: options.setInterimText,
      setFinalText: options.setFinalText,
      setConfidence: options.setConfidence,
      afterFinalDictationConsumed: () => {
        options.setAgentState('idle');
      },
    });
  }, [options]);

  return {
    handlePipelineResult,
    startDictationPipeline,
    stopDictationPipeline,
  };
}
