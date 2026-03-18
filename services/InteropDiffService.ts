export interface InteropSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export interface InteropDiffItem {
  index: number;
  kind: 'changed' | 'missing' | 'added';
  before?: InteropSegment;
  after?: InteropSegment;
  fields?: Array<'startTime' | 'endTime' | 'text'>;
}

export interface InteropDiffReport {
  summary: {
    beforeCount: number;
    afterCount: number;
    changed: number;
    missing: number;
    added: number;
  };
  items: InteropDiffItem[];
}

function normalize(segments: InteropSegment[]): InteropSegment[] {
  return [...segments].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime || a.text.localeCompare(b.text));
}

export function createInteropDiffReport(
  before: InteropSegment[],
  after: InteropSegment[],
  options?: { timeTolerance?: number },
): InteropDiffReport {
  const timeTolerance = options?.timeTolerance ?? 1e-3;
  const left = normalize(before);
  const right = normalize(after);
  const max = Math.max(left.length, right.length);

  const items: InteropDiffItem[] = [];
  let changed = 0;
  let missing = 0;
  let added = 0;

  for (let i = 0; i < max; i++) {
    const l = left[i];
    const r = right[i];

    if (l && !r) {
      missing += 1;
      items.push({ index: i, kind: 'missing', before: l });
      continue;
    }
    if (!l && r) {
      added += 1;
      items.push({ index: i, kind: 'added', after: r });
      continue;
    }
    if (!l || !r) continue;

    const fields: Array<'startTime' | 'endTime' | 'text'> = [];
    if (Math.abs(l.startTime - r.startTime) > timeTolerance) fields.push('startTime');
    if (Math.abs(l.endTime - r.endTime) > timeTolerance) fields.push('endTime');
    if (l.text !== r.text) fields.push('text');

    if (fields.length > 0) {
      changed += 1;
      items.push({ index: i, kind: 'changed', before: l, after: r, fields });
    }
  }

  return {
    summary: {
      beforeCount: left.length,
      afterCount: right.length,
      changed,
      missing,
      added,
    },
    items,
  };
}
