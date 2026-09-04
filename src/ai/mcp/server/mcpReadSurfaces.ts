/**
 * B12 inbound MCP read surfaces — resources (source-set URI) and prompts (A12 registry).
 * Flag off ⇒ Method not found (same as pre-B12).
 */

import { getDb } from '../../../db';
import { featureFlags } from '../../config/featureFlags';
import {
  getVerticalWorkflowV0,
  listVerticalWorkflowsV0,
  type VerticalWorkflowId,
  VERTICAL_WORKFLOW_REGISTRY_V0,
} from '../../vertical/verticalWorkflowRegistry';
import type { JsonRpcRequest } from './types';

export const SOURCE_SET_URI_PREFIX = 'jieyu://source-set/';

export type McpReadSurfaceOutcome =
  | { ok: true; result: unknown }
  | { ok: false; code: number; message: string };

export function isMcpReadSurfaceMethod(method: string): boolean {
  return (
    method === 'resources/list' ||
    method === 'resources/read' ||
    method === 'prompts/list' ||
    method === 'prompts/get'
  );
}

export function sourceSetResourceUri(id: string): string {
  return `${SOURCE_SET_URI_PREFIX}${id}`;
}

function parseSourceSetResourceId(uri: string): string | null {
  if (!uri.startsWith(SOURCE_SET_URI_PREFIX)) return null;
  const id = uri.slice(SOURCE_SET_URI_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

function isVerticalWorkflowId(name: string): name is VerticalWorkflowId {
  return Object.prototype.hasOwnProperty.call(VERTICAL_WORKFLOW_REGISTRY_V0, name);
}

async function listSourceSetResources(): Promise<McpReadSurfaceOutcome> {
  const db = await getDb();
  const rows = await db.collections.ai_source_sets.find().exec();
  const resources = rows
    .map((row) => row.toJSON())
    .filter((doc) => doc.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((doc) => ({
      uri: sourceSetResourceUri(doc.id),
      name: doc.name,
      description: `CorpusSourceSet snapshot (${doc.scope})`,
      mimeType: 'application/json',
    }));
  return { ok: true, result: { resources } };
}

async function readSourceSetResource(
  params: Record<string, unknown> | undefined,
): Promise<McpReadSurfaceOutcome> {
  const uri = typeof params?.uri === 'string' ? params.uri : '';
  const id = parseSourceSetResourceId(uri);
  if (!id) {
    return {
      ok: false,
      code: -32602,
      message: 'Invalid params: uri must be jieyu://source-set/{id}',
    };
  }
  const db = await getDb();
  const row = await db.collections.ai_source_sets.findOne({ selector: { id } }).exec();
  if (!row) {
    return { ok: false, code: -32002, message: 'Resource not found' };
  }
  const snapshot = row.toJSON();
  return {
    ok: true,
    result: {
      contents: [
        {
          uri: sourceSetResourceUri(snapshot.id),
          mimeType: 'application/json',
          text: JSON.stringify(snapshot),
        },
      ],
    },
  };
}

function listWorkflowPrompts(): McpReadSurfaceOutcome {
  const prompts = listVerticalWorkflowsV0().map((workflow) => ({
    name: workflow.id,
    description: `${workflow.id}: ${workflow.outputKind} (${workflow.writeMode})`,
  }));
  return { ok: true, result: { prompts } };
}

function getWorkflowPrompt(params: Record<string, unknown> | undefined): McpReadSurfaceOutcome {
  const name = typeof params?.name === 'string' ? params.name : '';
  if (!isVerticalWorkflowId(name)) {
    return { ok: false, code: -32602, message: 'Invalid params: unknown prompt name' };
  }
  const workflow = getVerticalWorkflowV0(name);
  const text = [
    `Run Jieyu vertical workflow ${workflow.id}.`,
    `inputScope=${workflow.inputScope}`,
    `outputKind=${workflow.outputKind}`,
    `writeMode=${workflow.writeMode}`,
  ].join(' ');
  return {
    ok: true,
    result: {
      description: `${workflow.id}: ${workflow.outputKind} (${workflow.writeMode})`,
      messages: [{ role: 'user', content: { type: 'text', text } }],
    },
  };
}

export async function handleMcpReadSurface(
  request: JsonRpcRequest,
): Promise<McpReadSurfaceOutcome> {
  if (!featureFlags.aiMcpResourcesArtifactsEnabled) {
    return { ok: false, code: -32601, message: `Method not found: ${request.method}` };
  }
  switch (request.method) {
    case 'resources/list':
      return listSourceSetResources();
    case 'resources/read':
      return readSourceSetResource(request.params);
    case 'prompts/list':
      return listWorkflowPrompts();
    case 'prompts/get':
      return getWorkflowPrompt(request.params);
    default:
      return { ok: false, code: -32601, message: `Method not found: ${request.method}` };
  }
}
