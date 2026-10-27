export function canConfirmManuscriptDelete(preview: {
  running: boolean;
  alreadyDeleted: boolean;
}): boolean {
  return !preview.running && !preview.alreadyDeleted;
}
