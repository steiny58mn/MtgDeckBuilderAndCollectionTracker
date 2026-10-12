import React from 'react';

export interface CardNames {
  /** The actual name on this specific card version (the printed / unofficial / flavor name, or oracle name if none) */
  actualName: string;
  /** Same as actualName (for convenient drop-in replacement) */
  displayName: string;
  /** The official rules / Oracle MTG name (e.g. "Rashel, Fist of Torm") */
  oracleName: string;
  /** The unofficial / alternate / flavor name (e.g. "Xenk, Paladin Unbroken") if present */
  unofficialName?: string;
  /** True if this card possesses an unofficial / alternate name distinct from its oracle name */
  hasAlternateName: boolean;
  /** Formatted subtitle (e.g. "as Rashel, Fist of Torm") */
  subtitle?: string;
}

/**
 * All 25 official Magic: The Gathering cards printed with the card type "Conspiracy"
 * (CNS and CN2 sets). Lowercase set for O(1) membership check.
 */
export const KNOWN_CONSPIRACY_NAMES: Set<string> = new Set([
  "adriana's valor",
  "advantageous proclamation",
  "assemble the rank and vile",
  "backup plan",
  "brago's favor",
  "double stroke",
  "echoing boon",
  "emissary's ploy",
  "hired heist",
  "hold the perimeter",
  "hymn of the wilds",
  "immediate action",
  "incendiary dissent",
  "iterative analysis",
  "muzzio's preparations",
  "natural unity",
  "power play",
  "secret summoning",
  "secrets of paradise",
  "sentinel dispatch",
  "sovereign's realm",
  "summoner's bond",
  "unexpected potential",
  "weight advantage",
  "worldknit",
]);

/**
 * Normalizes different styles of quotes (straight, curly, smart, backticks) into standard ASCII quotes.
 */
