import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

type RecommendationItem = { prompt: string };
type RecommendationSource = 'fallback' | 'llm';

type RecommendationEvent = {
  type: 'shown';
  source: RecommendationSource;
  prompt: string;
  signature: string;
  timestamp: string;
};

export function useAiChatRecommendationController({
  dismissedRecommendationSignature,
  hybridInputSignature,
  setDismissedRecommendationSignature,
  topRecommendation,
  showInlineRecommendation,
  recommendationSource,
  visibleRecommendationSignatureRef,
  exposedRecommendationRef,
  onTrackAiRecommendationEvent,
}: {
  dismissedRecommendationSignature: string | null;
  hybridInputSignature: string;
  setDismissedRecommendationSignature: Dispatch<SetStateAction<string | null>>;
  topRecommendation: RecommendationItem | undefined;
  showInlineRecommendation: boolean;
  recommendationSource: RecommendationSource;
  visibleRecommendationSignatureRef: MutableRefObject<string | null>;
  exposedRecommendationRef: MutableRefObject<{ prompt: string; source: RecommendationSource; signature: string } | null>;
  onTrackAiRecommendationEvent: ((event: RecommendationEvent) => void) | undefined;
}) {
  useEffect(() => {
    if (dismissedRecommendationSignature !== hybridInputSignature) return;
    setDismissedRecommendationSignature(null);
  }, [dismissedRecommendationSignature, hybridInputSignature, setDismissedRecommendationSignature]);

  useEffect(() => {
    if (!topRecommendation || !showInlineRecommendation || !onTrackAiRecommendationEvent) {
      visibleRecommendationSignatureRef.current = null;
      return;
    }
    const signature = `${recommendationSource}:${topRecommendation.prompt}`;
    if (visibleRecommendationSignatureRef.current === signature) return;
    visibleRecommendationSignatureRef.current = signature;
    exposedRecommendationRef.current = {
      prompt: topRecommendation.prompt,
      source: recommendationSource,
      signature,
    };
    onTrackAiRecommendationEvent({
      type: 'shown',
      source: recommendationSource,
      prompt: topRecommendation.prompt,
      signature,
      timestamp: new Date().toISOString(),
    });
  }, [
    exposedRecommendationRef,
    onTrackAiRecommendationEvent,
    recommendationSource,
    showInlineRecommendation,
    topRecommendation,
    visibleRecommendationSignatureRef,
  ]);
}
