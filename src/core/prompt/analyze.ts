import { SpriteSize, suggestedPaletteSize } from '../sizes';
import {
  ANIMATION,
  BACKGROUND,
  BACKGROUND_NEUTRAL,
  CHARACTER_HINT,
  COLOR_WORDS,
  DETAIL_HEAVY,
  LIGHTING,
  NON_SUBJECT_WORDS,
  NO_OUTLINE,
  OUTLINE,
  PALETTE,
  PERSPECTIVE_CONFLICTS,
  PERSPECTIVE_GROUPS,
  POSE,
  REALISM,
  SECTION_LABEL_ALIASES,
  STYLE_CONCRETE,
  STYLE_GENERIC,
  TECHNICAL,
  TRANSPARENT_WORDS,
} from './lexicon';
import { buildSuggestions } from './suggestions';

export const SECTION_KEYS = [
  'subject',
  'style',
  'perspective',
  'pose',
  'palette',
  'lighting',
  'outline',
  'background',
  'animation',
  'technical',
  'negative',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  subject: 'Subject & defining features',
  style: 'Art / pixel style',
  perspective: 'Camera angle & perspective',
  pose: 'Pose / action',
  palette: 'Palette',
  lighting: 'Lighting & shading',
  outline: 'Outline',
  background: 'Background & transparency',
  animation: 'Animation / game role',
  technical: 'Technical constraints',
  negative: 'Negative prompt',
};

export type SectionStatus = 'ok' | 'missing' | 'vague' | 'conflict' | 'optional';

export interface PromptSection {
  key: SectionKey;
  label: string;
  items: string[];
  source: 'labeled' | 'detected' | 'settings' | 'none';
  status: SectionStatus;
}

export interface PromptIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  section: SectionKey;
  message: string;
}

export interface PromptSuggestion {
  id: string;
  section: SectionKey;
  /** Text the user may append to their prompt. Never applied automatically. */
  text: string;
  rationale: string;
}

export type StyleStatus = 'concrete' | 'vague' | 'missing';

export interface PromptAnalysis {
  sections: PromptSection[];
  issues: PromptIssue[];
  suggestions: PromptSuggestion[];
  style: { status: StyleStatus; matched: string[] };
  /** True when generation must not proceed (e.g. empty subject). */
  hasErrors: boolean;
  /** True when the user must confirm before generating (no or vague style). */
  needsStyleConfirmation: boolean;
}

export interface AnalyzeInput {
  prompt: string;
  negativePrompt: string;
  size: SpriteSize;
  transparent: boolean;
}

export const MAX_PROMPT_LENGTH = 4000;
export const MAX_NEGATIVE_LENGTH = 2000;

const compile = (sources: string[]) => sources.map((s) => new RegExp(s, 'gi'));
const RX = {
  styleConcrete: compile(STYLE_CONCRETE),
  styleGeneric: compile(STYLE_GENERIC),
  realism: compile(REALISM),
  pose: compile(POSE),
  palette: compile(PALETTE),
  lighting: compile(LIGHTING),
  outline: compile(OUTLINE),
  background: compile(BACKGROUND),
  animation: compile(ANIMATION),
  technical: compile(TECHNICAL),
  perspective: Object.fromEntries(Object.entries(PERSPECTIVE_GROUPS).map(([k, v]) => [k, compile(v)])) as Record<string, RegExp[]>,
};
const COLOR_RX = new RegExp(`\\b(?:${Object.keys(COLOR_WORDS).join('|')})\\b`, 'gi');

interface Span {
  start: number;
  end: number;
  text: string;
}

function findSpans(text: string, regexes: RegExp[]): Span[] {
  const spans: Span[] = [];
  for (const rx of regexes) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      if (m[0].length === 0) {
        rx.lastIndex++;
        continue;
      }
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  return spans;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
}

/** Splits free text into clauses on commas, semicolons, newlines and sentence-ending periods. */
export function splitClauses(text: string): string[] {
  return text
    .split(/[,;\n]|\.(?=\s|$)|\s+[-–—]\s+/)
    .map((c) => c.trim().replace(/^(?:and|with)\s+/i, ''))
    .filter((c) => c.length > 0);
}

