export const CANVAS_W = 640;
export const CANVAS_H = 480;
export const ARENA_H = 326;
export const UI_TOP = 326;

export const DEFAULT_KEYBINDS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['KeyZ', 'Enter', 'Space'],
  cancel: ['KeyX', 'ShiftLeft', 'ShiftRight'],
  menu: ['KeyC', 'Escape'],
};

export const DEFAULT_SETTINGS = {
  masterVolume: 0.85,
  musicVolume: 0.72,
  sfxVolume: 0.88,
  voiceClips: true,
  keybinds: JSON.parse(JSON.stringify(DEFAULT_KEYBINDS)),
  screenScale: 'fit', // 'fit' | '1x' | '2x'
  crtScanlines: false,
  screenShake: 'full', // 'full' | 'reduced' | 'off'
  bgSpin: 'normal', // 'normal' | 'reduced' | 'static'
  showFps: false,
  showHitbox: false,
  skipIntro: false,
  focusSlow: true, // hold Cancel to slow SOUL
  showBossStats: false, // optional exact HP / Tiredness display
  showDamageNumbers: true,
};

const SETTINGS_KEY = 'chaos_project_settings_v1';
const RECORDS_KEY = 'chaos_project_records_v1';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      keybinds: {
        ...structuredClone(DEFAULT_KEYBINDS),
        ...(parsed.keybinds || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    return raw ? JSON.parse(raw) : { normal: null, chaos: null };
  } catch {
    return { normal: null, chaos: null };
  }
}

export function saveRecord(mode, record) {
  try {
    const cur = loadRecords();
    const prev = cur[mode];
    if (!prev || record.turns < prev.turns || (record.turns === prev.turns && record.timeSec < prev.timeSec)) {
      cur[mode] = record;
    } else {
      cur[mode] = { ...prev, clears: (prev.clears || 1) + 1 };
    }
    localStorage.setItem(RECORDS_KEY, JSON.stringify(cur));
  } catch {}
}

export const MODE_CONFIG = {
  normal: {
    id: 'normal',
    name: 'NORMAL MODE',
    subtitle: 'Faithful Deltarune Chapter 1 Jevil Fight',
    musicKey: 'normal',
    jevilMaxHp: 3500,
    jevilAT: 10,
    jevilDF: 5,
    tiredThreshold: 9,
    phase5TurnPacify: 30,
    speedMult: 1.0,
    spawnMult: 1.0,
    damageMult: 1.0,
    bgTint: { a: '#00007a', b: '#000038', photoTint: 'rgba(18, 22, 92, 0.72)' },
    accentColor: '#66d9ff',
  },
  chaos: {
    id: 'chaos',
    name: 'CHAOS MODE',
    subtitle: 'True & Neo Chaos — Higher HP, Faster, +5 New Patterns',
    musicKey: 'chaos',
    jevilMaxHp: 5250,
    jevilAT: 13,
    jevilDF: 6,
    tiredThreshold: 12,
    phase5TurnPacify: 34,
    speedMult: 1.24,
    spawnMult: 1.26,
    damageMult: 1.28,
    bgTint: { a: '#62003a', b: '#22001d', photoTint: 'rgba(85, 8, 50, 0.68)' },
    accentColor: '#ff3c6e',
  },
};

export function createInitialParty() {
  return [
    {
      id: 'kris',
      name: 'KRIS',
      color: '#00ffff',
      barColor: '#00ffff',
      hp: 90,
      maxHp: 90,
      baseMaxHp: 90,
      at: 12,
      df: 5,
      mg: 0,
      x: 122,
      y: 132,
      actions: ['fight', 'act', 'item', 'spare', 'defend'],
      anim: 'idle',
      animFrame: 0,
      animTimer: 0,
      hurtTimer: 0,
      defending: false,
      queuedAction: null,
      iconKey: 'icons_kris',
    },
    {
      id: 'susie',
      name: 'SUSIE',
      color: '#ff00ff',
      barColor: '#ff00ff',
      hp: 110,
      maxHp: 110,
      baseMaxHp: 110,
      at: 16,
      df: 5,
      mg: 1,
      x: 126,
      y: 204,
      actions: ['fight', 'magic', 'item', 'spare', 'defend'],
      anim: 'idle',
      animFrame: 0,
      animTimer: 0,
      hurtTimer: 0,
      defending: false,
      queuedAction: null,
      iconKey: 'icons_susie',
    },
    {
      id: 'ralsei',
      name: 'RALSEI',
      color: '#00ff00',
      barColor: '#00ff00',
      hp: 70,
      maxHp: 70,
      baseMaxHp: 70,
      at: 10,
      df: 5,
      mg: 9,
      x: 128,
      y: 274,
      actions: ['fight', 'magic', 'item', 'spare', 'defend'],
      anim: 'idle',
      animFrame: 0,
      animTimer: 0,
      hurtTimer: 0,
      defending: false,
      queuedAction: null,
      iconKey: 'icons_ralsei',
    },
  ];
}

