import { getDb } from '../../db';
import {
  importFromEaf,
  type EafImportResult,
  type EafTranscriptionTier,
} from '../../services/EafService';
import { importFromFlextext, type FlexImportResult } from '../../services/FlexService';
import { importFromTextGrid, type TextGridImportResult } from '../../services/TextGridService';
import { importFromToolbox, type ToolboxImportResult } from '../../services/ToolboxService';
import { importFromTrs, type TrsImportResult } from '../../services/TranscriberService';
import {
  EafTierRolesRequiredError,
  readEafTierRoles,
  type EafTierRole,
} from '../../utils/eafTierRole';
import type { InterchangeLoss } from '../../utils/interchangeLossReport';
import {
  shapeFlexForTierRoles,
  shapeTextGridForTierRoles,
  shapeToolboxForTierRoles,
  type InterchangeNoteSegment,
} from '../../utils/interchangeTierRoles';
import type { TimelineInteropMetadata } from '../../utils/timelineBindingExtent';

export type AnnotationImportParseOptions = {
  promptForEafTierRoles?: boolean;
  tierRolesAcknowledged?: boolean;
  tierRoles?: Readonly<Record<string, EafTierRole>>;
};

type AnnotationImportUnits =
  | EafImportResult['units']
  | TextGridImportResult['units']
  | TrsImportResult['units']
  | FlexImportResult['units']
  | ToolboxImportResult['units'];

type AnnotationImportShared = {
  units: AnnotationImportUnits;
  timelineMetadata?: TimelineInteropMetadata;
  losses: InterchangeLoss[];
  sourceLocale?: string;
  transcriptionTierName?: string;
  tierMetadata: EafImportResult['tierMetadata'];
  roleExtraTranscriptionTiers: EafTranscriptionTier[];
  roleNoteSegments: InterchangeNoteSegment[];
};

export type ParsedAnnotationImport =
  | (AnnotationImportShared & { format: 'eaf'; eaf: EafImportResult })
  | (AnnotationImportShared & { format: 'textgrid'; textGrid: TextGridImportResult })
  | (AnnotationImportShared & { format: 'trs'; trs: TrsImportResult })
  | (AnnotationImportShared & { format: 'flextext'; flex: FlexImportResult })
  | (AnnotationImportShared & { format: 'toolbox'; toolbox: ToolboxImportResult });

function sharedAnnotationImport(input: {
  units: AnnotationImportUnits;
  timelineMetadata?: TimelineInteropMetadata;
  losses?: InterchangeLoss[];
  sourceLocale?: string;
  transcriptionTierName?: string;
  tierMetadata?: EafImportResult['tierMetadata'];
  roleExtraTranscriptionTiers: EafTranscriptionTier[];
  roleNoteSegments: InterchangeNoteSegment[];
}): AnnotationImportShared {
  return {
    units: input.units,
    ...(input.timelineMetadata ? { timelineMetadata: input.timelineMetadata } : {}),
    losses: input.losses ?? [],
    ...(input.sourceLocale !== undefined ? { sourceLocale: input.sourceLocale } : {}),
    ...(input.transcriptionTierName !== undefined
      ? { transcriptionTierName: input.transcriptionTierName }
      : {}),
    tierMetadata: input.tierMetadata ?? new Map(),
    roleExtraTranscriptionTiers: input.roleExtraTranscriptionTiers,
    roleNoteSegments: input.roleNoteSegments,
  };
}

