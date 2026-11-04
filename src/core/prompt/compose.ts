import { SpriteSize } from '../sizes';

/** Neutral technical constraints the app can append. Each is individually toggleable and always shown. */
export interface TechnicalToggles {
  centered: boolean;
  readableAtSize: boolean;
  isolatedBackground: boolean;
}

export const DEFAULT_TECHNICAL: TechnicalToggles = { centered: true, readableAtSize: true, isolatedBackground: true };

export interface PromptCapabilities {
  supportsNegativePrompt: boolean;
  supportsNativeTransparency: boolean;
  maxPromptLength: number;
}

export interface ComposeInput {
  prompt: string;
  negativePrompt: string;
  size: SpriteSize;
  transparent: boolean;
  technical: TechnicalToggles;
}

export interface ComposedPrompt {
  /** Exact prompt string sent to the provider. */
  prompt: string;
  /** Exact negative prompt sent as a separate field, or null if none / merged. */
  negativePrompt: string | null;
  appendedConstraints: string[];
  notes: string[];
  tooLong: boolean;
}

export function technicalConstraintTexts(input: Pick<ComposeInput, 'size' | 'transparent' | 'technical'>, caps: Pick<PromptCapabilities, 'supportsNativeTransparency'>): string[] {
  const out: string[] = [];
  if (input.technical.centered) out.push('single centered subject, fully in frame');
  if (input.technical.readableAtSize) out.push(`clear silhouette that stays readable at ${input.size}x${input.size} pixels`);
  if (input.technical.isolatedBackground && input.transparent) {
    out.push(caps.supportsNativeTransparency ? 'isolated on a transparent background' : 'isolated on a plain flat solid-color background');
  }
  return out;
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();
}

function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * Builds the exact prompt sent to a provider. Used by both the prompt viewer (preview)
 * and the main-process generation service, so what the user sees is what is sent.
 */
export function composeFinalPrompt(input: ComposeInput, caps: PromptCapabilities): ComposedPrompt {
  const notes: string[] = [];
  const body = normalize(input.prompt);
  const negative = normalize(input.negativePrompt).replace(/\n+/g, ', ');
  const constraints = technicalConstraintTexts(input, caps);

  let prompt = body;
  if (constraints.length) {
    const sentence = constraints.join(', ');
    prompt = `${endSentence(prompt)} ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }

  let negativePrompt: string | null = null;
  if (negative) {
    if (caps.supportsNegativePrompt) negativePrompt = negative;
    else {
      prompt = `${endSentence(prompt)} Avoid: ${negative.replace(/[.]+$/, '')}.`;
      notes.push('This provider has no negative-prompt field, so the negative prompt was appended to the prompt as "Avoid: …".');
    }
  }
  if (input.transparent && !caps.supportsNativeTransparency) {
    notes.push('This provider cannot output transparency natively; the background will be removed during pixel conversion.');
  }
  const tooLong = prompt.length > caps.maxPromptLength;
  if (tooLong) notes.push(`Final prompt is ${prompt.length} characters; this provider accepts at most ${caps.maxPromptLength}.`);
  return { prompt, negativePrompt, appendedConstraints: constraints, notes, tooLong };
}

/** Appends user-accepted suggestion text to the prompt without otherwise touching it. */
export function appendToPrompt(prompt: string, addition: string): string {
  const base = prompt.replace(/\s+$/, '');
  const add = addition.trim();
  if (!add) return prompt;
  if (!base) return add;
  const sep = /[,.;:!?]$/.test(base) ? ' ' : base.includes('\n') && /^[A-Za-z ]+:/.test(add) ? '\n' : ', ';
  return `${base}${sep}${add}`;
}
