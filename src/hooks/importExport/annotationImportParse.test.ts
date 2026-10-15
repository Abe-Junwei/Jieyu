// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseAnnotationImport } from './annotationImportParse';

const noProject = {
  activeTextId: null,
  getActiveTextId: async () => null,
  importOptions: undefined,
};

describe('parseAnnotationImport', () => {
  it('marks an EAF file and keeps its media name with the shared utterance', async () => {
    const parsed = await parseAnnotationImport({
      ...noProject,
      name: 'speech.eaf',
      fileName: 'speech.eaf',
      text: `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="speech.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./speech.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="phrase" LINGUISTIC_TYPE_REF="default-lt" PARTICIPANT="Ada">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true"/>
</ANNOTATION_DOCUMENT>`,
    });
    expect(parsed).toMatchObject({
      format: 'eaf',
      units: [{ transcription: 'hello' }],
    });
    if (!('format' in parsed) || parsed.format !== 'eaf') return;
    expect(parsed.eaf.mediaFilename).toContain('speech.wav');
    expect(parsed.eaf.participants).toContain('Ada');
    expect('textGrid' in parsed).toBe(false);
  });

  it('marks a TextGrid file and keeps the tier language on the shared metadata', async () => {
    const parsed = await parseAnnotationImport({
      ...noProject,
      name: 'speech.textgrid',
      fileName: 'speech.textgrid',
      text: `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription__jieyu_meta_%7B%22languageId%22%3A%22ara%22%7D"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "hello"
`,
    });
    expect(parsed).toMatchObject({
      format: 'textgrid',
      transcriptionTierName: 'transcription',
      units: [{ transcription: 'hello' }],
    });
    if (!('format' in parsed) || parsed.format !== 'textgrid') return;
    expect(parsed.tierMetadata.get('transcription')).toMatchObject({ languageId: 'ara' });
    expect(parsed.textGrid.losses ?? []).toEqual([]);
    expect('eaf' in parsed).toBe(false);
  });

  it('rejects an unknown extension before any format result exists', async () => {
    await expect(
      parseAnnotationImport({
        ...noProject,
        name: 'notes.docx',
        fileName: 'notes.docx',
        text: 'hello',
      }),
    ).resolves.toEqual({ unsupported: true });
  });
});
