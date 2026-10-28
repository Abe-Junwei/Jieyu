/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopDeletionReminderDialog } from './DesktopDeletionReminderDialog';

describe('DesktopDeletionReminderDialog', () => {
  it('says removal leaves existing backups', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <DesktopDeletionReminderDialog items={[]} onShown={vi.fn()} onClose={vi.fn()} />
      </LocaleProvider>,
    );
    expect(screen.getByText('清除只删当前项目里的内容，已有备份还在')).toBeTruthy();
  });
});
