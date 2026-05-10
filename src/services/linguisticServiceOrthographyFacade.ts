import { previewOrthographyBridge as previewOrthographyBridgeText } from '../utils/orthographyBridges';
import { loadOrthographyService } from './linguisticServiceLazyLoaders';
import type {
  ApplyOrthographyBridgeInput,
  CloneOrthographyToLanguageInput,
  CreateOrthographyBridgeInput,
  CreateOrthographyInput,
  GetActiveOrthographyBridgeInput,
  ListOrthographyBridgesSelector,
  ListOrthographyRecordsSelector,
  PreviewOrthographyBridgeInput,
  UpdateOrthographyBridgeInput,
  UpdateOrthographyInput,
} from './LinguisticService.orthography';
import type { OrthographyBridgeDocType, OrthographyDocType } from '../db';

export async function createOrthography(
  input: CreateOrthographyInput,
): Promise<OrthographyDocType> {
  return (await loadOrthographyService()).createOrthographyRecord(input);
}

export async function cloneOrthographyToLanguage(
  input: CloneOrthographyToLanguageInput,
): Promise<OrthographyDocType> {
  return (await loadOrthographyService()).cloneOrthographyRecordToLanguage(input);
}

export async function listOrthographies(
  selector: ListOrthographyRecordsSelector = {},
): Promise<OrthographyDocType[]> {
  return (await loadOrthographyService()).listOrthographyRecords(selector);
}

export async function updateOrthography(
  input: UpdateOrthographyInput,
): Promise<OrthographyDocType> {
  return (await loadOrthographyService()).updateOrthographyRecord(input);
}

export async function createOrthographyBridge(
  input: CreateOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType> {
  return (await loadOrthographyService()).createOrthographyBridgeRecord(input);
}

export async function listOrthographyBridges(
  selector: ListOrthographyBridgesSelector = {},
): Promise<OrthographyBridgeDocType[]> {
  return (await loadOrthographyService()).listOrthographyBridgeRecords(selector);
}

export async function updateOrthographyBridge(
  input: UpdateOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType> {
  return (await loadOrthographyService()).updateOrthographyBridgeRecord(input);
}

export async function deleteOrthographyBridge(id: string): Promise<void> {
  return (await loadOrthographyService()).deleteOrthographyBridgeRecord(id);
}

export async function getActiveOrthographyBridge(
  input: GetActiveOrthographyBridgeInput,
): Promise<OrthographyBridgeDocType | null> {
  return (await loadOrthographyService()).getActiveOrthographyBridgeRecord(input);
}

export async function applyOrthographyBridge(
  input: ApplyOrthographyBridgeInput,
): Promise<{ text: string; bridgeId?: string }> {
  return (await loadOrthographyService()).applyOrthographyBridgeRecord(input);
}

export function previewOrthographyBridge(input: PreviewOrthographyBridgeInput): string {
  return previewOrthographyBridgeText(input);
}
