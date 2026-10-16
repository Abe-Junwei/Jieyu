/**
 * 每日 JYM 备份的恢复演练：合成的可播放 WAV 导出后再恢复，字节和采样都还在。
 * macOS 上再交给系统的 afinfo 打开。不使用本机语料。
 */
import 'fake-indexeddb/auto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { exportProjectToJym, restoreJymAsNewProject } from './JymService';
import { sha256Hex } from './projectArchiveContainer';

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => true,
  listCollaboratedIds: () => [],
}));

const NOW = '2026-10-16T05:00:00.000Z';
const RATE = 8000;
const SAMPLES = Array.from(
  { length: RATE / 10 },
  (_, index) => Math.round(Math.sin((2 * Math.PI * 440 * index) / RATE) * 1000) || 0,
);

function pcmWav(samples: readonly number[]): Uint8Array {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataBytes, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

function readPcm(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  expect(text(0, 4)).toBe('RIFF');
  expect(text(8, 4)).toBe('WAVE');
  let offset = 12;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataBytes = size;
      break;
    }
    offset += 8 + size;
  }
  expect(dataOffset).toBeGreaterThan(0);
  const samples: number[] = [];
  for (let index = 0; index < dataBytes; index += 2) {
    samples.push(view.getInt16(dataOffset + index, true));
  }
  return samples;
}

const WAV = pcmWav(SAMPLES);

describe('JYM restore keeps playable audio', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    const wavBytes = new ArrayBuffer(WAV.byteLength);
    new Uint8Array(wavBytes).set(WAV);
    const blob = new Blob([wavBytes], { type: 'audio/wav' });
    await db.texts.put({
      id: 'pA',
      title: { default: 'Project pA' },
      defaultDocumentId: 'pA-doc',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.annotation_documents.put({
      id: 'pA-doc',
      textId: 'pA',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.media_items.put({
      id: 'pA-media',
      textId: 'pA',
      filename: 'tone.wav',
      duration: 0.1,
      details: { audioBlob: blob },
      isOfflineCached: true,
      timelineKind: 'acoustic',
      byteLocation: 'managed',
      availability: 'available',
      contentSize: blob.size,
      contentSha256: await sha256Hex(WAV),
      createdAt: NOW,
    });
  });

  it('restores the same samples from a JYM backup', async () => {
    const archive = await exportProjectToJym('pA');
    const restored = await restoreJymAsNewProject(archive);
    const media = (await db.media_items.where('textId').equals(restored.projectId).toArray())[0];
    const blob = media?.details?.['audioBlob'];
    expect(blob).toBeInstanceOf(Blob);
    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(WAV));
    expect(readPcm(bytes)).toEqual(SAMPLES);

    if (process.platform === 'darwin') {
      const dir = mkdtempSync(join(tmpdir(), 'jieyu-wav-'));
      try {
        const file = join(dir, 'restored.wav');
        writeFileSync(file, bytes);
        const info = spawnSync('afinfo', [file], { encoding: 'utf8' });
        expect(info.status).toBe(0);
        expect(info.stdout).toContain('8000 Hz');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
