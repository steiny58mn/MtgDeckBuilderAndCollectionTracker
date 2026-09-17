import { DeckCategory, MTGFormat } from '../types/mtg';
import { ExportFormatKey, EXPORT_FORMATS, ExportFormatOption } from './deckExport';

export interface ImportFormatOption extends ExportFormatOption {
  sampleSyntax: string;
}

export const IMPORT_FORMATS: ImportFormatOption[] = [
  {
    key: 'bbcode',
    label: 'BBCode (MTGNexus)',
    badge: 'Forum',
    description: 'Formatted [deck] and [card] tags with counts and card type categorization from MTGNexus forums.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: '[deck=My Deck]\n[b]Commander[/b] (1)\n1 [card]Atraxa, Praetors\' Voice[/card]\n[b]Creatures[/b] (10)\n1 [card]Birds of Paradise[/card]\n[/deck]',
  },
  {
    key: 'tappedout',
    label: 'TappedOut',
    badge: 'Popular',
    description: 'TappedOut format with 1x Card Name (SET) and *CMDR* / *F* / SB: tags.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: '1x Atraxa, Praetors\' Voice (C16) *CMDR* *F*\n1x Sol Ring (C16)\nSB: 1x Rest in Peace\nMaybeboard:\n1x Doubling Season',
  },
  {
    key: 'moxfield',
    label: 'Moxfield',
    badge: 'Modern',
    description: 'Standard Moxfield import text with COMMANDER:, MAINBOARD:, and SIDEBOARD: sections.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: 'COMMANDER:\n1 Atraxa, Praetors\' Voice (2XM) 1 *F*\nMAINBOARD:\n1 Sol Ring (C16) 272\nSIDEBOARD:\n1 Rest in Peace',
  },
  {
    key: 'mtgo',
    label: 'Magic Online',
    badge: 'MTGO',
    description: 'Standard Magic Online text list or .dek XML document.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: '1 Atraxa, Praetors\' Voice\n1 Sol Ring\nSideboard\n1 Rest in Peace\n(or .dek XML file)',
  },
  {
    key: 'archidekt',
    label: 'Archidekt',
    badge: 'Builder',
    description: 'Archidekt format with // Commander and // Mainboard headers and set codes.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: '// Commander\n1x Atraxa, Praetors\' Voice (CM2:1)\n// Mainboard\n1x Sol Ring (C16:272)\n// Sideboard\n1x Rest in Peace',
  },
  {
    key: 'csv',
    label: 'CSV Data',
    badge: 'Spreadsheet',
    description: 'Comma-separated values spreadsheet containing quantity, card name, category, and set info.',
    fileExtension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    sampleSyntax: 'Quantity,Card Name,Category,Set Code\n1,"Atraxa, Praetors\' Voice",commander,C16\n1,"Sol Ring",main,C16',
  },
  {
    key: 'text',
    label: 'Plain Text',
    badge: 'Universal',
    description: 'Clean line-by-line card list compatible with MTG Arena, cockatrice, and deck builders.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
    sampleSyntax: '// Commander\n1 Atraxa, Praetors\' Voice\n// Deck\n1 Sol Ring\n// Sideboard\n1 Rest in Peace',
  },
  {
    key: 'excel',
    label: 'Excel / TSV',
    badge: 'XLS / Sheets',
    description: 'Tab-delimited table copied from Microsoft Excel, Google Sheets, or exported workbook.',
    fileExtension: 'tsv',
    mimeType: 'text/tab-separated-values;charset=utf-8',
    sampleSyntax: 'Quantity\tCard Name\tCategory\tSet\n1\tAtraxa, Praetors\' Voice\tcommander\tC16\n1\tSol Ring\tmain\tC16',
  },
];

export interface ParsedImportCard {
  quantity: number;
  name: string;
  category: DeckCategory;
  set?: string;
  collector_number?: string;
  isFoil?: boolean;
}

export interface ParsedDeckImport {
  detectedFormat: ExportFormatKey;
  deckName?: string;
  format?: MTGFormat;
  cards: ParsedImportCard[];
}

/**
 * Strips HTML tags if HTML table from Excel was pasted
 */
