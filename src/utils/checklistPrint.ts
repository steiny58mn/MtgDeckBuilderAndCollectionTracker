/**
 * Utility for generating and printing high-readability MTG Physical Checklists.
 * Formatted for clean printing on standard paper (Letter / A4) or PDF export.
 * Supports 1, 2, 3, or 4 columns to optimize paper savings while preserving
 * complete card details and cross-deck usage information.
 * Cards display left-to-right in alphabetical order.
 *
 * Provides high-speed client-side PDF generation via jsPDF for instant
 * preview and 1-click printing without browser print-preview lag.
 */

import { jsPDF } from 'jspdf';

export interface ChecklistPrintDeckUsage {
  deckId?: string;
  deckName: string;
  quantity: number;
  isCurrentDeck?: boolean;
}

export interface ChecklistPrintItem {
  id: string;
  name: string;
  quantity: number;
  totalOwned?: number;
  totalInDecks?: number;
  totalInOtherDecks?: number;
  decksList?: ChecklistPrintDeckUsage[];
  set?: string;
  collectorNumber?: string;
  typeLine?: string;
  isFoil?: boolean;
  condition?: string;
  price?: number | string;
  isChecked?: boolean;
  deckUsageText?: string;
  category?: string;
  isMissing?: boolean;
}

export interface ChecklistPrintOptions {
  title: string;
  subtitle?: string;
  binderName?: string;
  deckName?: string;
  deckFormat?: string;
  verifiedCount?: number;
  totalCards?: number;
  percentVerified?: number;
  filterLabel?: string;
  columns?: 1 | 2 | 3 | 4;
  items: ChecklistPrintItem[];
}