export async function parseAnnotationImport(input: {
  name: string;
  text: string;
  fileName: string;
  activeTextId: string | null;
  getActiveTextId: () => Promise<string | null>;
  importOptions: AnnotationImportParseOptions | undefined;
}): Promise<ParsedAnnotationImport | { unsupported: true }> {
  const { name, text, fileName, activeTextId, getActiveTextId, importOptions } = input;
  let eafResult: EafImportResult | null = null;
  let tgResult: TextGridImportResult | null = null;
  let trsResult: TrsImportResult | null = null;
  let flexResult: FlexImportResult | null = null;
  let toolboxResult: ToolboxImportResult | null = null;
  let roleExtraTranscriptionTiers: EafTranscriptionTier[] = [];
  let roleNoteSegments: InterchangeNoteSegment[] = [];
  const readTierRoleMetadata = async (): Promise<Record<string, unknown> | undefined> => {
    const earlyTextId = activeTextId ?? (await getActiveTextId());
    if (!earlyTextId) return undefined;
    const earlyDb = await getDb();
    const earlyText = await earlyDb.dexie.texts.get(earlyTextId);
    return (earlyText?.metadata as Record<string, unknown> | undefined) ?? undefined;
  };

  if (name.endsWith('.eaf')) {
    eafResult = importFromEaf(text);
    const earlyTextId = activeTextId ?? (await getActiveTextId());
    if (earlyTextId && eafResult) {
      const earlyDb = await getDb();
      const earlyText = await earlyDb.dexie.texts.get(earlyTextId);
      const savedRoles = readEafTierRoles(
        (earlyText?.metadata as Record<string, unknown> | undefined) ?? undefined,
      );
      const fileHasRoles = [...eafResult.tierMetadata.values()].some((meta) => Boolean(meta.role));
      if (importOptions?.tierRoles) {
        eafResult = importFromEaf(text, { tierRoles: importOptions.tierRoles });
      } else if (!fileHasRoles && savedRoles) {
        eafResult = importFromEaf(text, { tierRoles: savedRoles });
      } else if (
        importOptions?.promptForEafTierRoles &&
        !importOptions.tierRolesAcknowledged &&
        !fileHasRoles &&
        eafResult.tierRolePrompt
      ) {
        throw new EafTierRolesRequiredError(fileName, eafResult.tierRolePrompt);
      }
    }
  } else if (name.endsWith('.textgrid')) {
    const shaped = await shapeTextGridForTierRoles(
      importFromTextGrid(text),
      fileName,
      importOptions,
      readTierRoleMetadata,
    );
    tgResult = shaped.result;
    roleExtraTranscriptionTiers = shaped.extraTranscriptionTiers;
    roleNoteSegments = shaped.noteSegments;
  } else if (name.endsWith('.trs')) {
    trsResult = importFromTrs(text);
  } else if (name.endsWith('.flextext')) {
    const shaped = await shapeFlexForTierRoles(
      importFromFlextext(text),
      fileName,
      importOptions,
      readTierRoleMetadata,
    );
    flexResult = shaped.result;
    roleExtraTranscriptionTiers = shaped.extraTranscriptionTiers;
    roleNoteSegments = shaped.noteSegments;
  } else if (name.endsWith('.toolbox') || name.endsWith('.txt')) {
    const shaped = await shapeToolboxForTierRoles(
      importFromToolbox(text),
      fileName,
      importOptions,
      readTierRoleMetadata,
    );
    toolboxResult = shaped.result;
    roleExtraTranscriptionTiers = shaped.extraTranscriptionTiers;
    roleNoteSegments = shaped.noteSegments;
  } else {
    return { unsupported: true };
  }

  const roles = { roleExtraTranscriptionTiers, roleNoteSegments };
  if (eafResult) {
    return {
      format: 'eaf',
      eaf: eafResult,
      ...sharedAnnotationImport({
        units: eafResult.units,
        ...(eafResult.timelineMetadata ? { timelineMetadata: eafResult.timelineMetadata } : {}),
        ...(eafResult.losses ? { losses: eafResult.losses } : {}),
        ...(eafResult.defaultLocale !== undefined ? { sourceLocale: eafResult.defaultLocale } : {}),
        ...(eafResult.transcriptionTierName
          ? { transcriptionTierName: eafResult.transcriptionTierName }
          : {}),
        tierMetadata: eafResult.tierMetadata,
        ...roles,
      }),
    };
  }
  if (tgResult) {
    return {
      format: 'textgrid',
      textGrid: tgResult,
      ...sharedAnnotationImport({
        units: tgResult.units,
        ...(tgResult.timelineMetadata ? { timelineMetadata: tgResult.timelineMetadata } : {}),
        ...(tgResult.losses ? { losses: tgResult.losses } : {}),
        ...(tgResult.transcriptionTierName
          ? { transcriptionTierName: tgResult.transcriptionTierName }
          : {}),
        tierMetadata: tgResult.tierMetadata,
        ...roles,
      }),
    };
  }
  if (trsResult) {
    const speakerLocale = trsResult.speakers[0]?.lang;
    return {
      format: 'trs',
      trs: trsResult,
      ...sharedAnnotationImport({
        units: trsResult.units,
        ...(trsResult.timelineMetadata ? { timelineMetadata: trsResult.timelineMetadata } : {}),
        ...(trsResult.losses ? { losses: trsResult.losses } : {}),
        ...(speakerLocale !== undefined ? { sourceLocale: speakerLocale } : {}),
        ...roles,
      }),
    };
  }
  if (flexResult) {
    return {
      format: 'flextext',
      flex: flexResult,
      ...sharedAnnotationImport({
        units: flexResult.units,
        ...(flexResult.timelineMetadata ? { timelineMetadata: flexResult.timelineMetadata } : {}),
        ...(flexResult.losses ? { losses: flexResult.losses } : {}),
        ...(flexResult.sourceLanguage !== undefined
          ? { sourceLocale: flexResult.sourceLanguage }
          : {}),
        ...roles,
      }),
    };
  }
  if (toolboxResult) {
    return {
      format: 'toolbox',
      toolbox: toolboxResult,
      ...sharedAnnotationImport({
        units: toolboxResult.units,
        ...(toolboxResult.timelineMetadata
          ? { timelineMetadata: toolboxResult.timelineMetadata }
          : {}),
        ...(toolboxResult.losses ? { losses: toolboxResult.losses } : {}),
        ...roles,
      }),
    };
  }
  return { unsupported: true };
}
