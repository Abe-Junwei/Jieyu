type JsonPrimitive = string | number | boolean | null;
type NormalizedJsonValue = JsonPrimitive | NormalizedJsonValue[] | { [key: string]: NormalizedJsonValue };

export interface AiToolRequestDescriptor {
  name: string;
  arguments: Record<string, unknown>;
}

function normalizeJsonValue(value: unknown): NormalizedJsonValue {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item === undefined ? null : item));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    const normalized: Record<string, NormalizedJsonValue> = {};
    for (const [key, item] of entries) {
      normalized[key] = normalizeJsonValue(item);
    }
    return normalized;
  }

  return String(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value));
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildAiToolRequestId(call: AiToolRequestDescriptor): string {
  const stablePayload = stableStringify({
    name: call.name,
    arguments: call.arguments,
  });
  return `toolreq_${fnv1a32(stablePayload)}`;
}
