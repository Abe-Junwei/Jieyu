/**
 * useJKLShuttle — JKL broadcast-standard shuttle control + frame-accurate stepping.
 *
 * JKL is the industry-standard shuttle vocabulary (Premiere, Audition, Final Cut):
 *   K  = pause / stop
 *   J  = reverse play (tap repeatedly to accelerate: 1x → 2x → 4x → 8x → 16x)
 *   L  = forward play (tap repeatedly to accelerate: 1x → 2x → 4x → 8x → 16x)
 *   J+K held = slow reverse
 *   K+L held = slow forward
 *   , / .   = step one frame back / forward (pauses first if playing)
 *   Home    = seek to 0
 *   End     = seek to end
 *
 * All keys are handled via global listeners so they work regardless of focus.
 */
import { useEffect, useRef } from 'react';

interface JKLPlayer {
  readonly isReady: boolean;
  readonly isPlaying: boolean;
  readonly duration: number;
  readonly playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  togglePlayback: () => void;
  stop: () => void;
  seekBySeconds: (delta: number) => void;
  seekTo: (time: number) => void;
}

/** Normalised frame rate when stepping (25 fps is a safe default for most video). */
const FRAME_DURATION_S = 1 / 25;

export function useJKLShuttle(player: JKLPlayer) {
  /** Keys currently held down */
  const keysRef = useRef<Set<string>>(new Set());
  /** Number of times J has been tapped (determines reverse speed) */
  const jTapsRef = useRef(0);
  /** Number of times L has been tapped (determines forward speed) */
  const lTapsRef = useRef(0);
  /** Current shuttle speed multiplier */
  const shuttleRef = useRef(1);
  /** Saved playback rate before shuttle took over */
  const savedRateRef = useRef(1);

  useEffect(() => {
    /** Translate a tap count into a speed multiplier */
    const speedForTaps = (taps: number): number => {
      // 0 taps → 1×, 1 tap → 1×, 2 taps → 2×, 3 taps → 4×, 4 taps → 8×, 5+ taps → 16×
      if (taps <= 1) return 1;
      if (taps === 2) return 2;
      if (taps === 3) return 4;
      if (taps === 4) return 8;
      return 16;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Never intercept keys inside text inputs
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      // Ignore if any modifier key is held (let browser/system shortcuts fire)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;

      // ── J / L — shuttle direction ──────────────────────────────────────────
      if (key === 'j' || key === 'J' || key === 'l' || key === 'L') {
        e.preventDefault();

        const isFirstPress = !keysRef.current.has(key.toLowerCase());
        keysRef.current.add(key.toLowerCase());

        if (key === 'j' || key === 'J') {
          if (isFirstPress) jTapsRef.current += 1;
          lTapsRef.current = 0;
        } else {
          if (isFirstPress) lTapsRef.current += 1;
          jTapsRef.current = 0;
        }

        const kHeld = keysRef.current.has('k');

        if (key === 'j' || key === 'J') {
          // J = reverse
          if (kHeld) {
            // K held → slow reverse (use rate -1)
            if (!player.isPlaying || player.playbackRate >= 0) {
              player.stop();
              player.setPlaybackRate(-1);
              player.togglePlayback();
            } else {
              player.setPlaybackRate(-1);
            }
          } else {
            // J without K → shuttle reverse
            const speed = speedForTaps(jTapsRef.current);
            shuttleRef.current = speed;
            if (player.playbackRate < 0) {
              player.setPlaybackRate(-speed);
            } else {
              player.stop();
              player.setPlaybackRate(-speed);
              player.togglePlayback();
            }
          }
        } else {
          // L = forward
          if (kHeld) {
            // K held → slow forward (use rate 1)
            if (!player.isPlaying || player.playbackRate <= 0) {
              player.stop();
              player.setPlaybackRate(1);
              player.togglePlayback();
            } else {
              player.setPlaybackRate(1);
            }
          } else {
            const speed = speedForTaps(lTapsRef.current);
            shuttleRef.current = speed;
            if (player.playbackRate > 0) {
              player.setPlaybackRate(speed);
            } else {
              player.stop();
              player.setPlaybackRate(speed);
              player.togglePlayback();
            }
          }
        }
        return;
      }

      // ── K — pause / stop ──────────────────────────────────────────────────
      if (key === 'k' || key === 'K') {
        e.preventDefault();
        keysRef.current.add('k');

        if (player.isPlaying) {
          player.stop();
        }
        return;
      }

      // ── , — step back one frame ───────────────────────────────────────────
      if (key === ',' || key === '，') {
        e.preventDefault();
        if (player.isPlaying) player.stop();
        player.seekBySeconds(-FRAME_DURATION_S);
        return;
      }

      // ── . — step forward one frame ───────────────────────────────────────
      if (key === '.' || key === '。') {
        e.preventDefault();
        if (player.isPlaying) player.stop();
        player.seekBySeconds(FRAME_DURATION_S);
        return;
      }

      // ── Home — seek to start ─────────────────────────────────────────────
      if (key === 'Home') {
        e.preventDefault();
        player.seekTo(0);
        return;
      }

      // ── End — seek to end ────────────────────────────────────────────────
      if (key === 'End') {
        e.preventDefault();
        player.seekTo(player.duration);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.delete(key);

      if (key === 'k') {
        // K released — check if J or L are still held
        if (keysRef.current.has('j')) {
          player.setPlaybackRate(-shuttleRef.current);
        } else if (keysRef.current.has('l')) {
          player.setPlaybackRate(shuttleRef.current);
        } else {
          // Neither J nor L held — stop
          if (player.isPlaying) player.stop();
          player.setPlaybackRate(savedRateRef.current);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [player]);
}
