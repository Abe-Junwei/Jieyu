import type { CoordinationPhase } from '../coordination/coordinationLite';

export function inferCoordinationPhase(input: {
  finalStatus: 'done' | 'error';
  nextLocalToolCount: number;
  selectedToolCount: number;
}): CoordinationPhase {
  if (input.finalStatus === 'error') return 'verification';
  if (input.nextLocalToolCount > 0 || input.selectedToolCount > 0) return 'research';
  return 'synthesis';
}
