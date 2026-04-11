/**
 * 转写性能调试开关 | Transcription performance debug toggle
 *
 * localStorage: jieyu.perf.transcription = '1' | 'true'
 */
export function isTranscriptionPerfDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const value = window.localStorage.getItem('jieyu.perf.transcription');
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}
