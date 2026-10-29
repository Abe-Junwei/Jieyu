export interface DesktopReadHost {
  projectReadEnabled: boolean;
  chooseDesktopFolder(): Promise<{ sessionId: string } | { cancelled: true }>;
  chooseImportFile?(): Promise<{ file: string; roles?: string } | { cancelled: true }>;
  chooseExportFile?(name: string): Promise<{ file: string } | { cancelled: true }>;
  listDailyBackups?(sessionId: string): Promise<{ days: string[] }>;
  restoreDailyBackup?(
    sessionId: string,
    day: string,
  ): Promise<{ cancelled: true } | { folder: string }>;
  desktopCall(sessionId: string, method: string, args: unknown): Promise<unknown>;
  desktopMediaUrl(sessionId: string, mediaId: string): Promise<{ url: string }>;
}

export function readDesktopProjectHost(): DesktopReadHost | null {
  const host = (globalThis as { jieyuDesktop?: Partial<DesktopReadHost> }).jieyuDesktop;
  if (
    host?.projectReadEnabled !== true ||
    host.chooseDesktopFolder === undefined ||
    host.desktopCall === undefined ||
    host.desktopMediaUrl === undefined
  ) {
    return null;
  }
  return host as DesktopReadHost;
}
