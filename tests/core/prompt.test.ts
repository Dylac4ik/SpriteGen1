import { describe, expect, it } from 'vitest';
import { analyzePrompt, splitClauses } from '../../src/core/prompt/analyze';
import { appendToPrompt, composeFinalPrompt, DEFAULT_TECHNICAL } from '../../src/core/prompt/compose';

const base = { negativePrompt: '', size: 32 as const, transparent: true };
const section = (a: ReturnType<typeof analyzePrompt>, key: string) => a.sections.find((s) => s.key === key)!;
const ids = (a: ReturnType<typeof analyzePrompt>) => a.issues.map((i) => i.id);

describe('prompt analysis — style', () => {
  it('warns and requires confirmation when no style is given', () => {
    const a = analyzePrompt({ ...base, prompt: 'a knight with a red cape' });
    expect(a.style.status).toBe('missing');
    expect(a.needsStyleConfirmation).toBe(true);
    expect(ids(a)).toContain('style-missing');
    expect(a.suggestions.some((s) => s.section === 'style')).toBe(true);
  });

  it('flags generic "pixel art" as too vague', () => {
    const a = analyzePrompt({ ...base, prompt: 'pixel art knight' });
    expect(a.style.status).toBe('vague');
    expect(ids(a)).toContain('style-vague');
  });

  it('accepts concrete styles', () => {
    for (const p of [
      '16-bit SNES-era knight, side view',
      'Game Boy style frog',
      'knight, hi-bit pixel art with dithered shading',
      'PICO-8 style mushroom',
      'cel-shaded wizard sprite',
    ]) {
      const a = analyzePrompt({ ...base, prompt: p });
      expect(a.style.status, p).toBe('concrete');
      expect(a.needsStyleConfirmation).toBe(false);
    }
  });

  it('accepts an explicit labeled style line with real description', () => {
    const a = analyzePrompt({ ...base, prompt: 'Subject: a potion bottle\nStyle: chunky retro look with bold blocky shapes' });
    expect(a.style.status).toBe('concrete');
    expect(section(a, 'style').source).toBe('labeled');
    expect(section(a, 'subject').items).toEqual(['a potion bottle']);
  });

  it('suggestions are size-aware', () => {
    const small = analyzePrompt({ ...base, size: 8, prompt: 'a coin' });
    const large = analyzePrompt({ ...base, size: 256, prompt: 'a coin' });
    expect(small.suggestions.find((s) => s.section === 'style')!.text).toMatch(/1-bit|Game Boy|8-bit/);
    expect(large.suggestions.find((s) => s.section === 'style')!.text).toMatch(/hi-bit/);
  });
});

describe('prompt analysis — sections', () => {
  const a = analyzePrompt({
    ...base,
    prompt: 'a knight with a red cape, 16-bit SNES-era pixel art, side view facing right, idle stance, limited 12-color palette, lit from the top-left, 1px black outline, transparent background, walk cycle keyframe',
  });

  it('classifies each clause into its section', () => {
    expect(section(a, 'subject').items).toContain('a knight with a red cape');
    expect(section(a, 'style').items.join(' ')).toMatch(/16-bit/);
    expect(section(a, 'perspective').items.join(' ')).toMatch(/side view/);
    expect(section(a, 'pose').items.join(' ')).toMatch(/idle/);
    expect(section(a, 'palette').items.join(' ')).toMatch(/12-color/);
    expect(section(a, 'lighting').items.join(' ')).toMatch(/lit from the top-left/);
    expect(section(a, 'outline').items.join(' ')).toMatch(/outline/);
    expect(section(a, 'background').items.join(' ')).toMatch(/transparent/);
    expect(section(a, 'animation').items.join(' ')).toMatch(/walk cycle/);
    expect(section(a, 'technical').items.join(' ')).toMatch(/32×32/);
  });

  it('has no errors or conflicts for a complete prompt', () => {
    expect(a.hasErrors).toBe(false);
    expect(a.issues.filter((i) => i.severity !== 'info')).toEqual([]);
  });

  it('keeps the subject when it shares a clause with style words', () => {
    const b = analyzePrompt({ ...base, prompt: '16-bit knight holding a sword' });
    expect(section(b, 'subject').items).toEqual(['16-bit knight holding a sword']);
    expect(b.hasErrors).toBe(false);
  });

  it('errors on empty prompt or missing subject', () => {
    expect(analyzePrompt({ ...base, prompt: '   ' }).hasErrors).toBe(true);
    const noSubject = analyzePrompt({ ...base, prompt: '16-bit, side view, transparent background' });
    expect(ids(noSubject)).toContain('subject-missing');
  });
});

