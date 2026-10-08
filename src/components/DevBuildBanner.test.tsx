// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DevBuildBanner } from './DevBuildBanner';
import { JIEYU_DATA_FROZEN } from '../config/dataFreeze';

afterEach(() => cleanup());

describe('DevBuildBanner (T56 / D14)', () => {
  it('is shown before the freeze point', () => {
    expect(JIEYU_DATA_FROZEN).toBe(false);
    render(<DevBuildBanner locale="zh-CN" />);
    expect(screen.getByTestId('app-dev-build-banner')).toHaveTextContent(
      '开发期版本：数据可能被重置',
    );
  });

  it('disappears once the freeze marker is true', () => {
    render(<DevBuildBanner locale="zh-CN" frozen />);
    expect(screen.queryByTestId('app-dev-build-banner')).not.toBeInTheDocument();
  });

  it('has an English variant', () => {
    render(<DevBuildBanner locale="en-US" />);
    expect(screen.getByRole('note')).toHaveTextContent('Development build: data may be reset');
  });
});