function cleanHtml(raw: string): string {
  if (!raw.includes('<table') && !raw.includes('<tr')) {
    return raw;
  }
  // Simple table row to TSV extractor
  const rowMatches = raw.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  if (rowMatches.length === 0) return raw;

  const lines: string[] = [];
  for (const row of rowMatches) {
    const cellMatches = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
    const cells = cellMatches.map((cell) =>
      cell
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
    );
    if (cells.length > 0) {
      lines.push(cells.join('\t'));
    }
  }
  return lines.join('\n');
}

/**
 * 1. Parser for BBCode (MTGNexus)
 */
export function parseBBCode(content: string): ParsedDeckImport {
  const lines = content.split('\n');
  let deckName: string | undefined;
  const cards: ParsedImportCard[] = [];
  let currentCategory: DeckCategory = 'main';

  // Check [deck=Deck Name]
  const titleMatch = content.match(/\[deck=([^\]]+)\]/i);
  if (titleMatch) {
    deckName = titleMatch[1].trim();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('[/deck]')) continue;

    // Check BBCode headers
    if (/\[b\]commander\[\/b\]/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }
    if (/\[b\]sideboard\[\/b\]/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/\[b\]maybeboard\[\/b\]/i.test(line)) {
      currentCategory = 'maybeboard';
      continue;
    }
    if (/\[b\](creatures|instants|sorceries|artifacts|enchantments|planeswalkers|lands|other[a-z\s]*)\[\/b\]/i.test(line)) {
      currentCategory = 'main';
      continue;
    }

    // Match patterns like: "1 [card]Atraxa, Praetors' Voice[/card]" or "[card]4 Lightning Bolt[/card]"
    let qty = 1;
    let cardName = '';

    const cardTagMatch = line.match(/^(?:(\d+)[xX]?\s+)?\[card(?:=[^\]]+)?\]([^\[]+)\[\/card\]/i);
    if (cardTagMatch) {
      if (cardTagMatch[1]) {
        qty = parseInt(cardTagMatch[1], 10);
      }
      cardName = cardTagMatch[2].trim();
      // Handle "[card]4 Lightning Bolt[/card]"
      const innerQty = cardName.match(/^(\d+)[xX]?\s+(.+)$/);
      if (innerQty) {
        qty = parseInt(innerQty[1], 10);
        cardName = innerQty[2].trim();
      }
    } else {
      // Fallback standard line
      const fallback = line.match(/^(\d+)[xX]?\s+(.+)$/);
      if (fallback) {
        qty = parseInt(fallback[1], 10);
        cardName = fallback[2].replace(/\[\/?card[^\]]*\]/gi, '').trim();
      } else if (!line.startsWith('[') && line.length > 2) {
        cardName = line.replace(/\[\/?card[^\]]*\]/gi, '').trim();
      }
    }

    if (cardName) {
      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
      });
    }
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'bbcode',
    deckName,
    format: hasCommander ? 'commander' : cards.length >= 90 ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 2. Parser for TappedOut
 */
export function parseTappedOut(content: string): ParsedDeckImport {
  const lines = content.split('\n');
  const cards: ParsedImportCard[] = [];
  let currentCategory: DeckCategory = 'main';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^maybeboard/i.test(line)) {
      currentCategory = 'maybeboard';
      continue;
    }
    if (/^sideboard/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/^commander/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }

    let isSideboard = false;
    let cleanLine = line;
    if (/^sb:\s*/i.test(cleanLine)) {
      isSideboard = true;
      cleanLine = cleanLine.replace(/^sb:\s*/i, '');
    }

    const isCommander = /\*CMDR\*/i.test(cleanLine);
    const isFoil = /\*F\*/i.test(cleanLine);

    // Remove tags
    cleanLine = cleanLine.replace(/\*CMDR\*/gi, '').replace(/\*F\*/gi, '').trim();

    // Extract quantity and name
    const match = cleanLine.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = cleanLine;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2];
    }

    // Extract set code, e.g. (C16) or (2XM:12)
    let set: string | undefined;
    let collectorNumber: string | undefined;
    const setMatch = cardName.match(/\(([A-Za-z0-9_]+)(?::([0-9A-Za-z]+))?\)/);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
      if (setMatch[2]) collectorNumber = setMatch[2];
      cardName = cardName.replace(/\s*\([A-Za-z0-9_]+(?::[0-9A-Za-z]+)?\).*/, '');
    }

    cardName = cardName.trim();
    if (cardName) {
      const cat: DeckCategory = isCommander
        ? 'commander'
        : isSideboard
        ? 'sideboard'
        : currentCategory;

      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: cat,
        set,
        collector_number: collectorNumber,
        isFoil,
      });
    }
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'tappedout',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 3. Parser for Moxfield
 */
