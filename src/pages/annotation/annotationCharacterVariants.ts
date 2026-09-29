export type CharacterVariantGroup = readonly [string, ...string[]];

export function parseCharacterVariantLines(text: string): CharacterVariantGroup[] {
  const groups: CharacterVariantGroup[] = [];
  for (const line of text.split('\n')) {
    const parts = line
      .split('=')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length < 2) continue;
    groups.push([parts[0]!, ...parts.slice(1)]);
  }
  return groups;
}

export function foldCharacterVariants(
  form: string,
  groups: readonly CharacterVariantGroup[],
): string {
  let folded = form.normalize('NFC');
  for (const group of groups) {
    const canonical = group[0];
    if (!canonical) continue;
    for (const alternate of group.slice(1)) {
      if (alternate) folded = folded.split(alternate).join(canonical);
    }
  }
  return folded;
}
