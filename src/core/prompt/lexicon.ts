/** Keyword lexicons used by the smart prompt analyzer (and color words by the mock generator). */

export const COLOR_WORDS: Record<string, { h: number; s: number; l: number }> = {
  red: { h: 0, s: 0.75, l: 0.48 },
  crimson: { h: 348, s: 0.8, l: 0.42 },
  scarlet: { h: 5, s: 0.85, l: 0.48 },
  ruby: { h: 340, s: 0.75, l: 0.42 },
  maroon: { h: 0, s: 0.6, l: 0.3 },
  orange: { h: 28, s: 0.9, l: 0.52 },
  amber: { h: 40, s: 0.9, l: 0.5 },
  yellow: { h: 52, s: 0.9, l: 0.55 },
  gold: { h: 45, s: 0.8, l: 0.5 },
  golden: { h: 45, s: 0.8, l: 0.5 },
  lime: { h: 90, s: 0.75, l: 0.5 },
  green: { h: 125, s: 0.55, l: 0.42 },
  emerald: { h: 145, s: 0.65, l: 0.4 },
  olive: { h: 70, s: 0.45, l: 0.38 },
  teal: { h: 178, s: 0.6, l: 0.38 },
  turquoise: { h: 172, s: 0.65, l: 0.5 },
  cyan: { h: 188, s: 0.75, l: 0.5 },
  blue: { h: 215, s: 0.7, l: 0.5 },
  navy: { h: 225, s: 0.6, l: 0.28 },
  azure: { h: 205, s: 0.8, l: 0.55 },
  indigo: { h: 250, s: 0.55, l: 0.4 },
  purple: { h: 275, s: 0.55, l: 0.45 },
  violet: { h: 270, s: 0.6, l: 0.55 },
  lavender: { h: 265, s: 0.55, l: 0.72 },
  magenta: { h: 305, s: 0.7, l: 0.5 },
  pink: { h: 335, s: 0.75, l: 0.7 },
  brown: { h: 25, s: 0.45, l: 0.33 },
  tan: { h: 32, s: 0.4, l: 0.6 },
  beige: { h: 38, s: 0.4, l: 0.78 },
  bronze: { h: 30, s: 0.6, l: 0.4 },
  copper: { h: 20, s: 0.65, l: 0.45 },
  silver: { h: 210, s: 0.08, l: 0.72 },
  gray: { h: 220, s: 0.06, l: 0.5 },
  grey: { h: 220, s: 0.06, l: 0.5 },
  white: { h: 40, s: 0.1, l: 0.92 },
  black: { h: 240, s: 0.12, l: 0.1 },
};

/** Regex sources; each is compiled with the 'gi' flags. */
export const STYLE_CONCRETE: string[] = [
  String.raw`\b(?:1|2|4|8|16|32|64)[- ]?bit\b`,
  String.raw`\bhi[- ]?bit\b`,
  String.raw`\b(?:nes|snes|famicom|super famicom|game ?boy(?: color| advance)?|gbc|gba|nds|sega|genesis|mega drive|master system|game gear|c64|commodore(?: 64)?|zx spectrum|amiga|msx|pico-?8|tic-?80|ps1|playstation 1|neo[- ]?geo|cga|ega|vga|arcade cabinet|mode 7)(?:[- ](?:era|style|inspired|like|esque))?\b`,
  String.raw`\b(?:dither(?:ed|ing)?|checkerboard dither)\b`,
  String.raw`\bcel[- ]?shad(?:ed|ing)\b`,
  String.raw`\bflat (?:shading|colou?rs?)\b`,
  String.raw`\b(?:selective outlines?|sel-?out)\b`,
  String.raw`\bchibi\b`,
  String.raw`\bisometric pixel(?:[- ]art)?\b`,
  String.raw`\b(?:jrpg|rpg maker|metroidvania|roguelike|shmup|beat 'em up|point[- ]and[- ]click)\b`,
  String.raw`\b(?:modern|minimalist|minimal|chunky|crisp|clean|detailed|painterly|lo-?fi|low[- ]?fi|hand[- ]pixeled|hand[- ]drawn) pixel(?:[- ]?art)?\b`,
  String.raw`\b(?:anti[- ]?aliased|no anti[- ]?aliasing|aliased) pixel(?:[- ]?art)?\b`,
  String.raw`\bdouble[- ]pixel(?:ed)?\b`,
  String.raw`\b(?:\d{1,2}|two|three|four|five|six|eight|sixteen)[- ]colou?r palette\b`,
  String.raw`\b(?:monochrome|1[- ]bit|duotone|grayscale|greyscale) pixel(?:[- ]?art)?\b`,
  String.raw`\b(?:nes|snes|gba|game ?boy|pico-?8)[- ]style\b`,
  String.raw`\b(?:\d{2}s|eighties|nineties) (?:arcade|console|pc|computer|video ?game)\b`,
];

