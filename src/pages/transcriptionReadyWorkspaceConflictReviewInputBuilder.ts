import type { BuildReadyWorkspaceConflictReviewDrawerPropsInput } from './transcriptionReadyWorkspacePropsBuilders';

export type BuildReadyWorkspaceConflictReviewDrawerPropsInputFromControllers = {
  tickets: BuildReadyWorkspaceConflictReviewDrawerPropsInput['tickets'];
  applyRemoteConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onApplyRemoteConflictTicket'];
  keepLocalConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onKeepLocalConflictTicket'];
  postponeConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onPostponeConflictTicket'];
};

export function buildReadyWorkspaceConflictReviewDrawerPropsInput(
  input: BuildReadyWorkspaceConflictReviewDrawerPropsInputFromControllers,
): BuildReadyWorkspaceConflictReviewDrawerPropsInput {
  return {
    tickets: input.tickets,
    onApplyRemoteConflictTicket: input.applyRemoteConflictTicket,
    onKeepLocalConflictTicket: input.keepLocalConflictTicket,
    onPostponeConflictTicket: input.postponeConflictTicket,
  };
}
