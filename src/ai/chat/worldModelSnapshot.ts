import type { TimelineUnitView } from '../../hooks/timelineUnitView';

export type WorldModelDetailLevel = 'full' | 'digest' | 'summary';

export interface WorldModelLayerInput {
  id: string;
  key: string;
  name?: Record<string, unknown>;
}

export interface WorldModelMediaInput {
  id: string;
  filename: string;
}

function firstLocalizedName(name: Record<string, unknown> | undefined): string {
  if (!name) return '';
  const values = Object.values(name).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return values[0] ?? '';
}

function formatTime(seconds: number): string {
  const totalTenths = Math.round(seconds * 10);
  const minutes = Math.floor(totalTenths / 600);
  const remainder = (totalTenths % 600) / 10;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`;
}

function summarizeUnit(unit: TimelineUnitView): string {
  const parts = [
    `${unit.kind} ${formatTime(unit.startTime)}-${formatTime(unit.endTime)}`,
    unit.text ? `"${unit.text.slice(0, 24)}${unit.text.length > 24 ? '…' : ''}"` : '""',
  ];
  if (unit.speakerId) parts.push(`speaker=${unit.speakerId}`);
  if (unit.layerId) parts.push(`layer=${unit.layerId}`);
  return parts.join(' ');
}

export function resolveWorldModelDetailLevel(totalUnits: number): WorldModelDetailLevel {
  if (totalUnits > 500) return 'summary';
  if (totalUnits > 50) return 'digest';
  return 'full';
}

export function buildWorldModelSnapshot(input: {
  allUnits: ReadonlyArray<TimelineUnitView>;
  currentMediaUnits: ReadonlyArray<TimelineUnitView>;
  layers: ReadonlyArray<WorldModelLayerInput>;
  mediaItems?: ReadonlyArray<WorldModelMediaInput>;
  currentMediaId?: string;
  selectedUnitIds?: ReadonlyArray<string>;
  selectedLayerId?: string;
  activeLayerIdForEdits?: string;
  maxChars?: number;
}): string {
  const detailLevel = resolveWorldModelDetailLevel(input.allUnits.length);
  const selectedIds = new Set(input.selectedUnitIds ?? []);
  const unitsByMedia = new Map<string, TimelineUnitView[]>();
  for (const unit of input.allUnits) {
    const bucket = unitsByMedia.get(unit.mediaId);
    if (bucket) bucket.push(unit);
    else unitsByMedia.set(unit.mediaId, [unit]);
  }

  const mediaOrder = input.mediaItems?.map((item) => item.id)
    ?? [...new Set([input.currentMediaId, ...input.allUnits.map((unit) => unit.mediaId)].filter((id): id is string => typeof id === 'string' && id.length > 0))];

  const lines: string[] = ['project'];

  for (const mediaId of mediaOrder) {
    const media = input.mediaItems?.find((item) => item.id === mediaId);
    const units = [...(unitsByMedia.get(mediaId) ?? [])].sort((left, right) => left.startTime - right.startTime);
    const mediaLabel = media?.filename ?? mediaId;
    const currentSuffix = mediaId === input.currentMediaId ? ' ← currentMedia' : '';
    lines.push(`├── media ${mediaLabel} units=${units.length}${currentSuffix}`);

    if (detailLevel === 'summary' && mediaId !== input.currentMediaId) {
      continue;
    }

    const sourceUnits = detailLevel === 'full'
      ? units
      : mediaId === input.currentMediaId
        ? units.slice(0, 6)
        : (() => {
            const merged = [...units.slice(0, 3), ...units.slice(-3)];
            const seen = new Set<string>();
            return merged.filter((unit) => {
              if (seen.has(unit.id)) return false;
              seen.add(unit.id);
              return true;
            });
          })();

    for (const unit of sourceUnits) {
      const selectedSuffix = selectedIds.has(unit.id) ? ' ← selected' : '';
      lines.push(`│   ├── ${summarizeUnit(unit)}${selectedSuffix}`);
    }
    if (detailLevel === 'digest' && sourceUnits.length < units.length) {
      lines.push(`│   └── (+${units.length - sourceUnits.length} more units via list_units)`);
    }
  }

  lines.push('└── layers');
  for (const layer of input.layers) {
    const label = firstLocalizedName(layer.name) || layer.key || layer.id;
    const suffixes = [
      layer.id === input.selectedLayerId ? 'selectedLayer' : '',
      layer.id === input.activeLayerIdForEdits ? 'activeEditLayer' : '',
    ].filter(Boolean);
    lines.push(`    ├── ${label}${suffixes.length > 0 ? ` ← ${suffixes.join(',')}` : ''}`);
  }

  const snapshot = lines.join('\n');
  const maxChars = input.maxChars ?? 1200;
  return snapshot.length <= maxChars ? snapshot : `${snapshot.slice(0, maxChars - 3)}...`;
}