export const STYLE_GENERIC: string[] = [
  String.raw`\bpixel[- ]?art\b`,
  String.raw`\bpixel(?:ated|ized|ised)\b`,
  String.raw`\bpixel style\b`,
  String.raw`\bretro(?: style| look| game)?\b`,
  String.raw`\bsprite(?: art)?\b`,
  String.raw`\bvideo ?game (?:art|style)\b`,
  String.raw`\bgame art\b`,
  String.raw`\b(?:cool|nice|cute|good|beautiful|awesome|pretty|amazing) (?:style|look)\b`,
];

export const REALISM: string[] = [
  String.raw`\bphoto(?:real(?:istic)?|graph(?:ic|y)?)\b`,
  String.raw`\bhyper[- ]?realistic\b`,
  String.raw`\brealistic\b`,
  String.raw`\b3d render(?:ed|ing)?\b`,
  String.raw`\b(?:octane|unreal engine|ray[- ]?trac(?:ed|ing)|blender render)\b`,
  String.raw`\b(?:bokeh|depth of field|cinematic lighting)\b`,
  String.raw`\b(?:4k|8k|uhd)\b`,
  String.raw`\b(?:oil painting|watercolou?r|vector art|smooth gradients?|soft gradients?)\b`,
];

export const PERSPECTIVE_GROUPS: Record<string, string[]> = {
  side: [String.raw`\bside[- ]?(?:view|on|scroller)\b`, String.raw`\bprofile(?: view)?\b`, String.raw`\bfacing (?:left|right)\b`],
  front: [String.raw`\bfront(?:al)?[- ]?(?:view|facing)\b`, String.raw`\bfacing (?:the )?(?:camera|viewer|forward)\b`],
  back: [String.raw`\b(?:back|rear)[- ]view\b`, String.raw`\bfrom behind\b`],
  top: [String.raw`\btop[- ]?down\b`, String.raw`\boverhead\b`, String.raw`\bbird'?s[- ]eye\b`],
  iso: [String.raw`\bisometric\b`, String.raw`\b2:1 (?:projection|isometric)\b`],
  threeQuarter: [String.raw`\b(?:3/4|three[- ]quarters?)(?: view| top[- ]down)?\b`],
  ortho: [String.raw`\borthographic\b`],
  angle: [String.raw`\b(?:low|high)[- ]angle\b`, String.raw`\bcamera angle\b`, String.raw`\bperspective\b`],
};

/** Perspective groups that contradict each other when used together. */
export const PERSPECTIVE_CONFLICTS: [string, string][] = [
  ['side', 'top'],
  ['side', 'front'],
  ['side', 'back'],
  ['front', 'back'],
  ['front', 'top'],
  ['back', 'top'],
  ['side', 'iso'],
  ['front', 'iso'],
];

export const POSE: string[] = [
  String.raw`\b(?:idle|standing|stands|walking|walks|walk|running|runs|run|jumping|jumps|jump|leaping|falling|crouching|crouched|kneeling|sitting|sits|lying|sleeping|climbing|swimming|flying|floating|hovering|dancing|dashing)\b`,
  String.raw`\b(?:attacking|attack|slashing|swinging|stabbing|punching|kicking|shooting|casting|blocking|defending|charging|aiming|throwing|dying|hurt|hit|victory|celebrating|waving|pointing)\b`,
  String.raw`\b(?:holding|wielding|carrying|raising|drawing) (?:a |an |the |his |her |their )?[a-z-]+\b`,
  String.raw`\b(?:pose|posing|action|stance|mid-?air)\b`,
];

export const PALETTE: string[] = [
  String.raw`\bpalette\b`,
  String.raw`\b\d{1,3}[- ]colou?rs?\b`,
  String.raw`\b(?:limited|restricted|reduced) colou?rs?\b`,
  String.raw`\bcolou?r scheme\b`,
  String.raw`\b(?:monochrome|monochromatic|grayscale|greyscale|duotone|sepia|black and white)\b`,
  String.raw`\b(?:pastel|vibrant|saturated|desaturated|muted|earthy|neon|warm|cool|jewel)(?: tones?| colou?rs?| hues?)?\b`,
  String.raw`\b(?:pico-?8|db16|db32|endesga|sweetie[- ]16|aap-64|resurrect) palette\b`,
];

export const LIGHTING: string[] = [
  String.raw`\blight(?:ing|s)?\b`,
  String.raw`\b(?:lit|light(?:ing|ed)?|illuminated) from (?:the )?(?:top|bottom|upper|lower|left|right|front|behind|above|below|side)(?:[- ](?:left|right))?\b`,
  String.raw`\blit from\b|\blit\b`,
  String.raw`\b(?:back|rim|top|side)[- ]?lit\b`,
  String.raw`\brim light\b`,
  String.raw`\b(?:shading|shaded|shadows?|highlights?|specular|glow(?:ing)?|ambient occlusion)\b`,
  String.raw`\b(?:sunlight|moonlight|torchlight|candlelight)\b`,
  String.raw`\blight source\b`,
];

