// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAppDataResilienceMessages } from '../../i18n/appDataResilienceMessages';
import { getSettingsModalMessages } from '../../i18n/settingsModalMessages';
import { SettingsDataTab } from './SettingsDataTab';

describe('SettingsDataTab', () => {
  it('names the map style and each cache clear control', () => {
    const msg = getSettingsModalMessages('zh-CN');
    render(
      <SettingsDataTab
        locale="zh-CN"
        msg={msg}
        resilienceMsg={getAppDataResilienceMessages('zh-CN')}
      />,
    );

    expect(screen.getByRole('combobox', { name: msg.dataMapStyleLabel })).toBeInTheDocument();
    for (const label of [
      msg.dataCacheFontCoverage,
      msg.dataCacheVad,
      msg.dataCacheLanguageCatalog,
      msg.dataCacheEmbeddingProvider,
    ]) {
      expect(
        screen.getByRole('button', { name: `${label} ${msg.dataClearBtn}` }),
      ).toBeInTheDocument();
    }
  });
});
