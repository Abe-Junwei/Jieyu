/** Internal read path for one project folder. Unset, empty, and any other value stay off. */
export function desktopProjectReadEnabled(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
