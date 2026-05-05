/**
 * Browser TTS for assistant replies (Web Speech API `speechSynthesis`).
 * Used when the user opts in via preferences; see ADR-0029.
 */

const MAX_SPEAK_CHARS = 4096;

let speakGeneration = 0;

/** Strip common markdown / tool-artifact noise for listenable speech. Exported for unit tests. */
export function plainTextForAssistantTts(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/\r\n/g, '\n');

  // fenced code blocks
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // inline code
  s = s.replace(/`([^`]+)`/g, '$1');
  // markdown links [label](url)
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // headings, blockquotes
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^\s*>\s?/gm, '');
  // emphasis markers
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');

  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_SPEAK_CHARS) {
    s = `${s.slice(0, MAX_SPEAK_CHARS)}…`;
  }
  return s;
}

export function isAssistantWebSpeechTtsSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

export function stopAssistantWebSpeechTts(): void {
  if (typeof window === 'undefined') return;
  speakGeneration += 1;
  window.speechSynthesis?.cancel();
}

function pickVoice(voices: SpeechSynthesisVoice[], langTag: string): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  const exact = voices.find((v) => v.lang === langTag);
  if (exact) return exact;
  const primary = langTag.split('-')[0]?.toLowerCase();
  if (!primary) return undefined;
  return voices.find((v) => v.lang.toLowerCase().startsWith(`${primary}-`))
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(primary));
}

/**
 * Speak assistant reply text using the browser engine. Cancels any in-flight utterance first.
 * No-op when API missing or text empty after cleanup.
 */
export function speakAssistantReplyWithWebSpeechTts(text: string, uiLocale: string): void {
  if (!isAssistantWebSpeechTtsSupported()) return;
  const plain = plainTextForAssistantTts(text);
  if (!plain) return;

  const syn = window.speechSynthesis;
  speakGeneration += 1;
  const gen = speakGeneration;
  syn.cancel();

  const langTag = uiLocale.replace('_', '-');

  const run = (voices: SpeechSynthesisVoice[]): void => {
    if (gen !== speakGeneration) return;
    syn.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = langTag;
    const voice = pickVoice(voices, langTag);
    if (voice) u.voice = voice;
    syn.speak(u);
  };

  const voices = syn.getVoices();
  if (voices.length > 0) {
    run(voices);
    return;
  }

  const onChanged = (): void => {
    syn.removeEventListener('voiceschanged', onChanged);
    run(syn.getVoices());
  };
  syn.addEventListener('voiceschanged', onChanged);
  window.setTimeout(() => {
    syn.removeEventListener('voiceschanged', onChanged);
    if (gen !== speakGeneration) return;
    run(syn.getVoices());
  }, 400);
}
