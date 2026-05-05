import { useEffect, useRef } from 'react';
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../hooks/transcriptionPlaybackClock';

export function useTranscriptionAiAudioTimeRef(playerCurrentTime: number | undefined) {
  const aiAudioTimeRef = useRef(0);

  useEffect(() => {
    aiAudioTimeRef.current = getTranscriptionPlaybackClockSnapshot();
    return subscribeTranscriptionPlaybackClock(() => {
      aiAudioTimeRef.current = getTranscriptionPlaybackClockSnapshot();
    });
  }, []);

  useEffect(() => {
    if (playerCurrentTime === undefined) return;
    aiAudioTimeRef.current = playerCurrentTime;
  }, [playerCurrentTime]);

  return aiAudioTimeRef;
}