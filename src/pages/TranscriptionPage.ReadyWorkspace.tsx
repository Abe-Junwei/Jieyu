/**
 * TranscriptionPage - Ready Workspace (chunk entry)
 *
 * Keeps `transcription-entry.css` on this module so the lazy route chunk loads styles with the same path.
 * 薄 body 见 `./TranscriptionPage.ReadyWorkspace.body`；重编排见 `./TranscriptionPage.ReadyWorkspaceOrchestrator` | Thin body + {@link TranscriptionPageReadyWorkspaceOrchestrator}.
 */

import '../styles/transcription-entry.css';

export { TranscriptionPageReadyWorkspace } from './TranscriptionPage.ReadyWorkspace.body';
