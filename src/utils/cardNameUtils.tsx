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
    // If card.name is the Oracle name and explicitAlt is the printed/flavor name:
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

    // Front face of split/DFC
    const cleanFront = lower.split('//')[0].replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    if (cleanFront) result.add(cleanFront);

    // Normalized quotes
    const normQuotes = lower.replace(/['’`"]/g, "'");
    result.add(normQuotes);

    const cleanFrontNoQuotes = cleanFront.replace(/['’`"]/g, "'");
    if (cleanFrontNoQuotes) result.add(cleanFrontNoQuotes);
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
  className = 'text-xs font-semibold text-slate-200 hover:text-emerald-400 cursor-pointer break-words leading-tight',
  subtitleClassName = 'text-[10px] text-slate-400 italic truncate block mt-0.5',
  onClick,
  title,
}) => {
  const names = getCardNames(card);
  const hoverTitle = title || (names.hasAlternateName
    ? `${names.actualName} (Official Oracle name: ${names.oracleName})`
    : names.actualName);

  return (
    <div className="min-w-0">
      <span
        onClick={onClick}
        className={className}
        title={hoverTitle}
      >
        {names.actualName}
      </span>
      {names.hasAlternateName && names.subtitle && (
        <span
          className={subtitleClassName}
          title={`Official Oracle name: ${names.oracleName}`}
        >
          {names.subtitle}
        </span>
      )}
    </div>
  );
};
