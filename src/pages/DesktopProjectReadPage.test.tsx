// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { LocaleProvider } from '../i18n';
import { DesktopProjectReadPage } from './DesktopProjectReadPage';

afterEach(() => {
  delete (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop;
});

function renderPage() {
  return render(
    <LocaleProvider locale="en-US">
      <MemoryRouter initialEntries={['/desktop-project']}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/desktop-project" element={<DesktopProjectReadPage />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe('DesktopProjectReadPage', () => {
  it('does not read the folder library through Dexie', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/DesktopProjectReadPage.tsx'), 'utf8');
    const view = readFileSync(join(process.cwd(), 'src/pages/DesktopProjectReadView.tsx'), 'utf8');
    expect(page.includes('dexie') || page.includes('Dexie') || page.includes('getDb')).toBe(false);
    expect(page.includes('storageCall')).toBe(false);
    expect(view.includes('dexie') || view.includes('Dexie') || view.includes('getDb')).toBe(false);
  });

  it('stays on the home page when the internal branch is off', () => {
    renderPage();
    expect(screen.getByText('home')).toBeTruthy();
  });

  it('opens a folder once and seeks the recording from a unit', async () => {
    const calls: string[] = [];
    const host: DesktopReadHost = {
      projectReadEnabled: true,
      chooseDesktopFolder: () => {
        calls.push('choose');
        return Promise.resolve({ sessionId: 'session-1' });
      },
      desktopCall: (_sessionId, method) => {
        calls.push(method);
        if (method === 'manuscripts.list') {
          return Promise.resolve([
            { id: 'ms-1', title: { zh: '文稿' }, mediaId: 'media-1', createdAt: '', updatedAt: '' },
          ]);
        }
        if (method === 'layers.list') {
          return Promise.resolve([
            {
              id: 'layer-1',
              manuscriptId: 'ms-1',
              key: 'tx',
              name: { zh: '转写' },
              tierType: 'time-aligned',
              contentType: 'transcription',
              languageId: null,
              orthographyId: null,
              parentId: null,
              sortOrder: 0,
              createdAt: '',
              updatedAt: '',
            },
          ]);
        }
        if (method === 'units.updateText') return Promise.resolve({});
        if (method === 'units.list') {
          return Promise.resolve([
            {
              id: 'unit-1',
              layerId: 'layer-1',
              speakerId: null,
              parentUnitId: null,
              startTime: 0.4,
              endTime: 1.2,
              createdAt: '',
              updatedAt: '',
              text: '句子',
            },
          ]);
        }
        return Promise.reject(new Error('unexpected'));
      },
      desktopMediaUrl: () => {
        calls.push('media-url');
        return Promise.resolve({ url: 'jieyu-media://local/token' });
      },
    };
    (globalThis as { jieyuDesktop?: DesktopReadHost }).jieyuDesktop = host;
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Open folder' }));
    expect(await screen.findByRole('button', { name: '文稿' })).toBeTruthy();
    const unit = screen.getByRole('button', { name: '0.4–1.2 句子' });
    const audio = screen.getByLabelText('Recording') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('jieyu-media://local/token');
    fireEvent.click(unit);
    expect(audio.currentTime).toBe(0.4);
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: '改过' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save text' }));
    expect(calls.filter((call) => call === 'choose')).toEqual(['choose']);
    expect(calls.filter((call) => call === 'units.updateText')).toEqual(['units.updateText']);
  });
});
