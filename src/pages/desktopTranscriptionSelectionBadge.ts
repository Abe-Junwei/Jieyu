/** Floating multi-select badge copy. Filter prefix only when the speakers filter is active. */
export function selectionBadgeLabel(
  count: number,
  filtering: boolean,
  text: { selected: (count: number) => string; filtering: string },
): string | null {
  if (count < 2) return null;
  const selected = text.selected(count);
  return filtering ? `${text.filtering} · ${selected}` : selected;
}
