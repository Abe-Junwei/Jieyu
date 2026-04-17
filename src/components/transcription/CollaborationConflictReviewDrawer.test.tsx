// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CollaborationRecord, ConflictDescriptor } from '../../collaboration/collaborationConflictRuntime';
import type { ArbitrationTicket } from '../../collaboration/collaborationRulesRuntime';
import type { CollaborationProjectChangeRecord } from '../../collaboration/cloud/syncTypes';
import type { CloudSyncConflictReviewTicket } from '../../hooks/useTranscriptionCloudSyncActions';
import { renderWithLocale } from '../../test/localeTestUtils';
import { CollaborationConflictReviewDrawer } from './CollaborationConflictReviewDrawer';

afterEach(() => {
  cleanup();
});

function createTicket(ticketId: string, conflictCodes: string[]): CloudSyncConflictReviewTicket {
  const conflicts: ConflictDescriptor[] = [
    {
      scope: 'session',
      code: 'session-concurrency-overlap',
      message: 'Concurrent edits detected in overlapping session windows.',
    },
  ];

  const localRecord: CollaborationRecord = {
    entityId: 'u-1',
    sessionId: 'local-session',
    version: 2,
    updatedAt: Date.now() - 2000,
    fields: {
      value: 'local value',
    },
  };

  const remoteRecord: CollaborationRecord = {
    entityId: 'u-1',
    sessionId: 'remote-session',
    version: 3,
    updatedAt: Date.now(),
    fields: {
      value: 'remote value',
    },
  };

  const remoteChange: CollaborationProjectChangeRecord = {
    id: `change-${ticketId}`,
    projectId: 'project-1',
    actorId: 'remote-user',
    clientId: 'remote-client',
    clientOpId: `op-${ticketId}`,
    protocolVersion: 1,
    projectRevision: 10,
    baseRevision: 9,
    entityType: 'layer_unit_content',
    entityId: 'u-1',
    opType: 'upsert_unit_content',
    payload: {
      unitId: 'u-1',
      value: 'remote value',
    },
    sourceKind: 'user',
    createdAt: new Date().toISOString(),
  };

  const arbitration: ArbitrationTicket = {
    ticketId,
    entityId: 'u-1',
    operatorId: 'remote-user',
    localSessionId: 'local-session',
    remoteSessionId: 'remote-session',
    createdAt: Date.now(),
    prioritizedConflicts: [
      {
        conflict: conflicts[0]!,
        priority: 'high',
        rank: 1,
        signature: 'session:session-concurrency-overlap:*',
      },
    ],
    decision: {
      accepted: true,
      selectedStrategy: 'manual-review',
      reason: 'Manual review required for high-risk overlap.',
    },
    note: 'inbound:upsert_unit_content',
  };

  return {
    ticketId,
    entityType: 'layer_unit_content',
    entityId: 'u-1',
    createdAt: Date.now(),
    priority: 'high',
    conflictCodes,
    remoteChange,
    localRecord,
    remoteRecord,
    conflicts,
    arbitration,
  };
}

describe('CollaborationConflictReviewDrawer i18n', () => {
  it('renders zh-CN labels and actions', async () => {
    renderWithLocale(
      <CollaborationConflictReviewDrawer
        tickets={[createTicket('ticket-zh', ['session:session-concurrency-overlap:*'])]}
        onApplyRemote={vi.fn()}
        onKeepLocal={vi.fn()}
        onPostpone={vi.fn()}
      />,
      'zh-CN',
    );

    const headerButton = screen.getByRole('button', { name: /冲突审查/i });
    await waitFor(() => {
      expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    });

    expect(await screen.findByText('高')).toBeTruthy();
    expect(screen.getByRole('button', { name: '应用远端' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '保留本地' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '稍后处理' })).toBeTruthy();
  });

  it('renders en-US labels and empty conflict-code fallback', async () => {
    renderWithLocale(
      <CollaborationConflictReviewDrawer
        tickets={[createTicket('ticket-en', [])]}
        onApplyRemote={vi.fn()}
        onKeepLocal={vi.fn()}
        onPostpone={vi.fn()}
      />,
      'en-US',
    );

    const headerButton = screen.getByRole('button', { name: /Conflict Review/i });
    await waitFor(() => {
      expect(headerButton.getAttribute('aria-expanded')).toBe('true');
    });

    expect(await screen.findByText('High')).toBeTruthy();
    expect(screen.getByText('No conflict code details available.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply Remote' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep Local' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy();
  });
});