import { describe, expect, it } from 'vitest';
import {
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldDraftMultiselectValue,
  parseCustomFieldOptionsEditorValue,
  serializeCustomFieldDraftValue,
} from './languageMetadataWorkspace.shared';

describe('languageMetadataWorkspace custom field helpers', () => {
  it('round-trips multiselect values that contain commas', () => {
    const encoded = serializeCustomFieldDraftValue(['Sichuan, China', 'Upper Yangtze']);
    expect(parseCustomFieldDraftMultiselectValue(encoded)).toEqual(['Sichuan, China', 'Upper Yangtze']);
  });

  it('keeps backward compatibility for legacy comma-delimited multiselect values', () => {
    expect(parseCustomFieldDraftMultiselectValue('alpha, beta')).toEqual(['alpha', 'beta']);
  });

  it('round-trips option editor values one line at a time', () => {
    const formatted = formatCustomFieldOptionsEditorValue(['Sichuan, China', 'Upper Yangtze']);
    expect(parseCustomFieldOptionsEditorValue(formatted)).toEqual(['Sichuan, China', 'Upper Yangtze']);
  });
});