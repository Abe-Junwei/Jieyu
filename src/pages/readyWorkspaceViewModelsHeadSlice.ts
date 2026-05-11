import type { BuildReadyWorkspaceViewModelsInputArgs } from './readyWorkspaceViewModelsInputBuilder';

type HeadFields = BuildReadyWorkspaceViewModelsInputArgs['head'];

export type ReadyWorkspaceViewModelsHeadSliceInput = Omit<HeadFields, 'importFileRef'> & {
  importExportController: { importFileRef: HeadFields['importFileRef'] };
};

/** Builds orchestrator `head` slice; `importFileRef` is taken from the capture/import controller. */
export function buildReadyWorkspaceViewModelsHeadSlice(
  input: ReadyWorkspaceViewModelsHeadSliceInput,
): HeadFields {
  const { importExportController, ...rest } = input;
  return {
    ...rest,
    importFileRef: importExportController.importFileRef,
  };
}
