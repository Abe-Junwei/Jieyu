import { AmbientObserver } from './AmbientObserver';
import type { VoiceAgentServiceOptions } from './VoiceAgentService.types';
import type { SttEngine } from './VoiceInputService.types';

export function buildVoiceAgentRuntimeConfigInput(options: VoiceAgentServiceOptions) {
  return {
    ...(options.whisperServerUrl !== undefined && { whisperServerUrl: options.whisperServerUrl }),
    ...(options.whisperServerModel !== undefined && {
      whisperServerModel: options.whisperServerModel,
    }),
    ...(options.commercialProviderKind !== undefined && {
      commercialProviderKind: options.commercialProviderKind,
    }),
    ...(options.commercialProviderConfig !== undefined && {
      commercialProviderConfig: options.commercialProviderConfig,
    }),
    ...(options.sttEnhancementKind !== undefined && {
      sttEnhancementKind: options.sttEnhancementKind,
    }),
    ...(options.sttEnhancementConfig !== undefined && {
      sttEnhancementConfig: options.sttEnhancementConfig,
    }),
  };
}

export function buildVoiceAgentDictationControllerOptions(options: VoiceAgentServiceOptions): {
  onTransformDictationPipelineFill?: (input: {
    layer: import('./SpeechAnnotationPipeline').AnnotationLayer;
    text: string;
    segmentId: string;
  }) => Promise<string>;
} {
  const dictationOpts: {
    onTransformDictationPipelineFill?: (input: {
      layer: import('./SpeechAnnotationPipeline').AnnotationLayer;
      text: string;
      segmentId: string;
    }) => Promise<string>;
  } = {};
  if (options.onTransformDictationPipelineFill) {
    dictationOpts.onTransformDictationPipelineFill = options.onTransformDictationPipelineFill;
  }
  return dictationOpts;
}

export function subscribeVoiceAgentAmbientEnvironment(input: {
  isListening: () => boolean;
  getEngine: () => SttEngine;
  switchEngine: (engine: SttEngine) => void;
}): () => void {
  return AmbientObserver.getInstance().onEnvironmentChange((env) => {
    if (!env.online && input.isListening()) {
      // Network offline: prefer local engines, switch away from commercial.
      if (input.getEngine() === 'commercial') {
        input.switchEngine('whisper-local');
      }
    }
  });
}
