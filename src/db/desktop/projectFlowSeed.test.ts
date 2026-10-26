import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const outFile = process.env.JIEYU_DESKTOP_FLOW_OUT;

describe.skipIf(outFile === undefined)('desktop project flow seed', () => {
  it('writes a synthetic project and releases the folder lock', () => {
    const folder = mkdtempSync(join(tmpdir(), 'jieyu-m4c-'));
    writeFileSync(join(folder, 'clip.wav'), wavSilence(2));
    try {
      const session = openDesktopSession(folder, [folder]);
      const media = callDesktopSession(session.sessionId, 'media.create', {
        relpath: 'clip.wav',
        sha256: 'clip',
        duration: 2,
      }) as { id: string };
      const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
        title: { und: 'Clip' },
        mediaId: media.id,
      }) as { id: string };
      const layer = callDesktopSession(session.sessionId, 'layers.create', {
        manuscriptId: manuscript.id,
        key: 'tx',
        name: { und: 'Transcription' },
        tierType: 'time-aligned',
        contentType: 'transcription',
      }) as { id: string };
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: layer.id,
        startTime: 0,
        endTime: 0.4,
        text: 'one',
      });
      callDesktopSession(session.sessionId, 'units.create', {
        layerId: layer.id,
        startTime: 0.4,
        endTime: 0.8,
        text: 'two',
      });
      resetDesktopSessions();
      writeFileSync(outFile ?? '', folder, 'utf8');
      expect(folder).toContain('jieyu-m4c-');
    } catch (error) {
      resetDesktopSessions();
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  });
});

function wavSilence(seconds: number): Buffer {
  const sampleRate = 8000;
  const dataSize = seconds * sampleRate * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}
