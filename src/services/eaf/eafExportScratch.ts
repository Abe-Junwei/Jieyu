export type EafExportScratch = {
  tsCounter: number;
  annCounter: number;
  /** Annotation IDs already emitted or reserved from externalRef (#431). */
  usedAnnIds: Set<string>;
  timeSlots: Array<{ id: string; ms: number }>;
  usedConstraintTypes: Set<string>;
};

/** Keep a preserved externalRef, or allocate the next free aN / wN. */
export function takeEafAnnId(
  scratch: EafExportScratch,
  options?: { externalRef?: string | undefined; prefix?: 'a' | 'w' },
): string {
  const externalRef = options?.externalRef?.trim();
  if (externalRef && externalRef.length > 0) {
    scratch.usedAnnIds.add(externalRef);
    return externalRef;
  }
  const prefix = options?.prefix ?? 'a';
  let id = `${prefix}${scratch.annCounter}`;
  while (scratch.usedAnnIds.has(id)) {
    scratch.annCounter += 1;
    id = `${prefix}${scratch.annCounter}`;
  }
  scratch.usedAnnIds.add(id);
  scratch.annCounter += 1;
  return id;
}

export function collectReservedEafAnnIds(
  translations: Array<{ externalRef?: string | undefined }>,
  layerSegmentContents?: Map<string, Map<string, { externalRef?: string | undefined }>>,
): Set<string> {
  const used = new Set<string>();
  for (const row of translations) {
    const ref = row.externalRef?.trim();
    if (ref) used.add(ref);
  }
  if (layerSegmentContents) {
    for (const bySegment of layerSegmentContents.values()) {
      for (const row of bySegment.values()) {
        const ref = row.externalRef?.trim();
        if (ref) used.add(ref);
      }
    }
  }
  return used;
}