export function normalizeCardQuotes(name?: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`]/g, "'")
    .trim();
}

/**
 * Strips all quotes (straight, curly, smart, backticks, apostrophes) and collapses whitespace.
 */
export function stripCardQuotes(name?: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u2018\u2019\u201A\u201B\u2032\u2035`'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Authoritative check if a card name corresponds to an official MTG Conspiracy.
 * Tolerates quotes, brackets, set codes, split card naming, and whitespace.
 */
export function isConspiracyCardName(name?: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const raw = name.toLowerCase().trim();
  const front = raw.split(/\s*\/\/\s*/)[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
  const stripQuotesRaw = stripCardQuotes(raw).toLowerCase();
  const stripQuotesFront = stripCardQuotes(front).toLowerCase();
  return (
    KNOWN_CONSPIRACY_NAMES.has(front) ||
    KNOWN_CONSPIRACY_NAMES.has(raw) ||
    KNOWN_CONSPIRACY_NAMES.has(stripQuotesFront) ||
    KNOWN_CONSPIRACY_NAMES.has(stripQuotesRaw)
  );
}

/**
 * Known front-face card types for reversible double-faced cards and special promotional printings
 * where backend Scryfall/Turso databases lack or lose the top-level type line.
 */
export const KNOWN_CARD_TYPES: Record<string, string> = {
  // Paper MTG cards with quotes in names
  'kongming, "sleeping dragon"': 'Legendary Creature — Human Advisor',
  'kongming "sleeping dragon"': 'Legendary Creature — Human Advisor',
  'kongming, sleeping dragon': 'Legendary Creature — Human Advisor',
  'kongming sleeping dragon': 'Legendary Creature — Human Advisor',
  'miles "tails" prower': 'Legendary Creature — Fox Artificer',
  'miles tails prower': 'Legendary Creature — Fox Artificer',
  'mile "tails" power': 'Legendary Creature — Fox Artificer',
  'mile tails power': 'Legendary Creature — Fox Artificer',
  'miles "tails" power': 'Legendary Creature — Fox Artificer',
  'miles tails power': 'Legendary Creature — Fox Artificer',
  'mile "tails" prower': 'Legendary Creature — Fox Artificer',
  'mile tails prower': 'Legendary Creature — Fox Artificer',
  '"rumors of my death . . ."': 'Enchantment',
  'rumors of my death . . .': 'Enchantment',
  '"rumors of my death..."': 'Enchantment',
  'rumors of my death...': 'Enchantment',
  'rumors of my death': 'Enchantment',
  '"ach! hans, run!"': 'Enchantment',
  'ach! hans, run!': 'Enchantment',
  'ach! hans, run': 'Enchantment',
  '"lifetime" pass holder': 'Creature — Zombie Guest',
  'lifetime pass holder': 'Creature — Zombie Guest',
  'meet and greet "sisay"': 'Legendary Creature — Elf Performer',
  'meet and greet sisay': 'Legendary Creature — Elf Performer',
  'pang tong, "young phoenix"': 'Legendary Creature — Human Advisor',
  'pang tong "young phoenix"': 'Legendary Creature — Human Advisor',
  'pang tong, young phoenix': 'Legendary Creature — Human Advisor',
  'pang tong young phoenix': 'Legendary Creature — Human Advisor',
  '"brims" barone, midway mobster': 'Legendary Creature — Human Rogue',
  'brims barone, midway mobster': 'Legendary Creature — Human Rogue',
  'brims barone midway mobster': 'Legendary Creature — Human Rogue',
  'henzie "toolbox" torre': 'Legendary Creature — Devil Rogue',
  'henzie toolbox torre': 'Legendary Creature — Devil Rogue',
  'henzie "toolbox" torre // henzie "toolbox" torre': 'Legendary Creature — Devil Rogue',
  'henzie toolbox torre // henzie toolbox torre': 'Legendary Creature — Devil Rogue',
  'bounty: rissa "blades" lee // wanted!': 'Bounty',
  'bounty: rissa blades lee // wanted!': 'Bounty',
  'bounty: rissa "blades" lee': 'Bounty',
  'bounty: rissa blades lee': 'Bounty',
  // Commander 2018 / Secret Lair Reversible / Promo dual-named cards
  'estrid, the masked': 'Legendary Planeswalker — Estrid',
  'tuvasa the sunlit': 'Legendary Creature — Merfolk Shaman',
  'steely resolve': 'Enchantment',
  "estrid's invocation": 'Enchantment',
  "estrids invocation": 'Enchantment',
  'jetmir, nexus of revels': 'Legendary Creature — Demon Cat',
  "jinnie fay, jetmir's second": 'Legendary Creature — Elf Druid',
  "jinnie fay, jetmirs second": 'Legendary Creature — Elf Druid',
  'balthor the defiled': 'Legendary Creature — Zombie Dwarf',
  'lord of the undead': 'Creature — Zombie',
  'gravecrawler': 'Creature — Zombie',
  'erebos, god of the dead': 'Legendary Enchantment Creature — God',
  'toxrill, the corrosive': 'Legendary Creature — Slug Horror',
  'elesh norn, grand cenobite': 'Legendary Creature — Phyrexian Praetor',
  'jin-gitaxias, core augur': 'Legendary Creature — Phyrexian Praetor',
  'sheoldred, whispering one': 'Legendary Creature — Phyrexian Praetor',
  'urabrask the hidden': 'Legendary Creature — Phyrexian Praetor',
  'vorinclex, voice of hunger': 'Legendary Creature — Phyrexian Praetor',
  'malfegor': 'Legendary Creature — Demon Dragon',
  'chromium, the mutable': 'Legendary Creature — Elder Dragon',
  'arcades, the strategist': 'Legendary Creature — Elder Dragon',
  'nicol bolas, the ravager': 'Legendary Creature — Elder Dragon',
  'vaevictis asmadi, the dire': 'Legendary Creature — Elder Dragon',
  'palladia-mors, the ruiner': 'Legendary Creature — Elder Dragon',
  'liesa, forgotten archangel': 'Legendary Creature — Angel',
  'danitha capashen, paragon': 'Legendary Creature — Human Knight',
  'brago, king eternal': 'Legendary Creature — Spirit Noble',
  'ezuri, claw of progress': 'Legendary Creature — Elf Warrior',
  'karametra, god of harvests': 'Legendary Enchantment Creature — God',
  'phenax, god of deception': 'Legendary Enchantment Creature — God',
  'xenagos, god of revels': 'Legendary Enchantment Creature — God',
  'athreos, god of passage': 'Legendary Enchantment Creature — God',
  'iroas, god of victory': 'Legendary Enchantment Creature — God',
  'keranos, god of storms': 'Legendary Enchantment Creature — God',
  'pharika, god of affliction': 'Legendary Enchantment Creature — God',
  'kruphix, god of horizons': 'Legendary Enchantment Creature — God',
  'mogis, god of slaughter': 'Legendary Enchantment Creature — God',
  'propaganda': 'Enchantment',
  'rest in peace': 'Enchantment',
  'rhystic study': 'Enchantment',
  'smothering tithe': 'Enchantment',
  'sylvan library': 'Enchantment',
  'mystic remora': 'Enchantment',
  'phyrexian arena': 'Enchantment',
  'anointed procession': 'Enchantment',
  'doubling season': 'Enchantment',
  'parallel lives': 'Enchantment',
  'cyclonic rift': 'Instant',
  "teferi's protection": 'Instant',
  "teferis protection": 'Instant',
  'vampiric tutor': 'Instant',
  'demonic tutor': 'Sorcery',
  'wrath of god': 'Sorcery',
  'damnation': 'Sorcery',
  'blasphemous act': 'Sorcery',
  'sol ring': 'Artifact',
  'mana crypt': 'Artifact',
  'arcane signet': 'Artifact',
  'lightning greaves': 'Artifact',
  'swiftfoot boots': 'Artifact',
};

/**
 * Returns the authoritative front-face card type line for any known card name
 * (including conspiracies, reversible double-faced cards, and promos).
 */
export function getKnownCardType(name?: string): string | undefined {
  if (!name || typeof name !== 'string') return undefined;
  if (isConspiracyCardName(name)) return 'Conspiracy';
  const raw = name.toLowerCase().trim();
  const front = raw.split(/\s*\/\/\s*/)[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
  const normQuotesFront = normalizeCardQuotes(front).toLowerCase();
  const normQuotesRaw = normalizeCardQuotes(raw).toLowerCase();
  const stripQuotesFront = stripCardQuotes(front).toLowerCase();
  const stripQuotesRaw = stripCardQuotes(raw).toLowerCase();

  const canonical = getCanonicalCardName(name).toLowerCase().trim();
  const canonicalFront = canonical.split(/\s*\/\/\s*/)[0].trim();
  const canonicalStrip = stripCardQuotes(canonical).toLowerCase();

  return (
    KNOWN_CARD_TYPES[front] ||
    KNOWN_CARD_TYPES[stripQuotesFront] ||
    KNOWN_CARD_TYPES[normQuotesFront] ||
    KNOWN_CARD_TYPES[raw] ||
    KNOWN_CARD_TYPES[stripQuotesRaw] ||
    KNOWN_CARD_TYPES[normQuotesRaw] ||
    KNOWN_CARD_TYPES[canonical] ||
    KNOWN_CARD_TYPES[canonicalFront] ||
    KNOWN_CARD_TYPES[canonicalStrip]
  );
}

/**
 * Canonical dictionary of card name aliases, correcting common quotation marks,
 * punctuation variations, ellipses, typos, and reversible double-faced cards.
 */
export const CANONICAL_CARD_NAME_ALIASES: Record<string, string> = {
  // Sonic Secret Lair / Miles Prower typo variations
  'mile "tails" power': 'Miles "Tails" Prower',
  'mile tails power': 'Miles "Tails" Prower',
  'miles "tails" power': 'Miles "Tails" Prower',
  'miles tails power': 'Miles "Tails" Prower',
  'mile "tails" prower': 'Miles "Tails" Prower',
  'mile tails prower': 'Miles "Tails" Prower',
  'miles "tails" prower': 'Miles "Tails" Prower',
  'miles tails prower': 'Miles "Tails" Prower',
  'miles \'tails\' prower': 'Miles "Tails" Prower',
  'mile \'tails\' power': 'Miles "Tails" Prower',

  // Kongming, "Sleeping Dragon" punctuation & quote variations
  'kongming "sleeping dragon"': 'Kongming, "Sleeping Dragon"',
  'kongming sleeping dragon': 'Kongming, "Sleeping Dragon"',
  'kongming, "sleeping dragon"': 'Kongming, "Sleeping Dragon"',
  'kongming, sleeping dragon': 'Kongming, "Sleeping Dragon"',
  'kongming \'sleeping dragon\'': 'Kongming, "Sleeping Dragon"',
  'kongming, \'sleeping dragon\'': 'Kongming, "Sleeping Dragon"',

  // "Rumors of My Death . . ." quote and dot spacing variations
  '"rumors of my death..."': '"Rumors of My Death . . ."',
  '"rumors of my death . . ."': '"Rumors of My Death . . ."',
  'rumors of my death...': '"Rumors of My Death . . ."',
  'rumors of my death . . .': '"Rumors of My Death . . ."',
  'rumors of my death': '"Rumors of My Death . . ."',
  '\'rumors of my death...\'': '"Rumors of My Death . . ."',
  '\'rumors of my death . . .\'': '"Rumors of My Death . . ."',

  // "Ach! Hans, Run!"
  '"ach! hans, run!"': '"Ach! Hans, Run!"',
  'ach! hans, run!': '"Ach! Hans, Run!"',
  'ach! hans, run': '"Ach! Hans, Run!"',
  '\'ach! hans, run!\'': '"Ach! Hans, Run!"',

  // Henzie "Toolbox" Torre
  'henzie "toolbox" torre': 'Henzie "Toolbox" Torre',
  'henzie toolbox torre': 'Henzie "Toolbox" Torre',
  'henzie \'toolbox\' torre': 'Henzie "Toolbox" Torre',
  'henzie "toolbox" torre // henzie "toolbox" torre': 'Henzie "Toolbox" Torre',
  'henzie toolbox torre // henzie toolbox torre': 'Henzie "Toolbox" Torre',

  // "Brims" Barone, Midway Mobster
  '"brims" barone, midway mobster': '"Brims" Barone, Midway Mobster',
  'brims barone, midway mobster': '"Brims" Barone, Midway Mobster',
  'brims barone midway mobster': '"Brims" Barone, Midway Mobster',
  '\'brims\' barone, midway mobster': '"Brims" Barone, Midway Mobster',

  // Meet and Greet "Sisay"
  'meet and greet "sisay"': 'Meet and Greet "Sisay"',
  'meet and greet sisay': 'Meet and Greet "Sisay"',
  'meet and greet \'sisay\'': 'Meet and Greet "Sisay"',

  // "Lifetime" Pass Holder
  '"lifetime" pass holder': '"Lifetime" Pass Holder',
  'lifetime pass holder': '"Lifetime" Pass Holder',
  '\'lifetime\' pass holder': '"Lifetime" Pass Holder',

  // Pang Tong, "Young Phoenix"
  'pang tong, "young phoenix"': 'Pang Tong, "Young Phoenix"',
  'pang tong "young phoenix"': 'Pang Tong, "Young Phoenix"',
  'pang tong, young phoenix': 'Pang Tong, "Young Phoenix"',
  'pang tong young phoenix': 'Pang Tong, "Young Phoenix"',
  'pang tong, \'young phoenix\'': 'Pang Tong, "Young Phoenix"',
  'pang tong \'young phoenix\'': 'Pang Tong, "Young Phoenix"',

  // Bounty: Rissa "Blades" Lee // Wanted!
  'bounty: rissa "blades" lee // wanted!': 'Bounty: Rissa "Blades" Lee // Wanted!',
  'bounty: rissa blades lee // wanted!': 'Bounty: Rissa "Blades" Lee // Wanted!',
  'bounty: rissa "blades" lee': 'Bounty: Rissa "Blades" Lee // Wanted!',
  'bounty: rissa blades lee': 'Bounty: Rissa "Blades" Lee // Wanted!',

  // Reversible double-faced cards (Secret Lair / Special Promos where both faces are the same)
  'estrid, the masked // estrid, the masked': 'Estrid, the Masked',
  'tuvasa the sunlit // tuvasa the sunlit': 'Tuvasa the Sunlit',
  'steely resolve // steely resolve': 'Steely Resolve',
  "estrid's invocation // estrid's invocation": "Estrid's Invocation",
  'jetmir, nexus of revels // jetmir, nexus of revels': 'Jetmir, Nexus of Revels',
  'jetmir, nexus of revels': 'Jetmir, Nexus of Revels',
  "jinnie fay, jetmir's second // jinnie fay, jetmir's second": "Jinnie Fay, Jetmir's Second",
  "jinnie fay, jetmir's second": "Jinnie Fay, Jetmir's Second",
};

/**
 * Resolves a card name to its canonical MTG name, accounting for quotes,
 * typos, ellipses, and reversible double-faced cards where both faces are identical.
 */
export function getCanonicalCardName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct alias match
  if (CANONICAL_CARD_NAME_ALIASES[lower]) {
    return CANONICAL_CARD_NAME_ALIASES[lower];
  }

  // 2. Normalize smart/curly quotes to ASCII quotes
  const asciiQuotes = normalizeCardQuotes(lower).toLowerCase();
  if (CANONICAL_CARD_NAME_ALIASES[asciiQuotes]) {
    return CANONICAL_CARD_NAME_ALIASES[asciiQuotes];
  }

  // 3. Ellipsis normalized
  if (asciiQuotes.includes('...')) {
    const spacedDots = asciiQuotes.replace(/\.{3,}/g, '. . .');
    if (CANONICAL_CARD_NAME_ALIASES[spacedDots]) {
      return CANONICAL_CARD_NAME_ALIASES[spacedDots];
    }
  }

  // 4. Strip quotes entirely
  const stripQuotes = stripCardQuotes(lower).toLowerCase();
  if (CANONICAL_CARD_NAME_ALIASES[stripQuotes]) {
    return CANONICAL_CARD_NAME_ALIASES[stripQuotes];
  }

  // 5. Comma before quote normalization: e.g. Kongming "Sleeping Dragon" <-> Kongming, "Sleeping Dragon"
  const commaQuote = asciiQuotes.replace(/,\s*"/g, ' "');
  if (CANONICAL_CARD_NAME_ALIASES[commaQuote]) {
    return CANONICAL_CARD_NAME_ALIASES[commaQuote];
  }
  const addCommaQuote = asciiQuotes.replace(/([a-zA-Z0-9])\s*"/g, '$1, "');
  if (CANONICAL_CARD_NAME_ALIASES[addCommaQuote]) {
    return CANONICAL_CARD_NAME_ALIASES[addCommaQuote];
  }

  // 6. Reversible double-faced cards where both faces have the same name:
  // e.g. "Jetmir, Nexus Of Revels // Jetmir, Nexus Of Revels" -> "Jetmir, Nexus of Revels"
  if (trimmed.includes('//')) {
    const parts = trimmed.split(/\s*\/\/\s*/);
    if (parts.length === 2 && parts[0].trim().toLowerCase() === parts[1].trim().toLowerCase()) {
      const front = parts[0].trim();
      const frontLower = front.toLowerCase();
      if (CANONICAL_CARD_NAME_ALIASES[frontLower]) {
        return CANONICAL_CARD_NAME_ALIASES[frontLower];
      }
      return front;
    }
  }

  return trimmed;
}

/**
 * Canonical dictionary of known Universes Beyond, Secret Lair, Godzilla, and Dracula crossover pairs.
 * Maps: unofficial name (lowercase) -> official Oracle name (canonical title).
 */
const UNOFFICIAL_TO_ORACLE: Record<string, string> = {
  // Dungeons & Dragons: Honor Among Thieves (SLD)
  'xenk, paladin unbroken': 'Rashel, Fist of Torm',
  'edgin, larcenous luteplayer': 'Edgin, Larcenous Luteplayer',
  'forge, neverwinter charlatan': 'Forge, Neverwinter Charlatan',
  'holga, relentless rager': 'Holga, Relentless Rager',
  'simon, wild magic sorcerer': 'Simon, Wild Magic Sorcerer',
  'doric, nature\'s warden': 'Doric, Nature\'s Warden',

  // Street Fighter (SLD -> SLX)
  'chun-li, countless kicks': 'Zethi, Arcane Blademaster',
  'ryu, world warrior': 'Vikya, Scorching Stalwart',
  'ken, burning brawler': 'Aisha of Sparks and Smoke',
  'guile, sonic soldier': 'Immard, the Stormcleaver',
  'blanka, ferocious friend': 'The Howling Abomination',
  'dhalsim, pliable pacifist': 'Tadeas, Juniper Ascendant',
  'e. honda, sumo slammer': 'Baldin, Century Herdmaster',

  // Stranger Things (SLD -> SLX)
  'eleven, the mage': 'Cecily, Haunted Mage',
  'mike, the dungeon master': 'Othelm, Sigardian Outcast',
  'dustin, gadget genius': 'Hargilde, Kindly Runecrafter',
  'lucas, the sharpshooter': 'Bjorna, Nightfall Alchemist',
  'will the wise': 'Wernog, Rider\'s Chaplain',
  'chief jim hopper': 'Sophina, Spearsage Deserter',
  'max, the daredevil': 'Elmar, Wyrm Enforcer',
  'mind flayer, the shadow': 'Arvinox, the Mind Flail',

  // The Walking Dead (SLD)
  'rick, steadfast leader': 'Greymond, Avacyn\'s Stalwart',
  'daryl, hunter of walkers': 'Hans, Wilderness Guide',
  'glenn, the voice of calm': 'Bjorna, Nightfall Alchemist',
  'michonne, ruthless survivor': 'Ruthless Survivor',
  'negan, the cold-blooded': 'Malik, Grim Bauble',
  'lucille': 'Gisa\'s Favorite Shovel',

  // Godzilla Series (IKO)
  'godzilla, king of the monsters': 'Zilortha, Strength Incarnate',
  'bio-quartz spacegodzilla': 'Brokkos, Apex of Forever',
  'mechagodzilla, the weapon': 'Crystalline Giant',
  'battra, dark destroyer': 'Dirge Bat',
  'king caesar, ancient guardian': 'Huntmaster Liger',
  'dorat, the perfect pet': 'Sprite Dragon',
  'mothra, supersonic queen': 'Luminous Broodmoth',
  'gigan, cyberclaw terror': 'Titanoth Rex',
  'rodan, titan of winged fire': 'Vadrok, Apex of Thunder',
  'ghidorah, king of the cosmos': 'Illuna, Apex of Wishes',
  'godzilla, primeval champion': 'Titanoth Rex',
  'godzilla, doom sovereign': 'Yidaro, Wandering Monster',
  'anguirus, armored killer': 'Gemrazer',
  'babygodzilla, ruin reborn': 'Pollywog Symbiote',
  'destoroyah, perfect lifeform': 'Everquill Phoenix',
  'spacegodzilla, void invader': 'Nethroi, Apex of Death',

  // Dracula Series (VOW)
  'count dracula': 'Sorin the Mirthless',
  'sisters of undying light': 'Markov Purifier',
  'dracula, lord of blood': 'Voldaren Bloodcaster',
  'dracula, the voyager': 'Runo Stromkirk',
  'dracula\'s tomb': 'Voldaren Estate',
  'castle dracula': 'Edgar, Charmed Groom',
  'mina harker': 'Thalia, Guardian of Thraben',
  'jonathan harker': 'Jacob Hauken, Inspector',
  'abraham van helsing': 'Savior of Ollenbock',
  'renfield, delusional minion': 'Headless Rider',
  'lucy westenra': 'Katilda, Dawnhart Martyr',
  'quincey morris': 'Halana and Alena, Partners',
  'dr. john seward': 'Torens, Fist of the Angels',
  'dracula, blood priest': 'Henrika Domnathi',
  'vampiric feast': 'Syphon Essence',
};

/**
 * Maps: official Oracle name (lowercase) -> default unofficial/crossover name (canonical title)
 */
const ORACLE_TO_UNOFFICIAL: Record<string, string> = {
  'rashel, fist of torm': 'Xenk, Paladin Unbroken',
  'zethi, arcane blademaster': 'Chun-Li, Countless Kicks',
  'vikya, scorching stalwart': 'Ryu, World Warrior',
  'aisha of sparks and smoke': 'Ken, Burning Brawler',
  'immard, the stormcleaver': 'Guile, Sonic Soldier',
  'the howling abomination': 'Blanka, Ferocious Friend',
  'tadeas, juniper ascendant': 'Dhalsim, Pliable Pacifist',
  'baldin, century herdmaster': 'E. Honda, Sumo Slammer',
  'cecily, haunted mage': 'Eleven, the Mage',
  'othelm, sigardian outcast': 'Mike, the Dungeon Master',
  'hargilde, kindly runecrafter': 'Dustin, Gadget Genius',
  'bjorna, nightfall alchemist': 'Lucas, the Sharpshooter',
  'wernog, rider\'s chaplain': 'Will the Wise',
  'sophina, spearsage deserter': 'Chief Jim Hopper',
  'elmar, wyrm enforcer': 'Max, the Daredevil',
  'arvinox, the mind flail': 'Mind Flayer, the Shadow',
  'greymond, avacyn\'s stalwart': 'Rick, Steadfast Leader',
  'malik, grim bauble': 'Negan, the Cold-Blooded',
  'zilortha, strength incarnate': 'Godzilla, King of the Monsters',
};

/**
 * Set codes and collector numbers for specific crossover printings.
 */
const SPECIFIC_PRINTING_MAP: Record<string, { actualName: string; oracleName: string }> = {
  'sld:1237': { actualName: 'Xenk, Paladin Unbroken', oracleName: 'Rashel, Fist of Torm' },
  'sld:432': { actualName: 'Chun-Li, Countless Kicks', oracleName: 'Zethi, Arcane Blademaster' },
  'sld:428': { actualName: 'Ryu, World Warrior', oracleName: 'Vikya, Scorching Stalwart' },
  'sld:429': { actualName: 'Ken, Burning Brawler', oracleName: 'Aisha of Sparks and Smoke' },
  'sld:431': { actualName: 'Guile, Sonic Soldier', oracleName: 'Immard, the Stormcleaver' },
  'sld:433': { actualName: 'Blanka, Ferocious Friend', oracleName: 'The Howling Abomination' },
  'sld:434': { actualName: 'Dhalsim, Pliable Pacifist', oracleName: 'Tadeas, Juniper Ascendant' },
  'sld:430': { actualName: 'E. Honda, Sumo Slammer', oracleName: 'Baldin, Century Herdmaster' },
  'sld:340': { actualName: 'Eleven, the Mage', oracleName: 'Cecily, Haunted Mage' },
  'sld:341': { actualName: 'Mike, the Dungeon Master', oracleName: 'Othelm, Sigardian Outcast' },
  'sld:342': { actualName: 'Dustin, Gadget Genius', oracleName: 'Hargilde, Kindly Runecrafter' },
  'sld:343': { actualName: 'Lucas, the Sharpshooter', oracleName: 'Bjorna, Nightfall Alchemist' },
  'sld:344': { actualName: 'Will the Wise', oracleName: 'Wernog, Rider\'s Chaplain' },
  'sld:345': { actualName: 'Chief Jim Hopper', oracleName: 'Sophina, Spearsage Deserter' },
  'sld:346': { actualName: 'Max, the Daredevil', oracleName: 'Elmar, Wyrm Enforcer' },
  'sld:347': { actualName: 'Mind Flayer, the Shadow', oracleName: 'Arvinox, the Mind Flail' },
};

/**
 * Inspects any card object and extracts its actual printed name, official oracle name,
 * and alternate name with complete support for Secret Lair, Universes Beyond, and Godzilla styles.
 */
export function getCardNames(card: any): CardNames {
  if (!card) {
    return {
      actualName: '',
      displayName: '',
      oracleName: '',
      hasAlternateName: false,
    };
  }

  const rawName = (card.name || card.Name || '').trim();
  const setCode = (card.set || card.Set || card.set_code || '').trim().toLowerCase();
  const collectorNum = String(card.collectorNumber || card.collector_number || card.CollectorNumber || '').trim();

  // Check specific set + collector number match (e.g. SLD #1237)
  if (setCode && collectorNum) {
    const printKey = `${setCode}:${collectorNum.toLowerCase()}`;
    const specific = SPECIFIC_PRINTING_MAP[printKey];
    if (specific) {
      return {
        actualName: specific.actualName,
        displayName: specific.actualName,
        oracleName: specific.oracleName,
        unofficialName: specific.actualName,
        hasAlternateName: true,
        subtitle: `as ${specific.oracleName}`,
      };
    }
  }

  // Check explicit printed_name or flavor_name from card data (e.g. Scryfall or backend)
  const explicitAlt = (
    card.printed_name ||
    card.printedName ||
    card.PrintedName ||
    card.flavor_name ||
    card.flavorName ||
    card.FlavorName ||
    card.card_faces?.[0]?.printed_name ||
    card.card_faces?.[0]?.flavor_name ||
    ''
  ).trim();

  if (explicitAlt && explicitAlt.toLowerCase() !== rawName.toLowerCase()) {
    return {
      actualName: explicitAlt,
      displayName: explicitAlt,
      oracleName: rawName,
      unofficialName: explicitAlt,
      hasAlternateName: true,
      subtitle: `as ${rawName}`,
    };
  }

  const rawLower = rawName.toLowerCase();

  // Check canonical alias / reversible card
  const canonical = getCanonicalCardName(rawName);
  if (canonical && canonical.toLowerCase() !== rawLower) {
    return {
      actualName: canonical,
      displayName: canonical,
      oracleName: canonical,
      hasAlternateName: false,
    };
  }

  // Check if rawName is a known unofficial/crossover name (e.g. "Xenk, Paladin Unbroken")
  if (UNOFFICIAL_TO_ORACLE[rawLower]) {
    const oracleName = UNOFFICIAL_TO_ORACLE[rawLower];
    return {
      actualName: rawName,
      displayName: rawName,
      oracleName,
      unofficialName: rawName,
      hasAlternateName: true,
      subtitle: `as ${oracleName}`,
    };
  }

  // Check if rawName is a known Oracle name with a crossover counterpart in SLD or special promo
  if (ORACLE_TO_UNOFFICIAL[rawLower]) {
    const unofficial = ORACLE_TO_UNOFFICIAL[rawLower];
    // If the set is Secret Lair or promo, the actual card is the unofficial version
    if (setCode === 'sld' || setCode === 'iko') {
      return {
        actualName: unofficial,
        displayName: unofficial,
        oracleName: rawName,
        unofficialName: unofficial,
        hasAlternateName: true,
        subtitle: `as ${rawName}`,
      };
    }
    // Otherwise show the official name with alternate note
    return {
      actualName: rawName,
      displayName: rawName,
      oracleName: rawName,
      unofficialName: unofficial,
      hasAlternateName: true,
      subtitle: `aka ${unofficial}`,
    };
  }

  // Standard MTG card without alternate name
  return {
    actualName: rawName,
    displayName: rawName,
    oracleName: rawName,
    hasAlternateName: false,
  };
}

/**
 * Returns all lowercase search / match tokens for a card, ensuring collection lookups
 * and deck validations treat "Xenk, Paladin Unbroken" and "Rashel, Fist of Torm" as the exact same card.
 */
export function getAllCardMatchNames(card: any): string[] {
  if (!card) return [];
  const names = getCardNames(card);
  const result = new Set<string>();

  const addVariants = (str: string) => {
    if (!str) return;
    const lower = str.toLowerCase().trim();
    if (!lower) return;
    result.add(lower);

    // Front face of split/DFC/reversible
    const cleanFront = lower.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (cleanFront) result.add(cleanFront);

    // Normalized quotes
    const normQuotes = normalizeCardQuotes(lower).toLowerCase();
    if (normQuotes) result.add(normQuotes);

    const normQuotesFront = normalizeCardQuotes(cleanFront).toLowerCase();
    if (normQuotesFront) result.add(normQuotesFront);

    // Single-quote normalization
    const singleQuotes = lower.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`"]/g, "'");
    result.add(singleQuotes);

    // Stripped quotes altogether
    const stripQuotes = stripCardQuotes(lower).toLowerCase();
    if (stripQuotes) result.add(stripQuotes);

    const cleanFrontStripQuotes = stripCardQuotes(cleanFront).toLowerCase();
    if (cleanFrontStripQuotes) result.add(cleanFrontStripQuotes);

    // Comma variations with quotes:
    // e.g. "kongming, \"sleeping dragon\"" <-> "kongming \"sleeping dragon\""
    if (lower.includes('"')) {
      result.add(lower.replace(/,\s*"/g, ' "'));
      result.add(lower.replace(/([a-zA-Z0-9])\s*"/g, '$1, "'));
    }

    // Check canonical alias
    const canonical = getCanonicalCardName(lower);
    if (canonical && canonical.toLowerCase() !== lower) {
      const canLower = canonical.toLowerCase();
      result.add(canLower);
      const canStrip = stripCardQuotes(canLower).toLowerCase();
      if (canStrip) result.add(canStrip);
    }

    // Dot variations: e.g. "rumors of my death..." <-> "rumors of my death . . ."
    if (lower.includes('...')) {
      result.add(lower.replace(/\.{3,}/g, '. . .'));
    }
    if (lower.includes('. . .')) {
      result.add(lower.replace(/\.\s*\.\s*\./g, '...'));
    }
  };

  addVariants(names.actualName);
  addVariants(names.oracleName);
  if (names.unofficialName) {
    addVariants(names.unofficialName);
  }

  const rawName = card.name || card.Name;
  if (rawName) addVariants(rawName);

  return Array.from(result);
}

/**
 * Reusable component to render card titles in the collection, binder, and deck builder.
 * If the card has an unofficial / alternate name, prominently displays the actual card name
 * alongside its official rules / Oracle name (e.g. "Xenk, Paladin Unbroken" as "Rashel, Fist of Torm").
 */
export const CardNameDisplay: React.FC<{
  card: any;
  className?: string;
  subtitleClassName?: string;
  onClick?: () => void;
  title?: string;
}> = ({
  card,
  className = '',
  subtitleClassName = '',
  onClick,
  title,
}) => {
  const names = getCardNames(card);

  return (
    <div className="flex flex-col min-w-0" title={title}>
      <span
        onClick={onClick}
        className={className}
      >
        {names.actualName}
      </span>
      {names.hasAlternateName && names.subtitle && (
        <span className={`text-[10px] text-slate-400 italic truncate block leading-tight ${subtitleClassName}`}>
          {names.subtitle}
        </span>
      )}
    </div>
  );
};
