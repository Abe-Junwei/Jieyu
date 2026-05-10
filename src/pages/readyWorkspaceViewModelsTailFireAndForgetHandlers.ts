import type { ChangeEvent } from 'react';

import { fireAndForget } from '../utils/fireAndForget';

type ImportExportExportRunners = {
  handleExportEaf: () => unknown | Promise<unknown>;
  handleExportTextGrid: () => unknown | Promise<unknown>;
  handleExportTrs: () => unknown | Promise<unknown>;
  handleExportFlextext: () => unknown | Promise<unknown>;
  handleExportToolbox: () => unknown | Promise<unknown>;
};

type ProjectMediaImportRunner = {
  handleDirectMediaImport: (event: ChangeEvent<HTMLInputElement>) => unknown | Promise<unknown>;
};

/**
 * ViewModels `tail` 中与导出 / 直传媒体相关的 `fireAndForget` 包装，迁出编排壳以降低行数与重复治理点。
 */
export function buildReadyWorkspaceViewModelsTailFireAndForgetHandlers(input: {
  importExportController: ImportExportExportRunners;
  projectMediaController: ProjectMediaImportRunner;
}): {
  handleExportEaf: () => void;
  handleExportTextGrid: () => void;
  handleExportTrs: () => void;
  handleExportFlextext: () => void;
  handleExportToolbox: () => void;
  handleDirectMediaImport: (event: ChangeEvent<HTMLInputElement>) => void;
} {
  const { importExportController, projectMediaController } = input;

  return {
    handleExportEaf: () => {
      fireAndForget(Promise.resolve(importExportController.handleExportEaf()), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L35',
        policy: 'user-visible',
      });
    },
    handleExportTextGrid: () => {
      fireAndForget(Promise.resolve(importExportController.handleExportTextGrid()), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L41',
        policy: 'user-visible',
      });
    },
    handleExportTrs: () => {
      fireAndForget(Promise.resolve(importExportController.handleExportTrs()), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L47',
        policy: 'user-visible',
      });
    },
    handleExportFlextext: () => {
      fireAndForget(Promise.resolve(importExportController.handleExportFlextext()), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L53',
        policy: 'user-visible',
      });
    },
    handleExportToolbox: () => {
      fireAndForget(Promise.resolve(importExportController.handleExportToolbox()), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L59',
        policy: 'user-visible',
      });
    },
    handleDirectMediaImport: (event) => {
      fireAndForget(Promise.resolve(projectMediaController.handleDirectMediaImport(event)), {
        context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L65',
        policy: 'user-visible',
      });
    },
  };
}

export function buildAssistantRuntimeVoiceAnalysisFireAndForgetHandler(input: {
  handleVoiceAnalysisResult: (
    unitId: string | null,
    analysisText: string,
  ) => unknown | Promise<unknown>;
}): (unitId: string | null, analysisText: string) => void {
  return (unitId, analysisText) => {
    fireAndForget(Promise.resolve(input.handleVoiceAnalysisResult(unitId, analysisText)), {
      context: 'src/pages/readyWorkspaceViewModelsTailFireAndForgetHandlers.ts:L77',
      policy: 'user-visible',
    });
  };
}
