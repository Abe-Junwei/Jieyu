import { useEffect, useMemo, useState } from 'react';
import type { CloudSyncConflictReviewTicket } from '../../hooks/useTranscriptionCloudSyncActions';
import { useLocale } from '../../i18n';
import { getCollaborationConflictReviewDrawerMessages } from '../../i18n/messages';

interface CollaborationConflictReviewDrawerProps {
  tickets: ReadonlyArray<CloudSyncConflictReviewTicket>;
  onApplyRemote: (ticketId: string) => void | Promise<void>;
  onKeepLocal: (ticketId: string) => void | Promise<void>;
  onPostpone: (ticketId: string) => void;
}

export function CollaborationConflictReviewDrawer({
  tickets,
  onApplyRemote,
  onKeepLocal,
  onPostpone,
}: CollaborationConflictReviewDrawerProps) {
  const locale = useLocale();
  const messages = getCollaborationConflictReviewDrawerMessages(locale);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingTicketId, setPendingTicketId] = useState('');

  useEffect(() => {
    if (tickets.length > 0) {
      setIsOpen(true);
    }
    if (pendingTicketId && !tickets.some((item) => item.ticketId === pendingTicketId)) {
      setPendingTicketId('');
    }
  }, [pendingTicketId, tickets]);

  const orderedTickets = useMemo(() => {
    return tickets.slice().sort((left, right) => right.createdAt - left.createdAt);
  }, [tickets]);

  if (tickets.length === 0) return null;

  const handleRun = async (ticketId: string, fn: (id: string) => void | Promise<void>) => {
    setPendingTicketId(ticketId);
    try {
      await fn(ticketId);
    } finally {
      setPendingTicketId('');
    }
  };

  return (
    <aside className={`collaboration-conflict-drawer ${isOpen ? 'is-open' : 'is-closed'}`} aria-live="polite">
      <button
        type="button"
        className="collaboration-conflict-drawer-head"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <span className="collaboration-conflict-drawer-title">{messages.title}</span>
        <span className="collaboration-conflict-drawer-badge" aria-label={messages.badgeAriaLabel(tickets.length)}>{tickets.length}</span>
      </button>

      {isOpen ? (
        <div className="collaboration-conflict-drawer-body">
          {orderedTickets.map((ticket) => {
            const isBusy = pendingTicketId === ticket.ticketId;
            return (
              <section className="collaboration-conflict-ticket" key={ticket.ticketId}>
                <header className="collaboration-conflict-ticket-head">
                  <strong>{messages.priorityLabel(ticket.priority)}</strong>
                  <span>{ticket.entityType}:{ticket.entityId}</span>
                </header>

                <p className="collaboration-conflict-ticket-summary">
                  {ticket.conflictCodes.join(', ') || messages.noConflictCodeDetails}
                </p>

                <div className="collaboration-conflict-ticket-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRun(ticket.ticketId, onApplyRemote);
                    }}
                  >
                    {messages.applyRemote}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isBusy}
                    onClick={() => {
                      void handleRun(ticket.ticketId, onKeepLocal);
                    }}
                  >
                    {messages.keepLocal}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={isBusy}
                    onClick={() => onPostpone(ticket.ticketId)}
                  >
                    {messages.later}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
