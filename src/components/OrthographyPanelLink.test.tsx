// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrthographyPanelLink } from './OrthographyPanelLink';
import { AssetPanelProvider, type AssetPanelContextValue } from '../contexts/AssetPanelContext';

describe('OrthographyPanelLink', () => {
  it('calls openPanel with the orthography panel path when clicked inside AssetPanelProvider', () => {
    const openPanel = vi.fn();
    const ctx: AssetPanelContextValue = { openPanel };

    render(
      <AssetPanelProvider value={ctx}>
        <OrthographyPanelLink>打开正字法管理器</OrthographyPanelLink>
      </AssetPanelProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开正字法管理器' }));

    expect(openPanel).toHaveBeenCalledWith('/assets/orthographies');
  });

  it('falls back to an anchor link when rendered outside AssetPanelProvider', () => {
    cleanup();

    render(
      <OrthographyPanelLink orthographyId="orth-bridge" fromLayerId="layer_trc_bridge">
        打开正字法桥接工作台
      </OrthographyPanelLink>,
    );

    const link = screen.getByRole('link', { name: '打开正字法桥接工作台' });
    expect(link.getAttribute('href')).toBe('/assets/orthographies?orthographyId=orth-bridge&fromLayerId=layer_trc_bridge');
  });
});