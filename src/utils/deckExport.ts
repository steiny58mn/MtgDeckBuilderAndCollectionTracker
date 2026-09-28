import { Deck, DeckCard } from '../types/mtg';
import {
  exportDeckToText,
  generateDeckPickListLocal,
  generateBBCodeMTGNexusLocal,
  createDeckListApi,
  createDeckPickListApi,
} from './deckUtils';

export type ExportFormatKey = 
  | 'bbcode'
  | 'picklist'
  | 'tappedout'
  | 'moxfield'
  | 'mtgo'
  | 'archidekt'
  | 'csv'
  | 'text'
  | 'excel';

export interface ExportFormatOption {
  key: ExportFormatKey;
  label: string;
  badge?: string;
  description: string;
  fileExtension: string;
  mimeType: string;
}

export const EXPORT_FORMATS: ExportFormatOption[] = [
  {
    key: 'bbcode',
    label: 'BBCode (MTGNexus)',
    badge: 'API / Forum',
    description: 'Formatted [deck] tag with counts and card type categorization via /mtgtools/createdecklist.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'picklist',
    label: 'Physical Picklist',
    badge: 'API / Sorting',
    description: 'Physical card gathering picklist categorized by color and card type via /mtgtools/createdeckpicklist.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'tappedout',
    label: 'TappedOut',
    badge: 'Popular',
    description: 'TappedOut format with 1x Card Name (SET) and *CMDR* / *F* tags.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'moxfield',
    label: 'Moxfield',
    badge: 'Modern',
    description: 'Standard Moxfield import text with COMMANDER:, MAINBOARD:, and SIDEBOARD: sections.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'mtgo',
    label: 'Magic Online',
    badge: 'MTGO',
    description: 'Standard Magic Online text format or downloadable .dek XML format.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'archidekt',
    label: 'Archidekt',
    badge: 'Builder',
    description: 'Archidekt format with // Commander and // Mainboard section headers and set codes.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'csv',
    label: 'CSV Data',
    badge: 'Spreadsheet',
    description: 'Full comma-separated values spreadsheet containing names, quantities, sets, rarities, and prices.',
    fileExtension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
  },
  {
    key: 'text',
    label: 'Plain Text',
    badge: 'Universal',
    description: 'Clean line-by-line card list compatible with MTG Arena, cockatrice, and deck builders.',
    fileExtension: 'txt',
    mimeType: 'text/plain;charset=utf-8',
  },
  {
    key: 'excel',
    label: 'Excel',
    badge: 'XLS / Sheets',
    description: 'Formatted workbook compatible with Microsoft Excel and Google Sheets with totals and styling.',
    fileExtension: 'xls',
    mimeType: 'application/vnd.ms-excel;charset=utf-8',
  },
];

/**
 * 1. BBCode for MTGNexus (matches /mtgtools/createdecklist structure)
 */
export function generateBBCodeMTGNexus(deck: Deck): string {
  return generateBBCodeMTGNexusLocal(deck);
}

/**
 * 2. TappedOut
 */
export function generateTappedOut(deck: Deck): string {
  const lines: string[] = [];
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');
  const maybeCards = deck.cards.filter((c) => c.category === 'maybeboard');

  commanderCards.forEach((c) => {
    const setPart = c.set ? ` (${c.set.toUpperCase()})` : '';
    const foilPart = c.isFoil ? ' *F*' : '';
    lines.push(`${c.quantity}x ${c.name}${setPart} *CMDR*${foilPart}`);
  });

  mainCards.forEach((c) => {
    const setPart = c.set ? ` (${c.set.toUpperCase()})` : '';
    const foilPart = c.isFoil ? ' *F*' : '';
    lines.push(`${c.quantity}x ${c.name}${setPart}${foilPart}`);
  });

  sideCards.forEach((c) => {
    const setPart = c.set ? ` (${c.set.toUpperCase()})` : '';
    const foilPart = c.isFoil ? ' *F*' : '';
    lines.push(`SB: ${c.quantity}x ${c.name}${setPart}${foilPart}`);
  });

  if (maybeCards.length > 0) {
    lines.push('');
    lines.push('Maybeboard:');
    maybeCards.forEach((c) => {
      const setPart = c.set ? ` (${c.set.toUpperCase()})` : '';
      const foilPart = c.isFoil ? ' *F*' : '';
      lines.push(`${c.quantity}x ${c.name}${setPart}${foilPart}`);
    });
  }

  return lines.join('\n');
}

