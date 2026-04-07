import { describe, expect, it } from 'vitest';
import {
  buildAdministrativeDivisionDisplayLine,
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldDraftMultiselectValue,
  parseAdministrativeDivisionText,
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

describe('languageMetadataWorkspace administrative division helpers', () => {
  it('round-trips structured labeled values through the display helper', () => {
    const formatted = buildAdministrativeDivisionDisplayLine('zh-CN', {
      country: '中国',
      province: '四川省',
      city: '成都市',
      county: '郫都区',
    });

    expect(parseAdministrativeDivisionText(formatted)).toEqual([
      {
        country: '中国',
        province: '四川省',
        city: '成都市',
        county: '郫都区',
      },
    ]);
  });

  it('parses both English labeled text and slash-delimited legacy text', () => {
    expect(parseAdministrativeDivisionText('Country: China / State: Sichuan / City: Chengdu')).toEqual([
      {
        country: 'China',
        province: 'Sichuan',
        city: 'Chengdu',
      },
    ]);

    expect(parseAdministrativeDivisionText('Province / State: Yunnan / City: Kunming')).toEqual([
      {
        province: 'Yunnan',
        city: 'Kunming',
      },
    ]);

    expect(parseAdministrativeDivisionText('China / Sichuan / Chengdu')).toEqual([
      {
        freeText: 'China / Sichuan / Chengdu',
      },
    ]);
  });

  it('falls back to free text when labeled and unlabeled segments are mixed', () => {
    expect(parseAdministrativeDivisionText('Country: China / Sichuan / City: Chengdu')).toEqual([
      {
        freeText: 'Country: China / Sichuan / City: Chengdu',
      },
    ]);
  });

  it('keeps arbitrary slash-delimited notes as free text to avoid silent semantic reinterpretation', () => {
    expect(parseAdministrativeDivisionText('Upper Yangtze / Eastern slope')).toEqual([
      {
        freeText: 'Upper Yangtze / Eastern slope',
      },
    ]);
  });
});