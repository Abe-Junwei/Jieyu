import { useCallback, useRef } from 'react';
import type { SttResult } from '../services/VoiceInputService';
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
    if (!activeDictationPipeline) return false;

    if (result.lang) {
      options.setDetectedLang(result.lang);
    }

    if (!result.isFinal) {
      if (result.text.trim().length > 0) {
        options.setError(null);
      }
      options.setInterimText(result.text);
      options.setConfidence(result.confidence);
      activeDictationPipeline.onSttResult(result);
      return true;
    }

    options.setError(null);
    options.setInterimText('');
    options.setFinalText(result.text);
    options.setConfidence(result.confidence);
    activeDictationPipeline.onSttResult(result);
    options.setAgentState('idle');
    return true;
  }, [options]);

  return {
    handlePipelineResult,
    startDictationPipeline,
    stopDictationPipeline,
  };
}
