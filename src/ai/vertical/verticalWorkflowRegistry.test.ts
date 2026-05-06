import { describe, expect, it } from 'vitest';
import {
  VERTICAL_WORKFLOW_REGISTRY_V0,
  listVerticalWorkflowsV0,
  type VerticalWorkflowInputScope,
  type VerticalWorkflowOutputKind,
  type VerticalWorkflowWriteMode,
} from './verticalWorkflowRegistry';
import { zhCNDictionary } from '../../i18n/dictionaries/zh-CN';
import { enUSDictionary } from '../../i18n/dictionaries/en-US';

const VALID_INPUT_SCOPES: readonly VerticalWorkflowInputScope[] = [
  'current_segment',
  'selection',
  'corpus_source_set',
  'project',
];

const VALID_OUTPUT_KINDS: readonly VerticalWorkflowOutputKind[] = [
  'answer',
  'qa_findings',
  'lexeme_candidates',
  'export_plan',
  'fieldwork_note',
];

const VALID_WRITE_MODES: readonly VerticalWorkflowWriteMode[] = [
  'read_only',
  'propose_only',
  'confirm_required',
];

describe('verticalWorkflowRegistry drift guard', () => {
  it('every workflow labelKey exists in both i18n dictionaries', () => {
    const workflows = listVerticalWorkflowsV0();
    for (const wf of workflows) {
      expect(zhCNDictionary).toHaveProperty(wf.labelKey);
      expect(enUSDictionary).toHaveProperty(wf.labelKey);
    }
  });

  it('every workflow inputScope is within the valid enum', () => {
    const workflows = listVerticalWorkflowsV0();
    for (const wf of workflows) {
      expect(VALID_INPUT_SCOPES).toContain(wf.inputScope);
    }
  });

  it('every workflow outputKind is within the valid enum', () => {
    const workflows = listVerticalWorkflowsV0();
    for (const wf of workflows) {
      expect(VALID_OUTPUT_KINDS).toContain(wf.outputKind);
    }
  });

  it('every workflow writeMode is within the valid enum', () => {
    const workflows = listVerticalWorkflowsV0();
    for (const wf of workflows) {
      expect(VALID_WRITE_MODES).toContain(wf.writeMode);
    }
  });

  it('registry keys match workflow ids', () => {
    for (const [key, wf] of Object.entries(VERTICAL_WORKFLOW_REGISTRY_V0)) {
      expect(wf.id).toBe(key);
    }
  });
});
