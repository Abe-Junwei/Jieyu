/** Close every window before releasing the project session. Stay keeps the session. */
export async function quitAfterWindows(
  windows: readonly { close: () => Promise<boolean> }[],
  release: () => void | Promise<void>,
): Promise<boolean> {
  for (const win of windows) {
    if (!(await win.close())) return false;
  }
  await release();
  return true;
}

const windowDecisions = new Map<number, (closed: boolean) => void>();

export function awaitWindowDecision(id: number): Promise<boolean> {
  return new Promise((resolve) => {
    windowDecisions.set(id, resolve);
  });
}

export function resolveWindowDecision(id: number, closed: boolean): void {
  const resolve = windowDecisions.get(id);
  if (resolve === undefined) return;
  windowDecisions.delete(id);
  resolve(closed);
}
