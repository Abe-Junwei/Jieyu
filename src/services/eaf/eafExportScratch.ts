export type EafExportScratch = {
  tsCounter: number;
  annCounter: number;
  timeSlots: Array<{ id: string; ms: number }>;
  usedConstraintTypes: Set<string>;
};