/**
 * 3. Moxfield
 */
export function generateMoxfield(deck: Deck): string {
  const lines: string[] = [];
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');
  const maybeCards = deck.cards.filter((c) => c.category === 'maybeboard');

  const formatCard = (c: DeckCard) => {
    let line = `${c.quantity} ${c.name}`;
    if (c.set) {
      line += ` (${c.set.toUpperCase()})`;
      if (c.collector_number) {
        line += ` ${c.collector_number}`;
      }
    }
    if (c.isFoil) {
      line += ' *F*';
    }
    return line;
  };

  if (commanderCards.length > 0) {
    lines.push('COMMANDER:');
    commanderCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (mainCards.length > 0) {
    lines.push('MAINBOARD:');
    mainCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (sideCards.length > 0) {
    lines.push('SIDEBOARD:');
    sideCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (maybeCards.length > 0) {
    lines.push('MAYBEBOARD:');
    maybeCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * 4. Magic Online (MTGO) Text
 */
export function generateMTGOText(deck: Deck): string {
  const lines: string[] = [];
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');

  commanderCards.forEach((c) => lines.push(`${c.quantity} ${c.name}`));
  mainCards.forEach((c) => lines.push(`${c.quantity} ${c.name}`));

  if (sideCards.length > 0) {
    lines.push('');
    lines.push('Sideboard');
    sideCards.forEach((c) => lines.push(`${c.quantity} ${c.name}`));
  }

  return lines.join('\n');
}

/**
 * Magic Online .dek XML format
 */
export function generateMTGODekXml(deck: Deck): string {
  let commanderCards = deck.cards.filter((c) => c.category === 'commander');
  let mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');

  // If no cards are categorized as commander, but commanderName is defined, check mainCards
  if (commanderCards.length === 0 && deck.commanderName) {
    const matchingCmdr = mainCards.find(
      (c) => c.name.toLowerCase() === deck.commanderName?.toLowerCase()
    );
    if (matchingCmdr) {
      commanderCards = [matchingCmdr];
      mainCards = mainCards.filter((c) => c.id !== matchingCmdr.id);
    }
  }

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <NetDeckID>0</NetDeckID>',
    '  <Pre modern="false"/>',
  ];

  // In MTGO .dek files, Commanders must be designated in the Sideboard (Sideboard="true")
  commanderCards.forEach((c) => {
    lines.push(`  <Cards CatID="0" Quantity="${c.quantity}" Sideboard="true" Name="${escapeXml(c.name)}" Annotation="0"/>`);
  });

  mainCards.forEach((c) => {
    lines.push(`  <Cards CatID="0" Quantity="${c.quantity}" Sideboard="false" Name="${escapeXml(c.name)}" Annotation="0"/>`);
  });

  sideCards.forEach((c) => {
    lines.push(`  <Cards CatID="0" Quantity="${c.quantity}" Sideboard="true" Name="${escapeXml(c.name)}" Annotation="0"/>`);
  });

  lines.push('</Deck>');
  return lines.join('\n');
}

/**
 * 5. Archidekt
 */
export function generateArchidekt(deck: Deck): string {
  const lines: string[] = [];
  const commanderCards = deck.cards.filter((c) => c.category === 'commander');
  const mainCards = deck.cards.filter((c) => c.category === 'main');
  const sideCards = deck.cards.filter((c) => c.category === 'sideboard');
  const maybeCards = deck.cards.filter((c) => c.category === 'maybeboard');

  const formatCard = (c: DeckCard) => {
    let line = `${c.quantity}x ${c.name}`;
    if (c.set) {
      line += ` (${c.set.toUpperCase()}`;
      if (c.collector_number) {
        line += `:${c.collector_number}`;
      }
      line += ')';
    }
    if (c.isFoil) {
      line += ' *F*';
    }
    return line;
  };

  if (commanderCards.length > 0) {
    lines.push('// Commander');
    commanderCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (mainCards.length > 0) {
    lines.push('// Mainboard');
    mainCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (sideCards.length > 0) {
    lines.push('// Sideboard');
    sideCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  if (maybeCards.length > 0) {
    lines.push('// Maybeboard');
    maybeCards.forEach((c) => lines.push(formatCard(c)));
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * 6. CSV (RFC 4180 compliant)
 */
export function generateCSV(deck: Deck): string {
  const headers = [
    'Quantity',
    'Card Name',
    'Category',
    'Set Code',
    'Set Name',
    'Collector Number',
    'Type Line',
    'Mana Cost',
    'Mana Value',
    'Rarity',
    'Foil',
    'Unit Price USD',
    'Total Price USD',
  ];

  const escapeCsv = (val: any) => {
    const s = val === undefined || val === null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows: string[] = [headers.join(',')];

  deck.cards.forEach((c) => {
    const rawPrice = c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0;
    const unitPrice = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice)) || 0);
    const lineTotal = ((Number(unitPrice) || 0) * c.quantity).toFixed(2);
    rows.push(
      [
        c.quantity,
        c.name,
        c.category,
        c.set ? c.set.toUpperCase() : '',
        c.set_name || '',
        c.collector_number || '',
        c.type_line || '',
        c.mana_cost || '',
        c.cmc || 0,
        c.rarity || 'common',
        c.isFoil ? 'Yes' : 'No',
        unitPrice.toFixed(2),
        lineTotal,
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  return rows.join('\r\n');
}

/**
 * 7. Plain Text
 */
export function generatePlainText(deck: Deck): string {
  return exportDeckToText(deck);
}

/**
 * 8. Excel Options:
 * - TSV for copying to clipboard to paste right into Excel or Google Sheets
 */
export function generateExcelTSV(deck: Deck): string {
  const headers = [
    'Quantity',
    'Card Name',
    'Category',
    'Set',
    'Collector #',
    'Type Line',
    'Mana Cost',
    'CMC',
    'Rarity',
    'Foil',
    'Unit Price ($)',
    'Total Price ($)',
  ];

  const rows: string[] = [headers.join('\t')];

  deck.cards.forEach((c) => {
    const rawPrice = c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0;
    const unitPrice = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice)) || 0);
    const lineTotal = ((Number(unitPrice) || 0) * c.quantity).toFixed(2);
    rows.push(
      [
        c.quantity,
        c.name,
        c.category,
        c.set ? c.set.toUpperCase() : '',
        c.collector_number || '',
        c.type_line || '',
        c.mana_cost || '',
        c.cmc || 0,
        c.rarity || 'common',
        c.isFoil ? 'Yes' : 'No',
        unitPrice.toFixed(2),
        lineTotal,
      ].join('\t')
    );
  });

  return rows.join('\r\n');
}

/**
 * Native HTML table workbook (.xls) that Excel directly opens with formatted headers and currency
 */
export function generateExcelWorkbook(deck: Deck): string {
  const escapeHtml = (s: any) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  let tableRows = '';
  let grandTotal = 0;
  let totalCards = 0;

  deck.cards.forEach((c) => {
    const rawPrice = c.isFoil && c.priceUsdFoil ? c.priceUsdFoil : c.priceUsd || 0;
    const unitPrice = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice)) || 0);
    const lineTotal = unitPrice * c.quantity;
    grandTotal += lineTotal;
    totalCards += c.quantity;

    tableRows += `
      <tr>
        <td style="text-align:center;mso-number-format:'0';">${c.quantity}</td>
        <td><strong>${escapeHtml(c.name)}</strong></td>
        <td style="text-transform:capitalize;">${escapeHtml(c.category)}</td>
        <td style="text-align:center;font-family:monospace;">${escapeHtml((c.set || '').toUpperCase())}</td>
        <td style="text-align:center;mso-number-format:'\\@';">${escapeHtml(c.collector_number || '')}</td>
        <td>${escapeHtml(c.type_line || '')}</td>
        <td style="text-align:center;">${escapeHtml(c.mana_cost || '')}</td>
        <td style="text-align:center;mso-number-format:'0';">${c.cmc || 0}</td>
        <td style="text-transform:capitalize;">${escapeHtml(c.rarity || '')}</td>
        <td style="text-align:center;">${c.isFoil ? 'Foil' : 'Normal'}</td>
        <td style="text-align:right;mso-number-format:'\\$#,##0.00';">$${unitPrice.toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold;mso-number-format:'\\$#,##0.00';">$${lineTotal.toFixed(2)}</td>
      </tr>
    `;
  });

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escapeHtml(deck.name)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>
        body { font-family: Calibri, sans-serif; font-size: 11pt; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #1c1917; color: #f59e0b; padding: 8px 10px; border: 1px solid #44403c; font-weight: bold; }
        td { padding: 6px 8px; border: 1px solid #d6d3d1; vertical-align: middle; }
        tr:nth-child(even) { background-color: #fafaf9; }
        .summary-row { background-color: #f5f5f4; font-weight: bold; }
      </style>
    </head>
    <body>
      <h2>${escapeHtml(deck.name)} (${escapeHtml(deck.format)})</h2>
      ${deck.description ? `<p>${escapeHtml(deck.description)}</p>` : ''}
      <table>
        <thead>
          <tr>
            <th>Qty</th>
            <th>Card Name</th>
            <th>Category</th>
            <th>Set</th>
            <th>#</th>
            <th>Type</th>
            <th>Mana</th>
            <th>CMC</th>
            <th>Rarity</th>
            <th>Finish</th>
            <th>Unit Price (USD)</th>
            <th>Total (USD)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          <tr class="summary-row">
            <td style="text-align:center;">${totalCards}</td>
            <td colspan="9" style="text-align:right;"><strong>Total Estimated Deck Value:</strong></td>
            <td></td>
            <td style="text-align:right;color:#059669;font-weight:bold;">$${grandTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `.trim();
}

/**
 * Universal content generator for a specific format key
 */
export function generateExportContent(format: ExportFormatKey, deck: Deck): string {
  switch (format) {
    case 'bbcode':
      // Exclusively retrieved via API /mtgtools/createdecklist (no local fallback)
      return '';
    case 'picklist':
      // Exclusively retrieved via API /mtgtools/createdeckpicklist (no local fallback)
      return '';
    case 'tappedout':
      return generateTappedOut(deck);
    case 'moxfield':
      return generateMoxfield(deck);
    case 'mtgo':
      return generateMTGOText(deck);
    case 'archidekt':
      return generateArchidekt(deck);
    case 'csv':
      return generateCSV(deck);
    case 'text':
      return generatePlainText(deck);
    case 'excel':
      return generateExcelWorkbook(deck);
    default:
      return generatePlainText(deck);
  }
}

/**
 * Resolves a clean, capitalized filename base for deck exports.
 * Uses the Commander's name (or cards categorized as commander),
 * stripped of punctuation and underscores, with each word capitalized.
 * Falls back to the deck name if no commander is assigned.
 */
export function getExportFilenameBase(deck: Deck): string {
  let rawName = deck.commanderName;

  if (!rawName && deck.cards && deck.cards.length > 0) {
    const commanderCards = deck.cards.filter((c) => c.category === 'commander');
    if (commanderCards.length > 0) {
      rawName = commanderCards.map((c) => c.name).join(' ');
    }
  }

  if (!rawName || !rawName.trim()) {
    rawName = deck.name || 'Deck';
  }

  // Remove apostrophes directly so "Praetors'" -> "Praetors", "Urza's" -> "Urzas"
  const withoutApostrophes = rawName.replace(/['’]/g, '');

  // Strip all punctuation and underscores, replacing with spaces
  const cleaned = withoutApostrophes.replace(/[^a-zA-Z0-9]+/g, ' ').trim();

  if (!cleaned) {
    return 'Deck';
  }

  // Capitalize each word
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Trigger browser file download
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string) {
  // If CSV or TSV, prepend UTF-8 BOM so Excel opens special characters correctly
  const payload = (mimeType.includes('csv') || mimeType.includes('tab-separated')) && !content.startsWith('\uFEFF')
    ? '\uFEFF' + content
    : content;
  
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export {
  createDeckListApi,
  createDeckPickListApi,
  generateDeckPickListLocal,
  generateBBCodeMTGNexusLocal,
};