interface ClauseInfo {
  text: string;
  matches: Partial<Record<SectionKey | 'realism' | 'styleGeneric', Span[]>>;
  perspectiveGroups: string[];
  hasSubjectContent: boolean;
}

function classifyClause(text: string): ClauseInfo {
  const matches: ClauseInfo['matches'] = {};
  const add = (key: keyof ClauseInfo['matches'], spans: Span[]) => {
    if (spans.length) matches[key] = spans;
  };
  add('style', findSpans(text, RX.styleConcrete));
  add('styleGeneric', findSpans(text, RX.styleGeneric));
  add('realism', findSpans(text, RX.realism));
  add('pose', findSpans(text, RX.pose));
  add('palette', findSpans(text, RX.palette));
  add('lighting', findSpans(text, RX.lighting));
  add('outline', findSpans(text, RX.outline));
  add('background', findSpans(text, RX.background));
  add('animation', findSpans(text, RX.animation));
  add('technical', findSpans(text, RX.technical));
  const perspectiveGroups: string[] = [];
  const perspectiveSpans: Span[] = [];
  for (const [group, regexes] of Object.entries(RX.perspective)) {
    const spans = findSpans(text, regexes);
    if (spans.length) {
      perspectiveGroups.push(group);
      perspectiveSpans.push(...spans);
    }
  }
  add('perspective', perspectiveSpans);

  // Catch-all sections drop phrases that are part of a longer match elsewhere
  // (e.g. "1px" inside "1px black outline" is not a separate technical constraint).
  // Style patterns intentionally overlap palette/lighting wording ("12-color palette", "cel shading"), so they never suppress.
  const others = (key: string) =>
    Object.entries(matches)
      .filter(([k]) => k !== key && k !== 'style' && k !== 'styleGeneric')
      .flatMap(([, v]) => v as Span[]);
  for (const key of ['technical', 'palette', 'lighting'] as const) {
    const spans = matches[key];
    if (!spans) continue;
    const kept = spans.filter((s) => !others(key).some((o) => o.start <= s.start && o.end >= s.end && o.end - o.start > s.end - s.start));
    if (kept.length) matches[key] = kept;
    else delete matches[key];
  }

  // Residual words decide whether the clause also describes the subject.
  const all = Object.values(matches).flat() as Span[];
  const colorSpans = findSpans(text, [COLOR_RX]);
  let residual = text;
  for (const s of [...all, ...colorSpans].sort((a, b) => b.start - a.start)) {
    residual = residual.slice(0, s.start) + ' '.repeat(s.end - s.start) + residual.slice(s.end);
  }
  // The background clause ("<thing> background") never contributes subject words.
  if (matches.background) residual = '';
  const words = residual
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 1 && !NON_SUBJECT_WORDS.has(w) && !/^\d+$/.test(w));
  return { text, matches, perspectiveGroups, hasSubjectContent: words.length > 0 };
}

function evaluateStyle(styleItems: string[], labeledStyle: string[], clauses: ClauseInfo[]): { status: StyleStatus; matched: string[] } {
  const concrete = clauses.flatMap((c) => (c.matches.style ?? []).map((s) => s.text));
  const generic = clauses.flatMap((c) => (c.matches.styleGeneric ?? []).map((s) => s.text));
  // A labeled "Style:" line with several non-generic words counts as an explicit, concrete description.
  for (const value of labeledStyle) {
    const stripped = value.replace(/pixel[- ]?art|pixel(?:ated)?|sprite|retro|style|game|art/gi, ' ');
    const words = stripped.split(/\s+/).filter((w) => w.length > 2);
    if (words.length >= 2) concrete.push(value);
    else generic.push(value);
  }
  if (concrete.length) return { status: 'concrete', matched: uniq(concrete) };
  if (generic.length || styleItems.length) return { status: 'vague', matched: uniq([...generic, ...styleItems]) };
  return { status: 'missing', matched: [] };
}

