// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { AiChangeSetPreview } from './AiChangeSetPreview';

describe('AiChangeSetPreview', () => {
  it('renders changeset rows', () => {
    render(
      <LocaleProvider locale="en-US">
        <AiChangeSetPreview
          changeSet={{
            id: 'cs-1',
            description: 'Apply AI edits',
            changes: [{ unitId: 'seg-1', field: 'text', before: 'a', after: 'b' }],
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('ai-changeset-preview').textContent).toContain('Apply AI edits');
    expect(screen.getByText(/seg-1/).textContent).toContain('seg-1');
  });

  it('hides action buttons when showActions is false', () => {
    const { container } = render(
      <LocaleProvider locale="en-US">
        <AiChangeSetPreview
          showActions={false}
          changeSet={{
            id: 'cs-2',
            description: 'X',
            changes: [{ unitId: 'u', field: 'f', before: '', after: 'y' }],
          }}
        />
      </LocaleProvider>,
    );
    expect(container.querySelector('.ai-changeset-preview-actions')).toBeNull();
  });
});