export function parseMoxfield(content: string): ParsedDeckImport {
  const lines = content.split('\n');
  const cards: ParsedImportCard[] = [];
  let currentCategory: DeckCategory = 'main';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^COMMANDER:/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }
    if (/^MAINBOARD:/i.test(line)) {
      currentCategory = 'main';
      continue;
    }
    if (/^SIDEBOARD:/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/^MAYBEBOARD:/i.test(line)) {
      currentCategory = 'maybeboard';
      continue;
    }
    if (/^COMPANION:/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }

    let cleanLine = line;
    const isFoil = /\*F\*/i.test(cleanLine);
    cleanLine = cleanLine.replace(/\*F\*/gi, '').trim();

    const match = cleanLine.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = cleanLine;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2];
    }

    let set: string | undefined;
    let collectorNumber: string | undefined;

    // Pattern: "Card Name (SET) 123" or "Card Name (SET)"
    const setMatch = cardName.match(/\(([A-Za-z0-9_]+)\)\s*([0-9A-Za-z]+)?/);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
      if (setMatch[2]) collectorNumber = setMatch[2];
      cardName = cardName.replace(/\s*\([A-Za-z0-9_]+\).*/, '');
    }

    cardName = cardName.trim();
    if (cardName) {
      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
        set,
        collector_number: collectorNumber,
        isFoil,
      });
    }
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'moxfield',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 4. Parser for Magic Online (MTGO text & .dek XML)
 */
export function parseMTGO(content: string): ParsedDeckImport {
  const cards: ParsedImportCard[] = [];

  // Check if .dek XML
  if (content.includes('<Deck') || content.includes('<Cards')) {
    const cardMatches = content.match(/<Cards[^>]+>/gi) || [];
    for (const tag of cardMatches) {
      const nameMatch = tag.match(/Name="([^"]+)"/i);
      const qtyMatch = tag.match(/Quantity="([^"]+)"/i);
      const sideMatch = tag.match(/Sideboard="([^"]+)"/i);

      if (nameMatch) {
        const name = nameMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        const isSide = sideMatch ? sideMatch[1].toLowerCase() === 'true' : false;

        cards.push({
          quantity: isNaN(qty) || qty < 1 ? 1 : qty,
          name,
          category: isSide ? 'sideboard' : 'main',
        });
      }
    }

    return {
      detectedFormat: 'mtgo',
      format: cards.length >= 95 ? 'commander' : 'casual',
      cards,
    };
  }

  // Plain MTGO Text list
  const lines = content.split('\n');
  let currentCategory: DeckCategory = 'main';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^sideboard/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }

    const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = line;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2].trim();
    }

    if (cardName) {
      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
      });
    }
  }

  return {
    detectedFormat: 'mtgo',
    format: cards.length >= 95 ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 5. Parser for Archidekt
 */
export function parseArchidekt(content: string): ParsedDeckImport {
  const lines = content.split('\n');
  const cards: ParsedImportCard[] = [];
  let currentCategory: DeckCategory = 'main';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^\/\/\s*commander/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }
    if (/^\/\/\s*main/i.test(line)) {
      currentCategory = 'main';
      continue;
    }
    if (/^\/\/\s*sideboard/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/^\/\/\s*maybeboard/i.test(line)) {
      currentCategory = 'maybeboard';
      continue;
    }
    if (line.startsWith('//')) continue;

    let cleanLine = line;
    const isFoil = /\*F\*/i.test(cleanLine);
    cleanLine = cleanLine.replace(/\*F\*/gi, '').trim();

    const match = cleanLine.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = cleanLine;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2];
    }

    let set: string | undefined;
    let collectorNumber: string | undefined;
    const setMatch = cardName.match(/\(([A-Za-z0-9_]+)(?::([0-9A-Za-z]+))?\)/);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
      if (setMatch[2]) collectorNumber = setMatch[2];
      cardName = cardName.replace(/\s*\([A-Za-z0-9_]+(?::[0-9A-Za-z]+)?\).*/, '');
    }

    cardName = cardName.trim();
    if (cardName) {
      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
        set,
        collector_number: collectorNumber,
        isFoil,
      });
    }
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'archidekt',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 6. Parser for CSV Data
 */
