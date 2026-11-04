import { SpriteSize, suggestedPaletteSize } from '../sizes';
import type { PromptIssue, PromptSuggestion, SectionKey, StyleStatus } from './analyze';

interface SuggestionInput {
  size: SpriteSize;
  transparent: boolean;
  styleStatus: StyleStatus;
  missing: Set<SectionKey>;
  issues: PromptIssue[];
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function make(section: SectionKey, text: string, rationale: string): PromptSuggestion {
  return { id: `${section}:${slug(text)}`, section, text, rationale };
}

/** Concrete, size-aware style examples. Offered as options only; never inserted automatically. */
export function styleSuggestions(size: SpriteSize): PromptSuggestion[] {
  const n = suggestedPaletteSize(size);
  const small = size <= 16;
  const large = size >= 128;
  const list: [string, string][] = small
    ? [
        [`1-bit monochrome pixel art, high contrast, bold silhouette`, 'Two colors read best at tiny sizes.'],
        [`Game Boy style pixel art, 4-color green palette, flat shading`, 'A fixed 4-tone palette keeps 8–16px sprites legible.'],
        [`8-bit NES-style pixel art, ${n}-color palette, 1px black outline`, 'Classic console constraints suit very small sprites.'],
      ]
    : large
      ? [
          [`hi-bit modern pixel art, selective outlines, soft dithered shading, ${n}-color palette`, 'Larger canvases can carry subtle shading.'],
          [`16-bit SNES-era pixel art, cel shading with 3 tones per color, dark outline`, 'A well-known look with clear rules.'],
          [`isometric pixel art, 2:1 projection, flat colors, clean 1px lines`, 'Isometric works well for props and tiles.'],
        ]
      : [
          [`16-bit SNES-era pixel art, ${n}-color palette, 1px dark outline, cel shading`, 'A concrete era + palette + outline + shading.'],
          [`PICO-8 style pixel art using the 16-color PICO-8 palette, flat shading`, 'A fixed palette gives consistent results.'],
          [`modern pixel art, selective outline (sel-out), 2-step shading`, 'Describes outline and shading explicitly.'],
        ];
  return list.map(([t, r]) => make('style', t, r));
}

export function buildSuggestions(input: SuggestionInput): PromptSuggestion[] {
  const out: PromptSuggestion[] = [];
  const n = suggestedPaletteSize(input.size);
  if (input.styleStatus !== 'concrete') out.push(...styleSuggestions(input.size));
  if (input.missing.has('perspective')) {
    out.push(make('perspective', 'side view, facing right', 'Typical for platformer characters.'));
    out.push(make('perspective', 'front-facing 3/4 view', 'Typical for RPG characters and items.'));
    out.push(make('perspective', 'top-down view', 'Typical for top-down games and tiles.'));
  }
  if (input.missing.has('pose')) {
    out.push(make('pose', 'idle standing pose', 'A neutral pose is the usual first frame.'));
    out.push(make('pose', 'mid-stride walking pose', 'Useful as a walk-cycle keyframe.'));
  }
  if (input.missing.has('palette')) {
    out.push(make('palette', `limited ${n}-color palette`, `About ${n} colors reads well at ${input.size}×${input.size}.`));
  }
  if (input.missing.has('lighting')) {
    out.push(make('lighting', 'lit from the top-left, 2-step shading', 'A consistent light direction improves readability.'));
  }
  if (input.missing.has('outline')) {
    out.push(make('outline', '1px dark outline', 'Outlines separate the sprite from any background.'));
    out.push(make('outline', 'no outline', 'State it explicitly if you want an outline-free look.'));
  }
  if (input.missing.has('background')) {
    out.push(make('background', 'plain solid-color background', 'Simplifies later background removal.'));
  }
  if (input.issues.some((i) => i.id === 'detail-too-small')) {
    out.push(make('subject', 'simple bold silhouette, one or two defining features', `Detail does not survive at ${input.size}×${input.size}.`));
  }
  if (input.issues.some((i) => i.id === 'conflict-transparent-setting')) {
    // Informational: the fix is a setting, not prompt text, so no insertion is offered here.
  }
  return out;
}