const escapeHtml = (str?: string | number | null): string => {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Generate a high-speed, native vector PDF document using jsPDF.
 * Renders in ~50ms and eliminates browser print preview spinning/lag.
 */
/**
 * Abbreviate a deck name to save space while keeping it recognizable.
 * Strips prefixes (EDH:, Commander:), parentheticals, epithets after commas,
 * and condenses long names so multiple decks can fit in tight checklist columns.
 */
export const abbreviateDeckName = (name: string): string => {
  if (!name) return '';
  let clean = name.trim();

  // Strip prefixes like "EDH - ", "EDH: ", "Commander: ", "Deck - ", "MTG: "
  clean = clean.replace(/^(edh|commander|deck|mtg)\s*[:\-–—]\s*/i, '');

  // Strip parentheticals and bracketed notes: e.g. "Atraxa (Superfriends)" -> "Atraxa"
  clean = clean.replace(/\s*[\(\[].*?[\)\]]/g, '');

  // Strip surrounding quotes
  clean = clean.replace(/["'“”]/g, '').trim();

  // If there's a comma (typical for commanders like "Atraxa, Praetors' Voice" or "Urza, Lord High Artificer"),
  // keep the prominent first part before the comma
  if (clean.includes(',')) {
    const beforeComma = clean.split(',')[0].trim();
    if (beforeComma.length >= 3) {
      clean = beforeComma;
    }
  }

  // If it has a colon or dash separator, e.g. "Sliver - Hive" -> take the main part
  if (clean.includes(' - ')) {
    clean = clean.split(' - ')[0].trim();
  } else if (clean.includes(': ')) {
    clean = clean.split(': ')[0].trim();
  }

  // If still very long (> 13 chars), condense smartly
  if (clean.length > 13) {
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      if (words[1].toLowerCase() === 'the' || words[1].toLowerCase() === 'of') {
        clean = words[0];
      } else {
        const twoWords = `${words[0]} ${words[1]}`;
        if (twoWords.length <= 13) {
          clean = twoWords;
        } else {
          clean = words[0].length >= 4 ? words[0] : twoWords.slice(0, 12) + '…';
        }
      }
    } else {
      clean = clean.slice(0, 12) + '…';
    }
  }

  return clean;
};

export const generateChecklistPdf = (options: ChecklistPrintOptions): jsPDF => {
  const {
    title,
    subtitle = 'MTG Physical Card Verification & Gathering Checklist',
    binderName,
    deckName,
    deckFormat,
    verifiedCount,
    totalCards,
    percentVerified,
    filterLabel,
    columns = 2,
    items = [],
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 24;
  const contentWidth = pageWidth - margin * 2;
  const isDeckChecklist = Boolean(deckName);

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let curY = margin;

  const drawHeader = (isFirstPage: boolean) => {
    if (isFirstPage) {
      // Main Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(title, margin, curY + 12);

      // Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, margin, curY + 22);

      // Metadata Summary Pills / Details
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      const metaParts: string[] = [
        `Generated: ${dateFormatted}`,
        `Total: ${items.length} cards (${totalQuantity} copies)`,
        `${columns} Column${columns > 1 ? 's' : ''} (A-Z Left to Right)`,
      ];
      if (binderName) metaParts.push(`Binder: ${binderName}`);
      if (deckName) metaParts.push(`Deck: ${deckName}${deckFormat ? ` (${deckFormat.toUpperCase()})` : ''}`);
      if (verifiedCount !== undefined && totalCards !== undefined) {
        metaParts.push(`Verified: ${verifiedCount}/${totalCards} (${percentVerified || 0}%)`);
      }
      if (filterLabel) metaParts.push(`Filter: ${filterLabel}`);

      const metaText = metaParts.join('  •  ');
      const truncMeta = doc.splitTextToSize(metaText, contentWidth)[0] || metaText;
      doc.text(truncMeta, margin, curY + 33);

      // Divider Line
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(1.2);
      doc.line(margin, curY + 38, pageWidth - margin, curY + 38);

      curY += 46;
    } else {
      // Compact Top Running Header for Page 2+
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(title, margin, curY + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`${dateFormatted}  •  ${columns} Columns Layout`, pageWidth - margin, curY + 9, { align: 'right' });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.8);
      doc.line(margin, curY + 14, pageWidth - margin, curY + 14);

      curY += 20;
    }
  };

  drawHeader(true);

  // Column Dimensions & Geometry
  const cols = columns;
  const colGap = cols === 1 ? 0 : cols === 2 ? 10 : cols === 3 ? 8 : 6;
  const colWidth = (contentWidth - colGap * (cols - 1)) / cols;
  const rowHeight = cols === 1 ? 18 : cols === 2 ? 20 : cols === 3 ? 21 : 22;
  const rowGap = 2.0;

  const totalRows = Math.ceil(items.length / cols);

  for (let r = 0; r < totalRows; r++) {
    // Check if new page is needed
    if (curY + rowHeight > pageHeight - margin - 16) {
      doc.addPage();
      curY = margin;
      drawHeader(false);
    }

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= items.length) break;
      const item = items[idx];
      const itemX = margin + c * (colWidth + colGap);
      const itemY = curY;

      const totalOwned = item.totalOwned !== undefined ? item.totalOwned : item.quantity;
      const totalInDecks = item.totalInDecks !== undefined ? item.totalInDecks : 0;
      const isChecked = Boolean(item.isChecked);
      const isMissing = Boolean(item.isMissing);

      // Card Box Background Fill & Border
      if (isChecked) {
        doc.setFillColor(240, 253, 244); // light green verified
        doc.setDrawColor(187, 247, 208);
      } else if (isMissing) {
        doc.setFillColor(255, 251, 235); // light amber missing
        doc.setDrawColor(253, 230, 138);
      } else {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
      }
      doc.setLineWidth(0.6);
      doc.roundedRect(itemX, itemY, colWidth, rowHeight, 2, 2, 'FD');

      // Needed Quantity Badge (at far left edge, replacing checkbox & card #)
      const qtyStr = `${item.quantity}x`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cols === 4 ? 5.6 : cols === 3 ? 6.2 : 6.8);
      const qtyBadgeW = doc.getTextWidth(qtyStr) + 3.6;
      const qtyBadgeH = cols === 4 ? 6.5 : 7.2;
      const qtyBadgeX = itemX + 3;
      const qtyBadgeY = itemY + 2.2;

      // Dark slate badge with crisp white text
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(qtyBadgeX, qtyBadgeY, qtyBadgeW, qtyBadgeH, 1.2, 1.2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(qtyStr, qtyBadgeX + qtyBadgeW / 2, qtyBadgeY + qtyBadgeH - 1.8, { align: 'center' });

      // Badges in top right: Total Owned & In Decks / Other Decks (plus Missing)
      const badgeY = itemY + 2.2;
      const deckBadgeH = cols === 4 ? 6.5 : 7.2;

      // Decks Badge
      const deckBadgeStr = cols === 4
        ? `${isDeckChecklist ? 'O' : 'D'}:${totalInDecks}`
        : `${isDeckChecklist ? 'Oth' : 'In'}:${totalInDecks}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cols === 4 ? 5.0 : cols === 3 ? 5.4 : 5.8);
      const deckBadgeW = doc.getTextWidth(deckBadgeStr) + 4;
      const deckBadgeX = itemX + colWidth - deckBadgeW - 3;

      if (totalInDecks > 0) {
        doc.setFillColor(237, 233, 254); // purple-100
        doc.setDrawColor(196, 181, 253); // purple-300
        doc.setLineWidth(0.4);
        doc.roundedRect(deckBadgeX, badgeY, deckBadgeW, deckBadgeH, 1.2, 1.2, 'FD');
        doc.setTextColor(91, 33, 182); // purple-800
      } else {
        doc.setFillColor(241, 245, 249); // slate-100
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.4);
        doc.roundedRect(deckBadgeX, badgeY, deckBadgeW, deckBadgeH, 1.2, 1.2, 'FD');
        doc.setTextColor(100, 116, 139); // slate-500
      }
      doc.text(deckBadgeStr, deckBadgeX + deckBadgeW / 2, badgeY + deckBadgeH - 1.8, { align: 'center' });

      // Total Owned Badge
      const totBadgeStr = cols === 4 ? `T:${totalOwned}` : `Tot:${totalOwned}`;
      const totBadgeW = doc.getTextWidth(totBadgeStr) + 4;
      const totBadgeX = deckBadgeX - totBadgeW - 2;

      doc.setFillColor(220, 252, 231); // emerald-100
      doc.setDrawColor(134, 239, 172); // emerald-300
      doc.setLineWidth(0.4);
      doc.roundedRect(totBadgeX, badgeY, totBadgeW, deckBadgeH, 1.2, 1.2, 'FD');
      doc.setTextColor(21, 128, 61); // emerald-700
      doc.text(totBadgeStr, totBadgeX + totBadgeW / 2, badgeY + deckBadgeH - 1.8, { align: 'center' });

      // Missing Badge
      let rightBadgesLeftEdge = totBadgeX;
      if (isMissing) {
        const missStr = cols === 4 ? '!M' : '!MISS';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cols === 4 ? 4.5 : 5.0);
        const missBadgeW = doc.getTextWidth(missStr) + 3.5;
        const missBadgeX = totBadgeX - missBadgeW - 2;
        rightBadgesLeftEdge = missBadgeX;

        doc.setFillColor(254, 243, 199); // amber-100
        doc.setDrawColor(252, 211, 77); // amber-300
        doc.setLineWidth(0.4);
        doc.roundedRect(missBadgeX, badgeY, missBadgeW, deckBadgeH, 1.2, 1.2, 'FD');
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text(missStr, missBadgeX + missBadgeW / 2, badgeY + deckBadgeH - 1.8, { align: 'center' });
      }

      // Foil Badge calculation
      let foilBadgeW = 0;
      if (item.isFoil) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cols === 4 ? 4.4 : cols === 3 ? 4.8 : 5.2);
        foilBadgeW = doc.getTextWidth('✦FOIL') + 3.5;
      }

      // Card Name (bold)
      const nameStartX = qtyBadgeX + qtyBadgeW + 2.5;
      const maxNameWidth = Math.max(20, rightBadgesLeftEdge - nameStartX - (item.isFoil ? foilBadgeW + 3 : 0));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cols === 4 ? 5.8 : cols === 3 ? 6.5 : 7.2);
      doc.setTextColor(isChecked ? 100 : 15, isChecked ? 116 : 23, isChecked ? 139 : 42);

      let cardDisplayName = item.name || '';
      if (item.category === 'commander') cardDisplayName += ' (Cmdr)';
      const truncName = doc.splitTextToSize(cardDisplayName, maxNameWidth)[0] || cardDisplayName;
      doc.text(truncName, nameStartX, itemY + (cols === 4 ? 7.6 : 8.2));

      // Draw Foil Badge (fuchsia pill)
      if (item.isFoil) {
        const nameTextW = doc.getTextWidth(truncName);
        const foilX = nameStartX + nameTextW + 2;
        const foilY = itemY + 2.2;
        const foilH = cols === 4 ? 6.5 : 7.2;

        doc.setFillColor(250, 232, 255); // fuchsia-100
        doc.setDrawColor(240, 171, 252); // fuchsia-300
        doc.setLineWidth(0.4);
        doc.roundedRect(foilX, foilY, foilBadgeW, foilH, 1.2, 1.2, 'FD');
        doc.setTextColor(162, 28, 175); // fuchsia-700
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(cols === 4 ? 4.4 : cols === 3 ? 4.8 : 5.2);
        doc.text('✦FOIL', foilX + foilBadgeW / 2, foilY + foilH - 1.8, { align: 'center' });
      }

      // Decks info ONLY if copies are in other decks (NO quantities, abbreviated names, all decks listed)
      if (cols > 1) {
        let rawDeckNames: string[] = [];
        if (item.decksList && item.decksList.length > 0) {
          rawDeckNames = item.decksList.map((d) => d.deckName);
        } else if (item.deckUsageText && !item.deckUsageText.includes('None') && !item.deckUsageText.includes('Binder Only') && !item.deckUsageText.includes('Not in any decks')) {
          rawDeckNames = item.deckUsageText.split(',').map((s) => s.replace(/^\s*(in\s+\d+\s+other\s+decks?:\s*|\d+x\s+(in\s+)?)/i, '').replace(/["'“”]/g, '').trim()).filter(Boolean);
        }

        if (rawDeckNames.length > 0) {
          const abbrevNames = Array.from(new Set(rawDeckNames.map(abbreviateDeckName).filter(Boolean)));
          if (abbrevNames.length > 0) {
            const decksPrefix = cols === 4 ? 'D: ' : 'Decks: ';
            let decksStr = `${decksPrefix}${abbrevNames.join(', ')}`;

            const maxDecksWidth = colWidth - 7;
            let decksFontSize = cols === 4 ? 4.6 : cols === 3 ? 5.0 : 5.5;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(decksFontSize);

            while (doc.getTextWidth(decksStr) > maxDecksWidth && decksFontSize > 3.4) {
              decksFontSize -= 0.2;
              doc.setFontSize(decksFontSize);
            }

            if (doc.getTextWidth(decksStr) > maxDecksWidth) {
              decksStr = `${decksPrefix}${abbrevNames.join('/')}`;
              while (doc.getTextWidth(decksStr) > maxDecksWidth && decksFontSize > 3.0) {
                decksFontSize -= 0.2;
                doc.setFontSize(decksFontSize);
              }
            }

            doc.setTextColor(79, 70, 229); // indigo-600
            doc.text(decksStr, itemX + 3.5, itemY + (cols === 4 ? 14 : cols === 3 ? 14.5 : 15.5));
          }
        }
      }
    }

    curY += rowHeight + rowGap;
  }

  // Footer on Every Page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('MTG Deck Builder & Collection Tracker  •  Physical Audit Sheet', margin, pageHeight - margin + 8);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - margin + 8, { align: 'right' });
  }

  return doc;
};

/**
 * Generate and open the PDF directly in a new browser tab or download it.
 * Bypasses slow browser print preview and displays instantly in the native PDF viewer.
 */
export const printChecklistPdf = (options: ChecklistPrintOptions): boolean => {
  try {
    const doc = generateChecklistPdf(options);
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const pdfWindow = window.open(pdfUrl, '_blank');
    if (!pdfWindow) {
      // Fallback: Trigger direct file download if browser popup is blocked
      const filename = `${(options.deckName || options.binderName || 'Checklist').replace(/[^a-zA-Z0-9_-]/g, '_')}_Checklist.pdf`;
      doc.save(filename);
    }
    return true;
  } catch (err) {
    console.error('Failed to generate checklist PDF:', err);
    return false;
  }
};

/**
 * Download the checklist PDF directly to the user's filesystem.
 */
export const downloadChecklistPdf = (options: ChecklistPrintOptions): void => {
  const doc = generateChecklistPdf(options);
  const filename = `${(options.deckName || options.binderName || 'Checklist').replace(/[^a-zA-Z0-9_-]/g, '_')}_Checklist.pdf`;
  doc.save(filename);
};

export const generateChecklistHtml = (options: ChecklistPrintOptions): string => {
  const {
    title,
    subtitle = 'MTG Physical Card Verification & Gathering Checklist',
    binderName,
    deckName,
    deckFormat,
    verifiedCount,
    totalCards,
    percentVerified,
    filterLabel,
    columns = 2,
    items = [],
  } = options;

  const isDeckChecklist = Boolean(deckName);
  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Generate Table Rows (for 1-column table view)
  const rowsHtml = items.map((item, index) => {
    const isChecked = Boolean(item.isChecked);
    const boxContent = isChecked ? '&#10003;' : '';
    const boxClass = isChecked ? 'check-box checked' : 'check-box';
    const foilBadge = item.isFoil ? '<span class="foil-badge">&#10022; FOIL</span>' : '';
    const setInfo = item.set ? `${escapeHtml(item.set.toUpperCase())}${item.collectorNumber ? ` #${escapeHtml(item.collectorNumber)}` : ''}` : '';
    const categoryBadge = item.category && item.category !== 'main' ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : '';

    const totalOwned = item.totalOwned !== undefined ? item.totalOwned : item.quantity;
    const totalInDecks = item.totalInDecks !== undefined ? item.totalInDecks : 0;

    let decksSummaryHtml = '';
    if (item.decksList && item.decksList.length > 0) {
      decksSummaryHtml = item.decksList.map((d) => {
        return `<span class="deck-chip"><b>${d.quantity}x</b> in &ldquo;${escapeHtml(d.deckName)}&rdquo;</span>`;
      }).join(', ');
    } else if (item.deckUsageText && !item.deckUsageText.includes('None') && !item.deckUsageText.includes('Binder Only') && !item.deckUsageText.includes('Not in any decks')) {
      decksSummaryHtml = `<span class="deck-text">${escapeHtml(item.deckUsageText)}</span>`;
    } else {
      decksSummaryHtml = '-';
    }

    if (item.isMissing) {
      const missingCount = Math.max(1, (item.quantity || 1) - (item.totalOwned || 0));
      decksSummaryHtml = `<span class="status-missing">&#9888; Missing (${missingCount}x needed)</span>` + (decksSummaryHtml !== '-' ? ` &bull; ${decksSummaryHtml}` : '');
    }

    return `
      <tr class="${isChecked ? 'row-verified' : ''} ${item.isMissing ? 'row-missing' : ''}">
        <td class="col-qty text-center font-bold">${item.quantity}x</td>
        <td class="col-name">
          <span class="card-name ${isChecked ? 'name-checked' : ''}">${escapeHtml(item.name)}</span>
          ${categoryBadge}
        </td>
        <td class="col-finish text-center">${foilBadge || '<span style="color:#94a3b8;">Normal</span>'}</td>
        <td class="col-total text-center font-bold">${totalOwned}</td>
        <td class="col-indecks text-center font-bold ${totalInDecks > 0 ? 'text-indecks' : 'text-idle'}">${totalInDecks}</td>
        <td class="col-decks">${decksSummaryHtml}</td>
      </tr>
    `;
  }).join('');

  // Generate Card Entries (for multi-column grid: 1, 2, 3, or 4 columns, flowing left to right)
  const cardsHtml = items.map((item, index) => {
    const isChecked = Boolean(item.isChecked);
    const boxContent = isChecked ? '&#10003;' : '';
    const boxClass = isChecked ? 'check-box checked' : 'check-box';
    const foilBadge = item.isFoil ? '<span class="foil-badge">&#10022; FOIL</span>' : '';
    const setInfo = item.set ? `${escapeHtml(item.set.toUpperCase())}${item.collectorNumber ? ` #${escapeHtml(item.collectorNumber)}` : ''}` : '';
    const categoryBadge = item.category && item.category !== 'main' ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : '';

    const totalOwned = item.totalOwned !== undefined ? item.totalOwned : item.quantity;
    const totalInDecks = item.totalInDecks !== undefined ? item.totalInDecks : 0;

    let decksSummaryHtml = '';
    if (item.decksList && item.decksList.length > 0) {
      decksSummaryHtml = item.decksList.map((d) => {
        return `<span class="deck-chip"><b>${d.quantity}x</b> in &ldquo;${escapeHtml(d.deckName)}&rdquo;</span>`;
      }).join(', ');
    } else if (item.deckUsageText && !item.deckUsageText.includes('None') && !item.deckUsageText.includes('Binder Only') && !item.deckUsageText.includes('Not in any decks')) {
      decksSummaryHtml = `<span class="deck-text">${escapeHtml(item.deckUsageText)}</span>`;
    }

    return `
      <div class="card-entry ${isChecked ? 'entry-verified' : ''} ${item.isMissing ? 'entry-missing' : ''}">
        <div class="entry-header">
          <div class="entry-left">
            <span class="entry-qty-badge">${item.quantity}x</span>
            <span class="entry-name ${isChecked ? 'name-checked' : ''}">${escapeHtml(item.name)}</span>
            ${foilBadge}
            ${categoryBadge}
          </div>
          <div class="entry-right">
            <span class="stat-pill stat-total">Tot: <b>${totalOwned}</b></span>
            <span class="stat-pill ${totalInDecks > 0 ? 'stat-indecks' : 'stat-idle'}">${isDeckChecklist ? 'Oth' : 'In'}: <b>${totalInDecks}</b></span>
            ${item.isMissing ? `<span class="stat-pill stat-missing">MISSING</span>` : ''}
          </div>
        </div>

        ${decksSummaryHtml ? `
        <div class="entry-usage">
          <span class="usage-label">Decks:</span>
          ${decksSummaryHtml}
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #f8fafc;
      font-size: 11px;
      line-height: 1.35;
    }

    /* Screen Preview Floating Action Bar */
    .floating-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #334155;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      flex-wrap: wrap;
    }
    .bar-info {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
    }
    .bar-pill {
      background: #1e293b;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #334155;
      font-weight: 600;
      color: #38bdf8;
    }
    .paper-badge {
      background: #064e3b;
      color: #6ee7b7;
      border: 1px solid #059669;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    /* Interactive Column Switcher Controls */
    .column-switcher {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #1e293b;
      padding: 3px 6px;
      border-radius: 8px;
      border: 1px solid #334155;
    }
    .switcher-label {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      margin-right: 4px;
    }
    .btn-group-toggle {
      display: inline-flex;
      background: #0f172a;
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }
    .toggle-btn {
      background: transparent;
      border: none;
      color: #cbd5e1;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .toggle-btn:hover {
      color: #ffffff;
      background: #334155;
    }
    .toggle-btn.active {
      background: #10b981;
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    }
    .view-mode-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .btn-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .print-btn {
      background: #10b981;
      color: white;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
    .print-btn:hover { background: #059669; }
    .close-btn {
      background: #334155;
      color: #cbd5e1;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
    }
    .close-btn:hover { background: #475569; color: white; }

    /* Printable Content Container */
    .print-container {
      max-width: 1100px;
      margin: 16px auto;
      background: #ffffff;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    /* Header Block */
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      font-size: 17px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 2px 0;
      letter-spacing: -0.01em;
    }
    .subtitle {
      font-size: 10.5px;
      color: #64748b;
      margin: 0;
    }
    .meta-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9.5px;
      background: #f1f5f9;
      color: #334155;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      font-weight: 500;
    }
    .meta-tag b {
      color: #0f172a;
    }
    .meta-tag.highlight {
      background: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
    }

    /* Checklist Table (1-Column Table View) */
    .table-container {
      width: 100%;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    thead {
      display: table-header-group;
    }
    th {
      background: #f1f5f9;
      color: #0f172a;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 5px 6px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      font-size: 10px;
    }
    tr:nth-child(even) td {
      background-color: #fafbfc;
    }
    tr.row-verified td {
      background-color: #f0fdf4 !important;
    }
    tr.row-missing td {
      background-color: #fffbeb !important;
    }

    .col-check { width: 28px; }
    .col-num { width: 28px; color: #64748b; font-family: monospace; font-size: 9px; }
    .col-qty { width: 38px; font-family: monospace; }
    .col-name { min-width: 160px; }
    .col-set { width: 80px; font-family: monospace; font-size: 9px; color: #475569; }
    .col-type { width: 130px; color: #64748b; font-size: 9.5px; }
    .col-total { width: 50px; font-family: monospace; font-size: 9.5px; }
    .col-indecks { width: 58px; font-family: monospace; font-size: 9.5px; }
    .col-decks { min-width: 160px; font-size: 9.5px; }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }
    .text-indecks { color: #4338ca; }
    .text-idle { color: #64748b; font-weight: normal; }

    /* Checkbox representation */
    .check-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      border: 1.5px solid #0f172a;
      border-radius: 2px;
      font-size: 10px;
      font-weight: bold;
      line-height: 1;
      background: #ffffff;
      color: #0f172a;
    }
    .check-box.checked {
      background: #0f172a;
      color: #ffffff;
    }

    /* Badges & Pills */
    .card-name {
      font-weight: 700;
      color: #0f172a;
    }
    .name-checked {
      text-decoration: line-through;
      color: #64748b;
    }
    .foil-badge {
      display: inline-block;
      background: #fae8ff;
      color: #86198f;
      border: 1px solid #f0abfc;
      padding: 0 3px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 700;
      margin-left: 3px;
      vertical-align: middle;
    }
    .category-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      padding: 0 3px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 600;
      text-transform: capitalize;
      margin-left: 3px;
      vertical-align: middle;
    }

    /* Decks usage chips */
    .deck-chip {
      color: #312e81;
      font-size: 9px;
      font-weight: 500;
    }
    .deck-chip b {
      color: #1e1b4b;
    }
    .deck-text {
      color: #4338ca;
      font-weight: 600;
    }
    .status-missing {
      color: #b45309;
      font-weight: 700;
    }

    /* Cards Grid Flow (Left-to-Right Row Layout) */
    .cards-container {
      width: 100%;
    }
    .checklist-grid {
      width: 100%;
      display: grid;
    }

    .card-entry {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      gap: 2px;
      box-shadow: 0 0.5px 1px rgba(0, 0, 0, 0.03);
    }
    .card-entry.entry-verified {
      background-color: #f0fdf4 !important;
      border-color: #bbf7d0 !important;
    }
    .card-entry.entry-missing {
      background-color: #fffbeb !important;
      border-color: #fde68a !important;
    }

    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .entry-left {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .entry-num {
      color: #64748b;
      font-family: monospace;
      font-size: 8.5px;
    }
    .entry-qty-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 8.5px;
      padding: 0.5px 3.5px;
      border-radius: 3px;
      margin-right: 2px;
      letter-spacing: -0.2px;
    }
    .entry-qty {
      font-family: monospace;
      font-weight: 700;
      color: #0f172a;
    }
    .entry-name {
      font-weight: 700;
      color: #0f172a;
    }
    .entry-right {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: auto;
    }

    .entry-sub {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      color: #64748b;
      padding-left: 17px;
    }
    .entry-set {
      font-family: monospace;
      font-weight: 600;
      color: #334155;
    }
    .entry-type {
      color: #64748b;
    }

    .entry-usage {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-left: 17px;
      margin-top: 1px;
    }
    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 8.5px;
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      white-space: nowrap;
    }
    .stat-pill b {
      color: #0f172a;
    }
    .stat-pill.stat-indecks {
      background: #e0e7ff;
      border-color: #c7d2fe;
      color: #3730a3;
    }
    .stat-pill.stat-indecks b {
      color: #1e1b4b;
    }
    .stat-pill.stat-missing {
      background: #fef3c7;
      border-color: #fde68a;
      color: #92400e;
      font-weight: 700;
    }
    .usage-decks-list {
      font-size: 8.5px;
      line-height: 1.25;
      color: #475569;
    }

    /* Dynamic Left-to-Right Row Layouts */
    /* 1 Column Cards Layout */
    body[data-columns="1"] .checklist-grid {
      grid-template-columns: 1fr;
      gap: 5px;
    }
    body[data-columns="1"] .card-entry {
      padding: 5px 8px;
      font-size: 11px;
    }

    /* 2 Columns Layout (Left to Right - Saves ~50% Paper) */
    body[data-columns="2"] .checklist-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 10px;
    }
    body[data-columns="2"] .card-entry {
      padding: 3.5px 5.5px;
      font-size: 9.5px;
      line-height: 1.25;
    }
    body[data-columns="2"] .entry-name {
      font-size: 9.5px;
    }

    /* 3 Columns Layout (Left to Right - Saves ~65% Paper - Ultra Compact) */
    body[data-columns="3"] .checklist-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 3.5px 8px;
    }
    body[data-columns="3"] .card-entry {
      padding: 2.5px 4px;
      font-size: 8.5px;
      line-height: 1.2;
    }
    body[data-columns="3"] .entry-name {
      font-size: 8.5px;
    }
    body[data-columns="3"] .entry-sub {
      font-size: 8px;
      gap: 4px;
    }
    body[data-columns="3"] .stat-pill {
      font-size: 7.5px;
      padding: 0 2.5px;
    }
    body[data-columns="3"] .usage-decks-list {
      font-size: 8px;
    }

    /* 4 Columns Layout (Left to Right - Saves ~75% Paper - Maximum Compact) */
    body[data-columns="4"] .checklist-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 3px 6px;
    }
    body[data-columns="4"] .card-entry {
      padding: 2px 3.5px;
      font-size: 7.5px;
      line-height: 1.15;
    }
    body[data-columns="4"] .entry-name {
      font-size: 8px;
    }
    body[data-columns="4"] .entry-sub {
      font-size: 7px;
      gap: 3px;
      padding-left: 14px;
    }
    body[data-columns="4"] .stat-pill {
      font-size: 6.5px;
      padding: 0 2px;
    }
    body[data-columns="4"] .usage-decks-list {
      font-size: 7px;
      line-height: 1.15;
    }
    body[data-columns="4"] .entry-usage {
      padding-left: 14px;
    }

    /* View Switcher Visibility */
    body[data-columns="2"] .table-container,
    body[data-columns="3"] .table-container,
    body[data-columns="4"] .table-container {
      display: none !important;
    }
    body[data-columns="2"] .cards-container,
    body[data-columns="3"] .cards-container,
    body[data-columns="4"] .cards-container {
      display: block !important;
    }

    body[data-columns="1"][data-view="table"] .table-container {
      display: block !important;
    }
    body[data-columns="1"][data-view="table"] .cards-container {
      display: none !important;
    }
    body[data-columns="1"][data-view="cards"] .table-container {
      display: none !important;
    }
    body[data-columns="1"][data-view="cards"] .cards-container {
      display: block !important;
    }

    .footer {
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 9px;
    }

    /* Media Print Styles */
    @media print {
      @page {
        size: portrait;
        margin: 8mm 6mm;
      }
      body {
        background: #ffffff !important;
        color: #000000 !important;
        font-size: 9.5px !important;
      }
      .floating-bar {
        display: none !important;
      }
      .print-container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }
      .card-entry {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        border-color: #cbd5e1 !important;
        box-shadow: none !important;
      }
      thead {
        display: table-header-group !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      td, th {
        border-color: #cbd5e1 !important;
      }
      .card-name {
        color: #000000 !important;
      }
      .name-checked {
        color: #64748b !important;
      }

      .checklist-grid {
        display: grid !important;
      }

      body[data-columns="1"] .checklist-grid {
        grid-template-columns: 1fr !important;
        gap: 4px !important;
      }
      body[data-columns="2"] .checklist-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 3.5px 8px !important;
      }
      body[data-columns="3"] .checklist-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 3px 6px !important;
      }
      body[data-columns="4"] .checklist-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        gap: 2.5px 5px !important;
      }
    }
  </style>
