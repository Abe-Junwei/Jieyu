export type DrawerHeightBounds = {
  min: number;
  max: number;
  preferred: number;
};

export function resolveVoiceDrawerHeightBounds(viewportHeight: number | undefined): DrawerHeightBounds {
  if (!viewportHeight || Number.isNaN(viewportHeight)) {
    return { min: 140, max: 380, preferred: 260 };
  }
  const min = Math.max(120, Math.floor(viewportHeight * 0.2));
  const max = Math.max(min + 80, Math.floor(viewportHeight * 0.62));
  const preferred = Math.min(Math.max(Math.floor(viewportHeight * 0.36), min), max);
  return { min, max, preferred };
}

export function resolveDecisionPanelHeightBounds(viewportHeight: number | undefined): DrawerHeightBounds {
  if (!viewportHeight || Number.isNaN(viewportHeight)) {
    return { min: 160, max: 380, preferred: 260 };
  }
  const min = Math.max(132, Math.floor(viewportHeight * 0.22));
  const max = Math.max(min + 80, Math.floor(viewportHeight * 0.62));
  const preferred = Math.min(Math.max(Math.floor(viewportHeight * 0.36), min), max);
  return { min, max, preferred };
}

export function clampHeight(value: number, bounds: DrawerHeightBounds): number {
  return Math.min(Math.max(value, bounds.min), bounds.max);
}