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
  proposeEafTierRoles,
  readEafTierRoles,
  type EafTierRole,
} from '../../utils/eafTierRole';
import {
  shapeFlexForTierRoles,
  shapeTextGridForTierRoles,
  shapeToolboxForTierRoles,
  type InterchangeNoteSegment,
} from '../../utils/interchangeTierRoles';

export type AnnotationImportParseOptions = {
  promptForEafTierRoles?: boolean;
  tierRolesAcknowledged?: boolean;
  tierRoles?: Readonly<Record<string, EafTierRole>>;
};

export type ParsedAnnotationImport = {
  eafResult: EafImportResult | null;
  tgResult: TextGridImportResult | null;
  trsResult: TrsImportResult | null;
  flexResult: FlexImportResult | null;
  toolboxResult: ToolboxImportResult | null;
  roleExtraTranscriptionTiers: EafTranscriptionTier[];
  roleNoteSegments: InterchangeNoteSegment[];
};

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
        !fileHasRoles
      ) {
        const prompt = proposeEafTierRoles(
          [...eafResult.tierConstraints.entries()]
            .filter(([, info]) => !info.symbolicSubdivision)
            .map(([tierId, info]) => ({
              tierId,
              ...(info.parentTierId ? { parentTierId: info.parentTierId } : {}),
            })),
        );
        if (prompt) throw new EafTierRolesRequiredError(fileName, prompt);
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

  return {
    eafResult,
    tgResult,
    trsResult,
    flexResult,
    toolboxResult,
    roleExtraTranscriptionTiers,
    roleNoteSegments,
  };
}