describe('prompt analysis — conflicts', () => {
  it('detects conflicting perspectives', () => {
    expect(ids(analyzePrompt({ ...base, prompt: '8-bit hero, side view, top-down' }))).toContain('conflict-perspective-side-top');
  });
  it('detects transparency vs scene background', () => {
    const a = analyzePrompt({ ...base, prompt: '8-bit hero on a forest background' });
    expect(ids(a)).toContain('conflict-background-transparent');
    expect(section(a, 'background').status).toBe('conflict');
  });
  it('detects transparent request with the setting off', () => {
    expect(ids(analyzePrompt({ ...base, transparent: false, prompt: '8-bit hero, transparent background' }))).toContain('conflict-transparent-setting');
  });
  it('detects realism terms, outline contradictions and size mismatch', () => {
    const a = analyzePrompt({ ...base, prompt: '16-bit robot, photorealistic, black outline, no outline, 64x64' });
    expect(ids(a)).toEqual(expect.arrayContaining(['conflict-realism', 'conflict-outline', 'conflict-size-64x64']));
  });
  it('detects terms present in both prompt and negative prompt', () => {
    expect(ids(analyzePrompt({ ...base, prompt: '8-bit cat with outline', negativePrompt: 'outline, blurry' }))).toContain('conflict-negative-outline');
  });
  it('warns about fine detail at tiny sizes', () => {
    expect(ids(analyzePrompt({ ...base, size: 8, prompt: '1-bit castle, highly detailed' }))).toContain('detail-too-small');
  });
});

describe('final prompt composition', () => {
  const input = { prompt: 'a knight, 16-bit pixel art', negativePrompt: 'blurry, text', size: 32 as const, transparent: true, technical: DEFAULT_TECHNICAL };

  it('appends visible technical constraints and keeps the negative prompt separate when supported', () => {
    const c = composeFinalPrompt(input, { supportsNegativePrompt: true, supportsNativeTransparency: true, maxPromptLength: 1000 });
    expect(c.prompt).toBe(
      'a knight, 16-bit pixel art. Single centered subject, fully in frame, clear silhouette that stays readable at 32x32 pixels, isolated on a transparent background.',
    );
    expect(c.negativePrompt).toBe('blurry, text');
    expect(c.appendedConstraints).toHaveLength(3);
  });

  it('merges the negative prompt when the provider has no negative field', () => {
    const c = composeFinalPrompt(input, { supportsNegativePrompt: false, supportsNativeTransparency: true, maxPromptLength: 1000 });
    expect(c.negativePrompt).toBeNull();
    expect(c.prompt.endsWith('Avoid: blurry, text.')).toBe(true);
    expect(c.notes.join(' ')).toMatch(/negative prompt/);
  });

  it('asks for a plain background when transparency is not native', () => {
    const c = composeFinalPrompt(input, { supportsNegativePrompt: true, supportsNativeTransparency: false, maxPromptLength: 1000 });
    expect(c.prompt).toMatch(/plain flat solid-color background/);
  });

  it('adds nothing when every constraint is toggled off and never adds a style', () => {
    const c = composeFinalPrompt(
      { ...input, negativePrompt: '', technical: { centered: false, readableAtSize: false, isolatedBackground: false } },
      { supportsNegativePrompt: true, supportsNativeTransparency: true, maxPromptLength: 1000 },
    );
    expect(c.prompt).toBe('a knight, 16-bit pixel art');
    const noStyle = composeFinalPrompt({ ...input, prompt: 'a knight' }, { supportsNegativePrompt: true, supportsNativeTransparency: true, maxPromptLength: 1000 });
    expect(noStyle.prompt).not.toMatch(/pixel art|bit|style/i);
  });

  it('reports prompts that exceed the provider limit', () => {
    expect(composeFinalPrompt(input, { supportsNegativePrompt: true, supportsNativeTransparency: true, maxPromptLength: 20 }).tooLong).toBe(true);
  });
});

describe('helpers', () => {
  it('appendToPrompt joins with sensible separators', () => {
    expect(appendToPrompt('a cat', 'side view')).toBe('a cat, side view');
    expect(appendToPrompt('a cat.', 'side view')).toBe('a cat. side view');
    expect(appendToPrompt('', 'side view')).toBe('side view');
  });
  it('splitClauses splits on commas, semicolons, newlines and sentence periods', () => {
    expect(splitClauses('a cat, side view; 3/4 view\nidle. 1.5x')).toEqual(['a cat', 'side view', '3/4 view', 'idle', '1.5x']);
  });
});

describe('prompt analysis — regressions', () => {
  it('keeps outline modifiers together and does not double-count them as technical', () => {
    const a = analyzePrompt({ ...base, prompt: 'a cat, 8-bit, 1px black outline' });
    expect(section(a, 'outline').items).toEqual(['1px black outline']);
    expect(section(a, 'technical').items.some((i) => i === '1px')).toBe(false);
  });

  it('does not treat "SNES-era pixel art" as a subject', () => {
    const a = analyzePrompt({ ...base, prompt: 'a red slime monster, 16-bit SNES-era pixel art, side view' });
    expect(section(a, 'subject').items).toEqual(['a red slime monster']);
  });
});