export const OUTLINE: string[] = [
  String.raw`\b(?:(?:no|without)\s+)?(?:(?:\d+\s?px|thick|thin|bold|heavy|black|dark|white|colou?red|selective|soft|hard|clean|crisp|single|double|pixel|near-black)[- ]+){0,3}outlines?d?\b`,
  String.raw`\bline ?art\b`,
  String.raw`\bsel-?out\b`,
  String.raw`\boutline-?less\b`,
];
export const NO_OUTLINE = String.raw`\b(?:no|without) outlines?\b|\boutline-?less\b`;

export const BACKGROUND: string[] = [
  String.raw`\b(?:background|backdrop|bg|scenery|environment)\b`,
  String.raw`\btransparent\b`,
  String.raw`\bisolated\b`,
  String.raw`\b(?:alpha|cut-?out)\b`,
  String.raw`\bon (?:a |an )?(?:plain|white|black|solid|flat|grass|ground|floor)\b`,
];
/** Background descriptions that are compatible with a transparent output. */
export const BACKGROUND_NEUTRAL = String.raw`\b(?:transparent|no background|without (?:a )?background|isolated|alpha|cut-?out|plain|solid|flat|blank|empty|simple)\b`;
export const TRANSPARENT_WORDS = String.raw`\btransparent(?: background)?\b|\bno background\b|\balpha channel\b`;

export const ANIMATION: string[] = [
  String.raw`\b(?:animation|animated|keyframe|key frame|frame \d+|frames?|walk ?cycle|run ?cycle|idle animation|loop(?:ing|able)?|sprite ?sheet)\b`,
  String.raw`\b(?:icon|item|pickup|collectible|power-?up|prop|tile(?:able|set)?|terrain tile|ui element|button|portrait|avatar|projectile|particle|effect|vfx|cursor|emblem|badge)\b`,
  String.raw`\b(?:player character|playable character|enemy|npc|boss|mob|monster sprite|hero sprite)\b`,
];

export const TECHNICAL: string[] = [
  String.raw`\b\d{1,4}\s*[x×]\s*\d{1,4}\b`,
  String.raw`\b\d{1,4}\s?px\b`,
  String.raw`\b(?:resolution|pixel grid|grid-aligned|pixel-perfect|pixel perfect)\b`,
  String.raw`\b(?:centered|centred|center(?:ed)? in frame|fully in frame|full body|single (?:sprite|object|subject|character))\b`,
  String.raw`\b(?:no text|no watermark|no signature|no letters)\b`,
  String.raw`\b(?:hard edges|crisp edges|no anti[- ]?aliasing|nearest[- ]neighbou?r)\b`,
];

export const DETAIL_HEAVY = String.raw`\b(?:highly detailed|ultra detailed|intricate|lots of detail|fine detail|detailed (?:face|texture|background|scene)|text|lettering|words|logo|crowd|many characters)\b`;

export const CHARACTER_HINT = String.raw`\b(?:character|creature|monster|slime|knight|warrior|hero|heroine|wizard|mage|witch|robot|cat|dog|fox|bird|dragon|ghost|alien|goblin|orc|skeleton|zombie|person|man|woman|girl|boy|kid|player|enemy|npc|boss|bat|frog|owl|bear|rabbit|ninja|pirate|king|queen|princess|prince|elf|dwarf|beast|soldier|archer|rogue|samurai|villager|farmer)\b`;

/** Words that carry no subject meaning on their own (used to decide if a clause describes the subject). */
export const NON_SUBJECT_WORDS = new Set(
  (
    'a an the of with and or in on at to for from by as is are be very really slightly quite some ' +
    'soft hard strong subtle simple clean bright dark light high low small large big tiny huge style styled ' +
    'look looking vibe aesthetic art pixel pixels sprite sprites game video retro classic modern old new ' +
    'nice cool cute good great beautiful awesome pretty amazing detailed minimal minimalist one two three four ' +
    'view angle side front back top down bottom upper lower above below behind facing left right using use only no without colors colours color colour ' +
    'tones tone shading shaded lighting light lit please make draw create generate image picture render ' +
    'era inspired esque like based themed type kind version'
  ).split(/\s+/),
);

/** Aliases accepted for labeled lines such as "Style: 16-bit". */
export const SECTION_LABEL_ALIASES: Record<string, string> = {
  subject: 'subject',
  character: 'subject',
  object: 'subject',
  features: 'subject',
  'defining features': 'subject',
  description: 'subject',
  style: 'style',
  'art style': 'style',
  'pixel style': 'style',
  'pixel art style': 'style',
  'visual style': 'style',
  perspective: 'perspective',
  camera: 'perspective',
  'camera angle': 'perspective',
  view: 'perspective',
  angle: 'perspective',
  pose: 'pose',
  action: 'pose',
  'pose/action': 'pose',
  palette: 'palette',
  colors: 'palette',
  colours: 'palette',
  'color palette': 'palette',
  'colour palette': 'palette',
  lighting: 'lighting',
  light: 'lighting',
  shading: 'lighting',
  outline: 'outline',
  outlines: 'outline',
  background: 'background',
  bg: 'background',
  animation: 'animation',
  'animation role': 'animation',
  role: 'animation',
  usage: 'animation',
  technical: 'technical',
  constraints: 'technical',
  'technical constraints': 'technical',
};