</head>
<body data-columns="${columns}" data-view="${columns === 1 ? 'table' : 'cards'}">
  <div class="floating-bar">
    <div class="bar-info">
      <span><b>MTG Physical Checklist</b></span>
      <span class="bar-pill">${items.length} cards (${totalQuantity} copies)</span>
      <span class="paper-badge" id="paper-savings-badge">
        ${columns === 4 ? '&#127793; Saves ~75% Paper (4 Columns - Maximum Savings)' : columns === 3 ? '&#127793; Saves ~65% Paper (3 Columns - Left to Right)' : columns === 2 ? '&#127793; Saves ~50% Paper (2 Columns - Left to Right)' : 'Full Width (1 Column)'}
      </span>
    </div>

    <div class="column-switcher">
      <span class="switcher-label">Print Columns:</span>
      <div class="btn-group-toggle">
        <button id="btn-col-1" class="toggle-btn ${columns === 1 ? 'active' : ''}" onclick="applyLayout(1)" title="1 Column (Standard Full Width)">1 Col</button>
        <button id="btn-col-2" class="toggle-btn ${columns === 2 ? 'active' : ''}" onclick="applyLayout(2)" title="2 Columns - Saves ~50% Paper (Left to Right)">2 Cols (Save ~50%)</button>
        <button id="btn-col-3" class="toggle-btn ${columns === 3 ? 'active' : ''}" onclick="applyLayout(3)" title="3 Columns - Saves ~65% Paper (Left to Right)">3 Cols (Ultra Compact)</button>
        <button id="btn-col-4" class="toggle-btn ${columns === 4 ? 'active' : ''}" onclick="applyLayout(4)" title="4 Columns - Saves ~75% Paper (Left to Right - Maximum Savings)">4 Cols (Save ~75%)</button>
      </div>
      <div id="view-mode-container" class="view-mode-group" style="${columns === 1 ? 'display: inline-flex;' : 'display: none;'}">
        <span class="switcher-label" style="margin-left: 6px;">1-Col View:</span>
        <button id="btn-view-table" class="toggle-btn active" onclick="applyViewMode('table')" title="Tabular view">Table</button>
        <button id="btn-view-cards" class="toggle-btn" onclick="applyViewMode('cards')" title="Card list view">Cards</button>
      </div>
    </div>

    <div class="btn-group">
      <button class="print-btn" onclick="window.print();">&#128424; Print Now</button>
      <button class="close-btn" onclick="window.close();">&#10005; Close</button>
    </div>
  </div>

  <div class="print-container">
    <div class="header">
      <div class="header-top">
        <div>
          <h1 class="title">${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
      </div>

      <div class="meta-pills">
        <span class="meta-tag">Generated: <b>${escapeHtml(dateFormatted)}</b></span>
        <span class="meta-tag">Total Items: <b>${items.length}</b> cards (<b>${totalQuantity}</b> copies)</span>
        ${binderName ? `<span class="meta-tag">Binder: <b>${escapeHtml(binderName)}</b></span>` : ''}
        ${deckName ? `<span class="meta-tag">Deck: <b>${escapeHtml(deckName)}${deckFormat ? ` (${escapeHtml(deckFormat.toUpperCase())})` : ''}</b></span>` : ''}
        ${verifiedCount !== undefined && totalCards !== undefined ? `
          <span class="meta-tag highlight">Verified: <b>${verifiedCount} / ${totalCards}</b> (${percentVerified || 0}%)</span>
        ` : ''}
        ${filterLabel ? `<span class="meta-tag">Filter: <b>${escapeHtml(filterLabel)}</b></span>` : ''}
      </div>
    </div>

    <!-- 1-Column Table Container -->
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="col-qty text-center">${isDeckChecklist ? 'Deck Qty' : 'Qty'}</th>
            <th class="col-name">Card Name</th>
            <th class="col-finish text-center">Finish</th>
            <th class="col-total text-center" title="${isDeckChecklist ? 'Total copies owned in collection' : 'Total copies owned in binder'}">${isDeckChecklist ? 'Total Owned' : 'Total'}</th>
            <th class="col-indecks text-center" title="${isDeckChecklist ? 'Copies currently in other decks' : 'Copies currently in decks'}">${isDeckChecklist ? 'Other Decks' : 'In Decks'}</th>
            <th class="col-decks">${isDeckChecklist ? 'Other Decks with Copies / Status' : 'Decks with Copies / Status'}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="9" class="text-center" style="padding: 24px; color: #64748b;">No cards to display.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Multi-Column Cards Container (1, 2, 3, or 4 Columns, Left to Right) -->
    <div class="cards-container">
      <div class="checklist-grid">
        ${cardsHtml.length > 0 ? cardsHtml : '<div style="padding: 24px; text-align: center; color: #64748b;">No cards to display.</div>'}
      </div>
    </div>

    <div class="footer">
      <span>MTG Deck Builder & Collection Tracker &bull; Physical Audit Sheet</span>
      <span id="footer-layout-info">${columns} Column${columns > 1 ? 's' : ''} Layout (Left to Right)</span>
    </div>
  </div>

  <script>
    function applyLayout(cols) {
      document.body.setAttribute('data-columns', cols);
      try {
        localStorage.setItem('mtg_checklist_print_cols', String(cols));
      } catch (e) {}

      document.getElementById('btn-col-1').className = 'toggle-btn ' + (cols === 1 ? 'active' : '');
      document.getElementById('btn-col-2').className = 'toggle-btn ' + (cols === 2 ? 'active' : '');
      document.getElementById('btn-col-3').className = 'toggle-btn ' + (cols === 3 ? 'active' : '');
      var btn4 = document.getElementById('btn-col-4');
      if (btn4) btn4.className = 'toggle-btn ' + (cols === 4 ? 'active' : '');

      var viewContainer = document.getElementById('view-mode-container');
      if (viewContainer) {
        viewContainer.style.display = cols === 1 ? 'inline-flex' : 'none';
      }

      var badge = document.getElementById('paper-savings-badge');
      if (badge) {
        if (cols === 4) {
          badge.innerHTML = '&#127793; Saves ~75% Paper (4 Columns - Maximum Savings)';
        } else if (cols === 3) {
          badge.innerHTML = '&#127793; Saves ~65% Paper (3 Columns - Left to Right)';
        } else if (cols === 2) {
          badge.innerHTML = '&#127793; Saves ~50% Paper (2 Columns - Left to Right)';
        } else {
          badge.innerHTML = 'Full Width (1 Column)';
        }
      }

      var footerInfo = document.getElementById('footer-layout-info');
      if (footerInfo) {
        footerInfo.textContent = cols + ' Column' + (cols > 1 ? 's' : '') + ' Layout (Left to Right)';
      }
    }

    function applyViewMode(mode) {
      document.body.setAttribute('data-view', mode);
      try {
        localStorage.setItem('mtg_checklist_1col_view', mode);
      } catch (e) {}

      var btnTable = document.getElementById('btn-view-table');
      var btnCards = document.getElementById('btn-view-cards');
      if (btnTable) btnTable.className = 'toggle-btn ' + (mode === 'table' ? 'active' : '');
      if (btnCards) btnCards.className = 'toggle-btn ' + (mode === 'cards' ? 'active' : '');
    }

    window.onload = function() {
      // Check saved 1-col view preference
      try {
        var savedView = localStorage.getItem('mtg_checklist_1col_view');
        if (savedView === 'cards' || savedView === 'table') {
          applyViewMode(savedView);
        }
      } catch (e) {}
    };
  </script>
</body>
</html>`;
};

/**
 * Standard print entrypoint.
 * Defaults directly to instantaneous vector PDF generation in a new tab,
 * completely avoiding slow browser print-preview generation.
 */
export const printChecklist = (options: ChecklistPrintOptions): boolean => {
  return printChecklistPdf(options);
};
