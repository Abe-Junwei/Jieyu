let orthographyRuntimePromise: Promise<typeof import('./orthographyRuntime')> | null = null;

export function loadOrthographyRuntime() {
  if (!orthographyRuntimePromise) {
    orthographyRuntimePromise = import('./orthographyRuntime');
  }
  return orthographyRuntimePromise;
}