import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImage, setPixel } from '../../src/core/image';
import { createFilterStep } from '../../src/core/filters';
import { DEFAULT_CONVERSION } from '../../src/core/pixelize';
import { DEFAULT_TECHNICAL } from '../../src/core/prompt/compose';
import type { ProjectData } from '../../src/shared/types';
import { parseProject, serializeProject } from '../../src/backend/project';
import { readProjectFile, writeProjectFile } from '../../src/main/projectIo';

function project(): ProjectData {
  const original = createImage(16, 16);
  setPixel(original, 3, 4, [10, 200, 30, 255]);
  const current = createImage(16, 16);
  setPixel(current, 5, 5, [1, 2, 3, 99]);
  return {
    name: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    history: [
      {
        id: 'g1',
        createdAt: '2026-01-01T00:00:00.000Z',
        providerId: 'mock',
        providerName: 'Mock',
        isMock: true,
        request: {
          providerId: 'mock',
          prompt: '16-bit knight',
          negativePrompt: 'blurry',
          size: 16,
          transparent: true,
          seed: 1234,
          variations: 1,
          params: { latencyMs: 0 },
          technical: DEFAULT_TECHNICAL,
          conversion: DEFAULT_CONVERSION,
        },
        finalPrompt: '16-bit knight. Single centered subject.',
        finalNegativePrompt: 'blurry',
        promptNotes: [],
        variations: [
          { id: 'v1', index: 0, seed: 1234, original, current, pipeline: [createFilterStep('outline'), createFilterStep('brightness', { amount: -20 })], notes: ['n'], sourceWidth: 512, sourceHeight: 512 },
        ],
      },
    ],
  };
}

describe('project files', () => {
  it('round-trips history, settings, seeds, filters and images', () => {
    const p = project();
    const { project: back, warnings } = parseProject(serializeProject(p));
    expect(warnings).toEqual([]);
    const rec = back.history[0];
    expect(rec.request).toEqual(p.history[0].request);
    expect(rec.finalPrompt).toBe(p.history[0].finalPrompt);
    const v = rec.variations[0];
    expect(v.seed).toBe(1234);
    expect(v.pipeline.map((s) => s.type)).toEqual(['outline', 'brightness']);
    expect(v.pipeline[1].params.amount).toBe(-20);
    expect(Buffer.from(v.original.data).equals(Buffer.from(p.history[0].variations[0].original.data))).toBe(true);
    expect(Buffer.from(v.current.data).equals(Buffer.from(p.history[0].variations[0].current.data))).toBe(true);
  });

  it('writes and reads files atomically', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    const path = join(dir, 'a.spritegen');
    await writeProjectFile(path, project());
    const opened = await readProjectFile(path);
    expect(opened.project.history).toHaveLength(1);
    expect(opened.path).toBe(path);
  });

  it('rejects corrupted files with clear errors', async () => {
    expect(() => parseProject('{not json')).toThrow(/not valid JSON/);
    expect(() => parseProject(JSON.stringify({ hello: 1 }))).toThrow(/not a SpriteGen project/);
    expect(() => parseProject(JSON.stringify({ format: 'spritegen-project', version: 99 }))).toThrow(/newer SpriteGen/);
    const good = JSON.parse(serializeProject(project()));
    good.history[0].request.size = 24;
    expect(() => parseProject(JSON.stringify(good))).toThrow(/damaged/);
    const badImg = JSON.parse(serializeProject(project()));
    badImg.history[0].variations[0].originalPng = 'AAAAAAAAAAAAAAAAAAAAAAAA';
    expect(() => parseProject(JSON.stringify(badImg))).toThrow(/corrupted/);
    const wrongSize = JSON.parse(serializeProject(project()));
    wrongSize.history[0].request.size = 32;
    expect(() => parseProject(JSON.stringify(wrongSize))).toThrow(/16×16, but the record says 32×32/);
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    writeFileSync(join(dir, 'x.spritegen'), 'garbage');
    await expect(readProjectFile(join(dir, 'x.spritegen'))).rejects.toMatchObject({ code: 'corrupted_project' });
    await expect(readProjectFile(join(dir, 'missing.spritegen'))).rejects.toMatchObject({ code: 'file_io' });
  });

  it('drops unknown filters with a warning instead of failing', () => {
    const file = JSON.parse(serializeProject(project()));
    file.history[0].variations[0].pipeline.push({ id: 'z', type: 'notAFilter', enabled: true, params: {} });
    const { project: back, warnings } = parseProject(JSON.stringify(file));
    expect(back.history[0].variations[0].pipeline).toHaveLength(2);
    expect(warnings[0]).toMatch(/unknown filter/);
  });
});