export function createInitialInventory() {
  return [
    { id: 'topcake', name: 'TopCake', desc: 'Heals team\n160 HP', target: 'all', heal: 160 },
    { id: 'clubssandwich', name: 'Clubssandwich', desc: 'Heals team\n30 HP', target: 'all', heal: 30 },
    { id: 'revivemint1', name: 'ReviveMint', desc: 'Heals fallen\nally to MAX', target: 'ally', revive: true },
    { id: 'revivemint2', name: 'ReviveMint', desc: 'Heals fallen\nally to MAX', target: 'ally', revive: true },
    { id: 'darkburger1', name: 'Darkburger', desc: 'Heals 70 HP', target: 'ally', heal: 70 },
    { id: 'darkburger2', name: 'Darkburger', desc: 'Heals 70 HP', target: 'ally', heal: 70 },
    { id: 'darkburger3', name: 'Darkburger', desc: 'Heals 70 HP', target: 'ally', heal: 70 },
    { id: 'darkburger4', name: 'Darkburger', desc: 'Heals 70 HP', target: 'ally', heal: 70 },
    { id: 'chocodiamond1', name: 'ChocoDiamond', desc: 'Heals 80 HP\n(Kris loves)', target: 'ally', healByChar: { kris: 80, susie: 30, ralsei: 30 } },
    { id: 'chocodiamond2', name: 'ChocoDiamond', desc: 'Heals 80 HP\n(Kris loves)', target: 'ally', healByChar: { kris: 80, susie: 30, ralsei: 30 } },
    { id: 'heartsdonut1', name: 'HeartsDonut', desc: 'Heals 80 HP\n(Susie loves)', target: 'ally', healByChar: { kris: 20, susie: 80, ralsei: 50 } },
    { id: 'heartsdonut2', name: 'HeartsDonut', desc: 'Heals 80 HP\n(Susie loves)', target: 'ally', healByChar: { kris: 20, susie: 80, ralsei: 50 } },
  ];
}

export const CREDITS_DATA = [
  {
    title: 'ORIGINAL GAME & INTELLECTUAL PROPERTY',
    lines: [
      'DELTARUNE created by Toby Fox, Temmie Chang & Team.',
      'Original Jevil boss concept, writing, characters, battle mechanics, and music ("The Circus" & "THE WORLD REVOLVING") by Toby Fox.',
      'Jevil character design by kanotynes & Toby Fox.',
    ],
  },
  {
    title: 'SPRITE RESOURCES (THE SPRITERS RESOURCE)',
    lines: [
      'Jevil Sheet (#110456): Ripped by Modern (Ralsei Gang).',
      'Kris Ch.1+2 (#110448): Kendotlibero, asym, Eli101gamer, KoolTimYT, MrDoubleA, Sissel, Yuti, Bubbled.',
      'Ralsei Ch.1+2 (#110469): Kendotlibero, asym, Luxandre, Sissel, TattleameliaMLG.',
      'Susie Ch.1+2 (#110471): Kendotlibero, asym, Sissel, TattleameliaMLG.',
      'Battle Menu (#110733): KaiyoLazr, MINOXX_, Sticks, NoobCat, Pvzdabest, TattleameliaMLG, asym.',
      'Effects (#113349) & Speech Bubbles (#113195): UndertaleFan25, Charles29, Sugar2000galaxy, MrDoubleA.',
    ],
  },
  {
    title: 'SOUND EFFECTS, VOICES & MUSIC',
    lines: [
      'Common Sound Effects: Ripped by Chopp (The Sounds Resource #17330).',
      'Jevil Voice Clips: Sourced from Deltarune Wiki (Toby Fox).',
      'Main Menu: "The Circus.mp3" — Toby Fox.',
      'Normal Mode: "THE WORLD REVOLVING.mp3" — Toby Fox.',
      'Chaos Mode: "DELTARUNE - THE WORLD REVOLVING Remix (Jevil\'s Theme).mp3" — User-provided remix track.',
    ],
  },
  {
    title: 'FONTS & USAGE RIGHTS NOTICE',
    lines: [
      'Fonts: Press Start 2P, Silkscreen, VT323 (SIL Open Font License 1.1).',
      'CHAOS PROJECT is a non-commercial fan recreation made for tribute and entertainment. All DELTARUNE copyrights remain property of Toby Fox.',
    ],
  },
];

export function formatKeyName(code) {
  if (!code) return '---';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'Escape') return 'ESC';
  if (code === 'Space') return 'SPACE';
  if (code === 'Enter') return 'ENTER';
  return code.toUpperCase();
}