export function analyzePrompt(input: AnalyzeInput): PromptAnalysis {
  const prompt = input.prompt ?? '';
  const negative = input.negativePrompt ?? '';
  const items: Record<SectionKey, string[]> = Object.fromEntries(SECTION_KEYS.map((k) => [k, []])) as unknown as Record<SectionKey, string[]>;
  const sources: Partial<Record<SectionKey, PromptSection['source']>> = {};
  const issues: PromptIssue[] = [];
  const labeledStyle: string[] = [];
  const clauses: ClauseInfo[] = [];

  // 1. Labeled lines ("Style: ...") are taken verbatim.
  const freeLines: string[] = [];
  for (const line of prompt.split('\n')) {
    const m = /^\s*([A-Za-z][A-Za-z /&-]{1,30}?)\s*:\s*(.+)$/.exec(line);
    const key = m ? (SECTION_LABEL_ALIASES[m[1].trim().toLowerCase()] as SectionKey | undefined) : undefined;
    if (m && key) {
      items[key].push(m[2].trim());
      sources[key] = 'labeled';
      if (key === 'style') labeledStyle.push(m[2].trim());
      // Labeled values still participate in conflict detection.
      for (const c of splitClauses(m[2])) clauses.push(classifyClause(c));
    } else freeLines.push(line);
  }

  // 2. Free text is split into clauses and classified by keyword lexicons.
  const freeClauses = splitClauses(freeLines.join('\n')).map(classifyClause);
  clauses.push(...freeClauses);
  const mixedSections: SectionKey[] = ['style', 'perspective', 'pose', 'palette', 'lighting', 'outline', 'background', 'animation', 'technical'];
  for (const c of freeClauses) {
    const matchedKeys = mixedSections.filter((k) => c.matches[k]);
    if (c.matches.styleGeneric && !c.matches.style) matchedKeys.push('style');
    for (const key of matchedKeys) {
      // A clause that is only about this section is shown whole; mixed clauses show the matched phrase.
      const onlyThis = matchedKeys.length === 1 && !c.hasSubjectContent;
      const spans = key === 'style' ? [...(c.matches.style ?? []), ...(c.matches.styleGeneric ?? [])] : (c.matches[key] ?? []);
      if (onlyThis) items[key].push(c.text);
      else items[key].push(...spans.map((s) => s.text));
      sources[key] ??= 'detected';
    }
    if (c.hasSubjectContent) {
      items.subject.push(c.text);
      sources.subject ??= 'detected';
    }
  }
  // Colors mentioned anywhere count toward the palette description.
  const colorMentions = uniq(findSpans(prompt, [COLOR_RX]).map((s) => s.text.toLowerCase()));
  if (colorMentions.length && items.palette.length === 0) {
    items.palette.push(`Colors mentioned: ${colorMentions.join(', ')}`);
    sources.palette ??= 'detected';
  }

  // Settings-derived technical constraints.
  items.technical.push(`Native size: ${input.size}×${input.size} px (selected)`);
  items.technical.push(`Transparent background: ${input.transparent ? 'on' : 'off'} (setting)`);
  sources.technical ??= 'settings';

  // Negative prompt.
  items.negative = splitClauses(negative);
  if (items.negative.length) sources.negative = 'labeled';

  for (const k of SECTION_KEYS) items[k] = uniq(items[k]);

  // 3. Validation.
  const trimmed = prompt.trim();
  if (!trimmed) {
    issues.push({ id: 'subject-empty', severity: 'error', section: 'subject', message: 'The prompt is empty. Describe the sprite you want.' });
  } else if (items.subject.length === 0) {
    issues.push({
      id: 'subject-missing',
      severity: 'error',
      section: 'subject',
      message: 'No subject found. Say what the sprite depicts (e.g. "a knight with a red cape").',
    });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    issues.push({ id: 'prompt-too-long', severity: 'error', section: 'subject', message: `Prompt is ${prompt.length} characters; the limit is ${MAX_PROMPT_LENGTH}.` });
  }
  if (negative.length > MAX_NEGATIVE_LENGTH) {
    issues.push({ id: 'negative-too-long', severity: 'error', section: 'negative', message: `Negative prompt is ${negative.length} characters; the limit is ${MAX_NEGATIVE_LENGTH}.` });
  }

  const style = evaluateStyle(items.style, labeledStyle, clauses);
  if (style.status === 'missing') {
    issues.push({
      id: 'style-missing',
      severity: 'warning',
      section: 'style',
      message: 'No visual style described. SpriteGen does not pick a style for you — add a concrete pixel-art style (era, palette approach, shading, outline).',
    });
  } else if (style.status === 'vague') {
    issues.push({
      id: 'style-vague',
      severity: 'warning',
      section: 'style',
      message: `Style is too generic (${style.matched.map((m) => `"${m}"`).join(', ')}). Name a concrete style such as an era/console, bit depth, shading or outline approach.`,
    });
  }

  // Conflicts.
  const allText = `${prompt}\n`;
  const lower = allText.toLowerCase();
  const realism = clauses.flatMap((c) => (c.matches.realism ?? []).map((s) => s.text));
  if (realism.length) {
    issues.push({
      id: 'conflict-realism',
      severity: 'warning',
      section: 'style',
      message: `Realism/rendering terms (${uniq(realism).join(', ')}) conflict with pixel art and will not survive conversion to ${input.size}×${input.size}.`,
    });
  }
  const groups = new Set(clauses.flatMap((c) => c.perspectiveGroups));
  for (const [a, b] of PERSPECTIVE_CONFLICTS) {
    if (groups.has(a) && groups.has(b)) {
      issues.push({
        id: `conflict-perspective-${a}-${b}`,
        severity: 'warning',
        section: 'perspective',
        message: `Conflicting camera angles: ${a === 'iso' ? 'isometric' : a} vs ${b === 'iso' ? 'isometric' : b} view. Pick one.`,
      });
    }
  }
  const outlineMentions = clauses.filter((c) => c.matches.outline);
  const noOutline = new RegExp(NO_OUTLINE, 'i');
  const negOutline = outlineMentions.filter((c) => noOutline.test(c.text));
  const posOutline = outlineMentions.filter((c) => !noOutline.test(c.text));
  if (negOutline.length && posOutline.length) {
    issues.push({ id: 'conflict-outline', severity: 'warning', section: 'outline', message: 'The prompt asks for both an outline and no outline.' });
  }

  const bgClauses = clauses.filter((c) => c.matches.background);
  const transparentRx = new RegExp(TRANSPARENT_WORDS, 'i');
  const neutralRx = new RegExp(BACKGROUND_NEUTRAL, 'i');
  const sceneBackground = bgClauses.filter((c) => !neutralRx.test(c.text) && /\b(?:background|backdrop|scenery|environment|bg)\b/i.test(c.text));
  const promptWantsTransparent = bgClauses.some((c) => transparentRx.test(c.text));
  if (input.transparent && sceneBackground.length) {
    issues.push({
      id: 'conflict-background-transparent',
      severity: 'warning',
      section: 'background',
      message: `Transparent background is on, but the prompt describes a background ("${sceneBackground[0].text}"). It will be removed or conflict with transparency.`,
    });
  }
  if (!input.transparent && promptWantsTransparent) {
    issues.push({
      id: 'conflict-transparent-setting',
      severity: 'warning',
      section: 'background',
      message: 'The prompt asks for a transparent background but the "Transparent background" setting is off. Turn it on to get real alpha.',
    });
  }

  // Size mentions that disagree with the selected size.
  const sizeRx = /\b(\d{1,4})\s*[x×]\s*(\d{1,4})\b/g;
  let sm: RegExpExecArray | null;
  while ((sm = sizeRx.exec(prompt))) {
    const w = Number(sm[1]);
    const h = Number(sm[2]);
    if (w !== input.size || h !== input.size) {
      issues.push({
        id: `conflict-size-${w}x${h}`,
        severity: 'warning',
        section: 'technical',
        message: `Prompt mentions ${w}×${h} but the selected output size is ${input.size}×${input.size}. The selected size is what will be produced.`,
      });
    }
  }
  const colorCountRx = /\b(\d{1,3})[- ]colou?rs?\b/gi;
  let cm: RegExpExecArray | null;
  while ((cm = colorCountRx.exec(prompt))) {
    const n = Number(cm[1]);
    const suggested = suggestedPaletteSize(input.size);
    if (n > input.size * input.size) {
      issues.push({ id: `palette-impossible-${n}`, severity: 'warning', section: 'palette', message: `${n} colors cannot fit in ${input.size}×${input.size} pixels.` });
    } else if (n > suggested * 3) {
      issues.push({
        id: `palette-large-${n}`,
        severity: 'info',
        section: 'palette',
        message: `${n} colors is a lot for ${input.size}×${input.size}; around ${suggested} usually reads better.`,
      });
    }
  }
  const monochrome = /\b(?:monochrome|1[- ]bit|black and white|grayscale|greyscale)\b/i.test(prompt);
  if (monochrome && colorMentions.filter((c) => !['black', 'white', 'gray', 'grey'].includes(c)).length >= 2) {
    issues.push({ id: 'conflict-monochrome', severity: 'warning', section: 'palette', message: 'The prompt asks for monochrome but also names several colors.' });
  }
  if (input.size <= 16 && new RegExp(DETAIL_HEAVY, 'i').test(prompt)) {
    issues.push({
      id: 'detail-too-small',
      severity: 'warning',
      section: 'subject',
      message: `Fine detail, text or many elements will not be readable at ${input.size}×${input.size}. Focus on a bold silhouette and 1–2 defining features.`,
    });
  }

  // Negative prompt overlaps.
  if (negative.trim()) {
    const negTerms = items.negative.map((t) => t.toLowerCase().replace(/^(?:no|without)\s+/, '')).filter((t) => t.length >= 3);
    for (const term of negTerms) {
      const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const hit = rx.exec(lower);
      if (hit && !new RegExp(`\\b(?:no|without)\\s+${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(lower)) {
        issues.push({
          id: `conflict-negative-${term}`,
          severity: 'warning',
          section: 'negative',
          message: `"${term}" appears in both the prompt and the negative prompt.`,
        });
      }
    }
  }

  // Optional sections that are missing.
  const isCharacter = new RegExp(CHARACTER_HINT, 'i').test(prompt);
  const optionalMissing: [SectionKey, boolean, string][] = [
    ['perspective', items.perspective.length === 0, 'No camera angle given (e.g. side view, top-down, 3/4).'],
    ['palette', items.palette.length === 0, 'No palette or colors described.'],
    ['lighting', items.lighting.length === 0, 'No lighting or shading direction described.'],
    ['outline', items.outline.length === 0, 'Outline treatment not specified.'],
    ['pose', isCharacter && items.pose.length === 0, 'Character sprite without a pose or action.'],
    ['background', !input.transparent && items.background.length === 0, 'Background not described and transparency is off.'],
  ];
  for (const [section, missing, message] of optionalMissing) {
    if (missing) issues.push({ id: `${section}-missing`, severity: 'info', section, message });
  }

  // 4. Section status.
  const sections: PromptSection[] = SECTION_KEYS.map((key) => {
    const sectionIssues = issues.filter((i) => i.section === key);
    let status: SectionStatus = items[key].length ? 'ok' : 'optional';
    if (key === 'style') status = style.status === 'concrete' ? 'ok' : style.status === 'vague' ? 'vague' : 'missing';
    if (key === 'subject' && items.subject.length === 0) status = 'missing';
    if (sectionIssues.some((i) => i.id.startsWith('conflict'))) status = 'conflict';
    return { key, label: SECTION_LABELS[key], items: items[key], source: items[key].length ? (sources[key] ?? 'detected') : 'none', status };
  });

  const suggestions = buildSuggestions({
    size: input.size,
    transparent: input.transparent,
    styleStatus: style.status,
    missing: new Set(issues.filter((i) => i.id.endsWith('-missing')).map((i) => i.section)),
    issues,
  });

  return {
    sections,
    issues,
    suggestions,
    style,
    hasErrors: issues.some((i) => i.severity === 'error'),
    needsStyleConfirmation: style.status !== 'concrete',
  };
}
