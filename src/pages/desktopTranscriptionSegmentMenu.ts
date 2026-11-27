/** Split and merge items for the segment menu. A sub-segment cannot merge. */
export function segmentMenuActions(
  menu: { unitId: string; sub?: true } | null,
  closeMenu: () => void,
  props: {
    onSplit?: (unitId: string) => void;
    canMerge?: (unitId: string) => boolean;
    onMerge?: (unitId: string) => void;
  },
): { onAskSplit?: () => void; canMerge?: boolean; onAskMerge?: () => void } {
  const unitId = menu?.unitId;
  const split =
    props.onSplit === undefined
      ? {}
      : {
          onAskSplit: () => {
            closeMenu();
            if (unitId) props.onSplit?.(unitId);
          },
        };
  if (props.onMerge === undefined) return split;
  const allowed = unitId !== undefined && menu?.sub !== true && props.canMerge?.(unitId) === true;
  return {
    ...split,
    canMerge: allowed,
    onAskMerge: () => {
      closeMenu();
      // Always invoke: ask() toasts when blocked by filter; otherwise no-ops when no pair.
      if (unitId && menu?.sub !== true) props.onMerge?.(unitId);
    },
  };
}
