/**
 * True when the shell should use the transcription workspace layout (main /transcription routes
 * and /assets/* language-asset paths that still render TranscriptionPage).
 * Keep in sync with historical `isTranscriptionRoute` in App.
 */
export function isTranscriptionWorkspacePathname(pathname: string): boolean {
  if (pathname.startsWith('/transcription')) return true;
  return (
    pathname === '/assets/language-metadata'
    || pathname === '/assets/orthographies'
    || pathname === '/assets/orthography-bridges'
  );
}
