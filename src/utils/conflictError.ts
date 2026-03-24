export function hasConflictKeyword(message: string): boolean {
  return /\bconflict\b|changed externally/i.test(message);
}

export function isNamedConflictError(error: unknown, conflictNames: string[]): boolean {
  if (!(error instanceof Error)) return false;
  return conflictNames.includes(error.name);
}

export function isLikelyConflictError(error: unknown, conflictNames: string[]): boolean {
  if (isNamedConflictError(error, conflictNames)) return true;
  if (!(error instanceof Error)) return false;
  return hasConflictKeyword(error.message);
}