export function parseCSV(content: string): ParsedDeckImport {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { detectedFormat: 'csv', cards: [] };
  }

  // Parse CSV line handling quotes
  const parseCsvLine = (text: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headerCells = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const qtyIdx = headerCells.findIndex((h) => h.includes('quant') || h.includes('count') || h === 'qty');
  const nameIdx = headerCells.findIndex((h) => h.includes('name') || h.includes('card'));
  const catIdx = headerCells.findIndex((h) => h.includes('category') || h.includes('board') || h.includes('section'));
  const setIdx = headerCells.findIndex((h) => h.includes('set') || h.includes('edition'));
  const foilIdx = headerCells.findIndex((h) => h.includes('foil'));

  const startIndex = (qtyIdx !== -1 || nameIdx !== -1) ? 1 : 0;
  const actualQtyIdx = qtyIdx !== -1 ? qtyIdx : 0;
  const actualNameIdx = nameIdx !== -1 ? nameIdx : 1;

  const cards: ParsedImportCard[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 0 || !cells[actualNameIdx]) continue;

    const rawQty = parseInt(cells[actualQtyIdx], 10);
    const qty = isNaN(rawQty) || rawQty < 1 ? 1 : rawQty;
    const name = cells[actualNameIdx].trim();
    if (!name) continue;

    let category: DeckCategory = 'main';
    if (catIdx !== -1 && cells[catIdx]) {
      const catVal = cells[catIdx].toLowerCase();
      if (catVal.includes('command')) category = 'commander';
      else if (catVal.includes('side')) category = 'sideboard';
      else if (catVal.includes('maybe')) category = 'maybeboard';
    }

    const set = setIdx !== -1 && cells[setIdx] ? cells[setIdx].toLowerCase() : undefined;
    const isFoil = foilIdx !== -1 && cells[foilIdx] ? /^(yes|true|foil|1)$/i.test(cells[foilIdx]) : undefined;

    cards.push({
      quantity: qty,
      name,
      category,
      set,
      isFoil,
    });
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'csv',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 7. Parser for Plain Text / Arena
 */
export function parsePlainText(content: string): ParsedDeckImport {
  const lines = content.split('\n');
  let currentCategory: DeckCategory = 'main';
  const cards: ParsedImportCard[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^(\/\/|#)?\s*commander/i.test(line)) {
      currentCategory = 'commander';
      continue;
    }
    if (/^(\/\/|#)?\s*(main|deck)/i.test(line)) {
      currentCategory = 'main';
      continue;
    }
    if (/^(\/\/|#)?\s*sideboard/i.test(line)) {
      currentCategory = 'sideboard';
      continue;
    }
    if (/^(\/\/|#)?\s*maybeboard/i.test(line)) {
      currentCategory = 'maybeboard';
      continue;
    }
    if (/^(\/\/|#)/.test(line)) {
      continue;
    }

    const match = line.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cardName = line;

    if (match) {
      qty = parseInt(match[1], 10);
      cardName = match[2];
    }

    // Strip set codes like (MH2) 138 or *F*
    let set: string | undefined;
    const setMatch = cardName.match(/\(([A-Za-z0-9_]+)\)/);
    if (setMatch) {
      set = setMatch[1].toLowerCase();
    }
    cardName = cardName.replace(/\s*\([A-Za-z0-9_]+\)\s*[0-9A-Za-z]*.*$/, '');
    cardName = cardName.replace(/\*F\*/i, '').trim();

    if (cardName) {
      cards.push({
        quantity: isNaN(qty) || qty < 1 ? 1 : qty,
        name: cardName,
        category: currentCategory,
        set,
      });
    }
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'text',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * 8. Parser for Excel TSV / Spreadsheet tables
 */
export function parseExcelTSV(content: string): ParsedDeckImport {
  const clean = cleanHtml(content);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { detectedFormat: 'excel', cards: [] };
  }

  // Split by tabs
  const headerCells = lines[0].split('\t').map((h) => h.trim().toLowerCase());
  const qtyIdx = headerCells.findIndex((h) => h.includes('quant') || h.includes('count') || h === 'qty');
  const nameIdx = headerCells.findIndex((h) => h.includes('name') || h.includes('card'));
  const catIdx = headerCells.findIndex((h) => h.includes('category') || h.includes('board'));
  const setIdx = headerCells.findIndex((h) => h.includes('set'));
  const foilIdx = headerCells.findIndex((h) => h.includes('foil'));

  const startIndex = (qtyIdx !== -1 || nameIdx !== -1) ? 1 : 0;
  const actualQtyIdx = qtyIdx !== -1 ? qtyIdx : 0;
  const actualNameIdx = nameIdx !== -1 ? nameIdx : 1;

  const cards: ParsedImportCard[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (cells.length === 0 || !cells[actualNameIdx]) continue;

    const rawQty = parseInt(cells[actualQtyIdx], 10);
    const qty = isNaN(rawQty) || rawQty < 1 ? 1 : rawQty;
    const name = cells[actualNameIdx].trim();
    if (!name) continue;

    let category: DeckCategory = 'main';
    if (catIdx !== -1 && cells[catIdx]) {
      const catVal = cells[catIdx].toLowerCase();
      if (catVal.includes('command')) category = 'commander';
      else if (catVal.includes('side')) category = 'sideboard';
      else if (catVal.includes('maybe')) category = 'maybeboard';
    }

    const set = setIdx !== -1 && cells[setIdx] ? cells[setIdx].toLowerCase() : undefined;
    const isFoil = foilIdx !== -1 && cells[foilIdx] ? /^(yes|true|foil|1)$/i.test(cells[foilIdx]) : undefined;

    cards.push({
      quantity: qty,
      name,
      category,
      set,
      isFoil,
    });
  }

  const hasCommander = cards.some((c) => c.category === 'commander');
  return {
    detectedFormat: 'excel',
    format: hasCommander ? 'commander' : 'casual',
    cards,
  };
}

/**
 * Auto-detect input format and parse
 */
export function autoDetectFormat(raw: string): ExportFormatKey {
  const text = raw.trim();

  // MTGO XML
  if (text.includes('<Deck') || text.includes('<Cards CatID=')) {
    return 'mtgo';
  }

  // BBCode
  if (/\[deck[=\]]/i.test(text) || /\[card[=\]]/i.test(text) || /\[b\](commander|creatures|sideboard)\[\/b\]/i.test(text)) {
    return 'bbcode';
  }

  // Moxfield
  if (/COMMANDER:/i.test(text) || /MAINBOARD:/i.test(text) || /MAYBEBOARD:/i.test(text)) {
    return 'moxfield';
  }

  // Archidekt
  if (/^\/\/\s*(commander|mainboard|sideboard)/im.test(text)) {
    return 'archidekt';
  }

  // TappedOut
  if (/\*CMDR\*/i.test(text) || /^SB:\s*\d+x/im.test(text)) {
    return 'tappedout';
  }

  // Excel TSV or HTML Table
  if (text.includes('<table') || (text.includes('\t') && text.split('\n')[0].includes('\t'))) {
    return 'excel';
  }

  // CSV
  const firstLine = text.split('\n')[0] || '';
  if (firstLine.includes(',') && !firstLine.match(/^\d+\s+/)) {
    return 'csv';
  }

  return 'text';
}

/**
 * Universal deck import parser
 */
export function parseDeckImport(content: string, formatHint: ExportFormatKey | 'auto' = 'auto'): ParsedDeckImport {
  const chosenFormat = formatHint === 'auto' ? autoDetectFormat(content) : formatHint;

  switch (chosenFormat) {
    case 'bbcode':
      return parseBBCode(content);
    case 'tappedout':
      return parseTappedOut(content);
    case 'moxfield':
      return parseMoxfield(content);
    case 'mtgo':
      return parseMTGO(content);
    case 'archidekt':
      return parseArchidekt(content);
    case 'csv':
      return parseCSV(content);
    case 'excel':
      return parseExcelTSV(content);
    case 'text':
    default:
      return parsePlainText(content);
  }
}
