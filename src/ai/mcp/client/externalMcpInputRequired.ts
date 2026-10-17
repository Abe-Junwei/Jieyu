/**
 * MCP 2026-07-28 InputRequiredResult, form elicitation only.
 * Sampling and roots stay unsupported. The model never sees the server message or requestState.
 */
import { inspectInbound } from '../../security/semanticGuard';

const REQUEST_CAP = 3;
const FIELD_CAP = 6;

export type ExternalMcpInputField = { name: string; required: boolean };

export type ExternalMcpInputRequest = {
  id: string;
  message: string;
  fields: ReadonlyArray<ExternalMcpInputField>;
};

export type ExternalMcpInputForm = {
  requestState?: string | undefined;
  requests: ReadonlyArray<ExternalMcpInputRequest>;
};

export type ExternalMcpInputCard = ExternalMcpInputForm & {
  origin: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

export type ExternalMcpInputResponses = Record<
  string,
  { action: 'accept'; content: Record<string, string> }
>;

function allowedText(text: string): boolean {
  return inspectInbound({ text, snippets: [text], trustTier: 'untrusted' }).action === 'allow';
}

function parseFields(schema: unknown): ExternalMcpInputField[] | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const row = schema as { type?: unknown; properties?: unknown; required?: unknown };
  if (row.type !== 'object' || !row.properties || typeof row.properties !== 'object') return null;
  const required = new Set(
    Array.isArray(row.required)
      ? row.required.filter((item): item is string => typeof item === 'string')
      : [],
  );
  const fields: ExternalMcpInputField[] = [];
  for (const [name, spec] of Object.entries(row.properties as Record<string, unknown>)) {
    if (!spec || typeof spec !== 'object') return null;
    if ((spec as { type?: unknown }).type !== 'string') return null;
    if (!allowedText(name)) return null;
    fields.push({ name, required: required.has(name) });
    if (fields.length > FIELD_CAP) return null;
  }
  return fields.length > 0 ? fields : null;
}

function parseRequest(id: string, request: unknown): ExternalMcpInputRequest | null {
  if (!request || typeof request !== 'object') return null;
  const row = request as { method?: unknown; params?: unknown };
  if (row.method !== 'elicitation/create' || !row.params || typeof row.params !== 'object') {
    return null;
  }
  const params = row.params as { mode?: unknown; message?: unknown; requestedSchema?: unknown };
  if (params.mode !== 'form' || typeof params.message !== 'string') return null;
  const message = params.message.trim();
  if (!message || !allowedText(message)) return null;
  const fields = parseFields(params.requestedSchema);
  if (!fields) return null;
  return { id, message, fields };
}

/** A form the user can fill. Anything else, including a poisoned message, is unsupported. */
export function parseExternalMcpInputRequired(result: unknown): ExternalMcpInputForm | null {
  if (!result || typeof result !== 'object') return null;
  const raw = result as {
    resultType?: unknown;
    inputRequests?: unknown;
    requestState?: unknown;
  };
  if (raw.resultType !== 'input_required') return null;
  if (
    !raw.inputRequests ||
    typeof raw.inputRequests !== 'object' ||
    Array.isArray(raw.inputRequests)
  ) {
    return null;
  }
  const entries = Object.entries(raw.inputRequests as Record<string, unknown>);
  if (entries.length === 0 || entries.length > REQUEST_CAP) return null;
  const requests: ExternalMcpInputRequest[] = [];
  for (const [id, request] of entries) {
    const parsed = parseRequest(id, request);
    if (!parsed) return null;
    requests.push(parsed);
  }
  if (raw.requestState !== undefined && typeof raw.requestState !== 'string') return null;
  return {
    requests,
    ...(typeof raw.requestState === 'string' ? { requestState: raw.requestState } : {}),
  };
}

export function mcpInputFieldKey(requestId: string, fieldName: string): string {
  return `${requestId}.${fieldName}`;
}

/** Missing a required field returns null so the card stays up. */
export function buildExternalMcpInputResponses(
  form: ExternalMcpInputForm,
  values: Record<string, string>,
): ExternalMcpInputResponses | null {
  const responses: ExternalMcpInputResponses = {};
  for (const request of form.requests) {
    const content: Record<string, string> = {};
    for (const field of request.fields) {
      const value = (values[mcpInputFieldKey(request.id, field.name)] ?? '').trim();
      if (field.required && value.length === 0) return null;
      if (value.length > 0) content[field.name] = value;
    }
    responses[request.id] = { action: 'accept', content };
  }
  return responses;
}
