/** Electron 类型检查只看这座桥。打包时由 electron/vite.config.ts 接到真正的实现。 */
declare module '@sqlite-host' {
  export function writeProjectLibraryMarker(file: string): void;
  export function closeLockedSqliteStorage(): void;
  export function openLockedSqliteStorage(input: {
    folder: string;
    userDataFile: string;
    pid: number;
  }): void;
  export function reopenLockedSqliteStorage(): void;
  export function callLockedSqliteStorage(
    method: string,
    args: readonly unknown[],
  ): Promise<unknown>;
}
