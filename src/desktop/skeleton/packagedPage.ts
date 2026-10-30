import path from 'node:path';

/** A file inside the packaged dist directory, or index.html for an app route. */
export function packagedPageFile(
  distRoot: string,
  requestPath: string,
  exists: (file: string) => boolean,
): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const root = path.resolve(distRoot);
  const relative = decoded.replace(/^[/\\]+/, '');
  const candidate = path.resolve(root, relative);
  const fromRoot = path.relative(root, candidate);
  if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) return null;
  if (relative.length > 0 && exists(candidate)) return candidate;
  if (relative.length > 0 && path.posix.basename(relative).includes('.')) return null;
  const index = path.join(root, 'index.html');
  return exists(index) ? index : null;
}
