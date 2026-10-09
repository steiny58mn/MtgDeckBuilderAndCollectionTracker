/**
 * Utility for generating and printing high-readability MTG Physical Checklists.
 * Formatted for clean printing on standard paper (Letter / A4) or PDF export.
 * Supports 1, 2, or 3 columns to optimize paper savings while preserving
 * complete card details and cross-deck usage information.
 */

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
  columns?: 1 | 2 | 3;
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
    const foilBadge = item.isFoil ? '<span class="foil-badge">&#10022; Foil</span>' : '';
    const conditionBadge = item.condition ? `<span class="cond-badge">${escapeHtml(item.condition)}</span>` : '';
    const setInfo = item.set ? `${escapeHtml(item.set.toUpperCase())}${item.collectorNumber ? ` #${escapeHtml(item.collectorNumber)}` : ''}` : '';
    const priceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0));
    const priceFormatted = !isNaN(priceNum) && priceNum > 0 ? `$${priceNum.toFixed(2)}` : '-';
    const categoryBadge = item.category && item.category !== 'main' ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : '';

    const totalOwned = item.totalOwned !== undefined ? item.totalOwned : item.quantity;
    const totalInDecks = item.totalInDecks !== undefined ? item.totalInDecks : 0;

    let decksSummaryHtml = '';
    if (item.decksList && item.decksList.length > 0) {
      decksSummaryHtml = item.decksList.map((d) => {
        const currentTag = d.isCurrentDeck ? ' <span class="tag-current">(This Deck)</span>' : '';
        return `<span class="deck-chip"><b>${d.quantity}x</b> in &ldquo;${escapeHtml(d.deckName)}&rdquo;${currentTag}</span>`;
      }).join(', ');
    } else if (item.deckUsageText) {
      decksSummaryHtml = `<span class="deck-text">${escapeHtml(item.deckUsageText)}</span>`;
    } else {
      decksSummaryHtml = '<span class="deck-idle">In Binder Only (0 in decks)</span>';
    }

    if (item.isMissing) {
      const missingCount = Math.max(1, (item.quantity || 1) - (item.totalOwned || 0));
      decksSummaryHtml = `<span class="status-missing">&#9888; Missing (${missingCount}x needed)</span>` + (decksSummaryHtml ? ` &bull; ${decksSummaryHtml}` : '');
    }

    return `
      <tr class="${isChecked ? 'row-verified' : ''} ${item.isMissing ? 'row-missing' : ''}">
        <td class="col-check text-center">
          <span class="${boxClass}">${boxContent}</span>
        </td>
        <td class="col-num text-center">${index + 1}</td>
        <td class="col-qty text-center font-bold">${item.quantity}x</td>
        <td class="col-name">
          <span class="card-name ${isChecked ? 'name-checked' : ''}">${escapeHtml(item.name)}</span>
          ${foilBadge}
          ${categoryBadge}
          ${conditionBadge}
        </td>
        <td class="col-set">${setInfo}</td>
        <td class="col-type">${escapeHtml(item.typeLine || '-')}</td>
        <td class="col-price text-right">${priceFormatted}</td>
        <td class="col-total text-center font-bold">${totalOwned}</td>
        <td class="col-indecks text-center font-bold ${totalInDecks > 0 ? 'text-indecks' : 'text-idle'}">${totalInDecks}</td>
        <td class="col-decks">${decksSummaryHtml}</td>
      </tr>
    `;
  }).join('');

  // Generate Card Entries (for multi-column grid: 1, 2, or 3 columns)
  const cardsHtml = items.map((item, index) => {
    const isChecked = Boolean(item.isChecked);
    const boxContent = isChecked ? '&#10003;' : '';
    const boxClass = isChecked ? 'check-box checked' : 'check-box';
    const foilBadge = item.isFoil ? '<span class="foil-badge">&#10022; Foil</span>' : '';
    const conditionBadge = item.condition ? `<span class="cond-badge">${escapeHtml(item.condition)}</span>` : '';
    const setInfo = item.set ? `${escapeHtml(item.set.toUpperCase())}${item.collectorNumber ? ` #${escapeHtml(item.collectorNumber)}` : ''}` : '';
    const priceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0));
    const priceFormatted = !isNaN(priceNum) && priceNum > 0 ? `$${priceNum.toFixed(2)}` : '-';
    const categoryBadge = item.category && item.category !== 'main' ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : '';

    const totalOwned = item.totalOwned !== undefined ? item.totalOwned : item.quantity;
    const totalInDecks = item.totalInDecks !== undefined ? item.totalInDecks : 0;

    let decksSummaryHtml = '';
    if (item.decksList && item.decksList.length > 0) {
      decksSummaryHtml = item.decksList.map((d) => {
        const currentTag = d.isCurrentDeck ? ' <span class="tag-current">(This Deck)</span>' : '';
        return `<span class="deck-chip"><b>${d.quantity}x</b> in &ldquo;${escapeHtml(d.deckName)}&rdquo;${currentTag}</span>`;
      }).join(', ');
    } else if (item.deckUsageText) {
      decksSummaryHtml = `<span class="deck-text">${escapeHtml(item.deckUsageText)}</span>`;
    } else {
      decksSummaryHtml = '<span class="deck-idle">In Binder Only (0 in decks)</span>';
    }

    return `
      <div class="card-entry ${isChecked ? 'entry-verified' : ''} ${item.isMissing ? 'entry-missing' : ''}">
        <div class="entry-header">
          <div class="entry-left">
            <span class="${boxClass}">${boxContent}</span>
            <span class="entry-num">#${index + 1}</span>
            <span class="entry-qty">${item.quantity}x</span>
            <span class="entry-name ${isChecked ? 'name-checked' : ''}">${escapeHtml(item.name)}</span>
            ${foilBadge}
            ${conditionBadge}
            ${categoryBadge}
          </div>
          <div class="entry-right">
            <span class="entry-price">${priceFormatted}</span>
          </div>
        </div>

        <div class="entry-sub">
          ${setInfo ? `<span class="entry-set">${setInfo}</span>` : ''}
          ${item.typeLine ? `<span class="entry-type">${escapeHtml(item.typeLine)}</span>` : ''}
        </div>

        <div class="entry-usage">
          <div class="usage-stats">
            <span class="stat-pill stat-total">Total: <b>${totalOwned}</b></span>
            <span class="stat-pill ${totalInDecks > 0 ? 'stat-indecks' : 'stat-idle'}">In Decks: <b>${totalInDecks}</b></span>
            ${item.isMissing ? `<span class="stat-pill stat-missing">&#9888; Missing</span>` : ''}
          </div>
          <div class="usage-decks-list">
            ${decksSummaryHtml}
          </div>
        </div>
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
    .col-qty { width: 34px; font-family: monospace; }
    .col-name { min-width: 160px; }
    .col-set { width: 80px; font-family: monospace; font-size: 9px; color: #475569; }
    .col-type { width: 130px; color: #64748b; font-size: 9.5px; }
    .col-price { width: 55px; font-family: monospace; font-size: 9.5px; color: #047857; font-weight: 600; }
    .col-total { width: 44px; font-family: monospace; font-size: 9.5px; }
    .col-indecks { width: 54px; font-family: monospace; font-size: 9.5px; }
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
    .cond-badge {
      display: inline-block;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      padding: 0 3px;
      border-radius: 2px;
      font-size: 8px;
      font-family: monospace;
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
    .tag-current {
      color: #047857;
      font-size: 8px;
      font-weight: 700;
      margin-left: 2px;
    }
    .deck-text {
      color: #4338ca;
      font-weight: 600;
    }
    .deck-idle {
      color: #94a3b8;
      font-style: italic;
    }
    .status-missing {
      color: #b45309;
      font-weight: 700;
    }

    /* Cards Grid Flow (Multi-Column Layout) */
    .cards-container {
      width: 100%;
    }
    .checklist-grid {
      width: 100%;
    }

    .card-entry {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
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
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
    }
    .entry-left {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
    .entry-num {
      color: #64748b;
      font-family: monospace;
      font-size: 8.5px;
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
      text-align: right;
    }
    .entry-price {
      font-family: monospace;
      font-weight: 700;
      color: #047857;
      font-size: 9.5px;
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
    .usage-stats {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
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

    /* Dynamic Multi-Column Variations */
    /* 1 Column Cards Layout */
    body[data-columns="1"] .checklist-grid {
      column-count: 1;
    }
    body[data-columns="1"] .card-entry {
      padding: 6px 8px;
      margin-bottom: 5px;
      font-size: 11px;
    }
    body[data-columns="1"] .entry-usage {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    /* 2 Columns Layout (Saves ~50% Paper) */
    body[data-columns="2"] .checklist-grid {
      column-count: 2;
      column-gap: 12px;
      column-rule: 1px dashed #cbd5e1;
    }
    body[data-columns="2"] .card-entry {
      padding: 3.5px 5.5px;
      margin-bottom: 4px;
      font-size: 9.5px;
      line-height: 1.25;
    }
    body[data-columns="2"] .entry-name {
      font-size: 9.5px;
    }

    /* 3 Columns Layout (Saves ~65% Paper - Ultra Compact) */
    body[data-columns="3"] .checklist-grid {
      column-count: 3;
      column-gap: 8px;
      column-rule: 1px dashed #cbd5e1;
    }
    body[data-columns="3"] .card-entry {
      padding: 2.5px 4px;
      margin-bottom: 3.5px;
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
      padding: 0 3px;
    }
    body[data-columns="3"] .usage-decks-list {
      font-size: 8px;
    }

    /* View Switcher Visibility */
    body[data-columns="2"] .table-container,
    body[data-columns="3"] .table-container {
      display: none !important;
    }
    body[data-columns="2"] .cards-container,
    body[data-columns="3"] .cards-container {
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
        -webkit-column-break-inside: avoid !important;
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

      body[data-columns="1"] .checklist-grid {
        column-count: 1 !important;
      }
      body[data-columns="2"] .checklist-grid {
        column-count: 2 !important;
        column-gap: 10px !important;
        column-rule: 1px dashed #cbd5e1 !important;
      }
      body[data-columns="3"] .checklist-grid {
        column-count: 3 !important;
        column-gap: 6px !important;
        column-rule: 1px dashed #cbd5e1 !important;
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
        ${columns === 3 ? '&#127793; Saves ~65% Paper (3 Columns)' : columns === 2 ? '&#127793; Saves ~50% Paper (2 Columns)' : 'Full Width (1 Column)'}
      </span>
    </div>

    <div class="column-switcher">
      <span class="switcher-label">Print Columns:</span>
      <div class="btn-group-toggle">
        <button id="btn-col-1" class="toggle-btn ${columns === 1 ? 'active' : ''}" onclick="applyLayout(1)" title="1 Column (Standard Full Width)">1 Col</button>
        <button id="btn-col-2" class="toggle-btn ${columns === 2 ? 'active' : ''}" onclick="applyLayout(2)" title="2 Columns - Saves ~50% Paper">2 Cols (Save ~50%)</button>
        <button id="btn-col-3" class="toggle-btn ${columns === 3 ? 'active' : ''}" onclick="applyLayout(3)" title="3 Columns - Saves ~65% Paper">3 Cols (Ultra Compact)</button>
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
            <th class="col-check text-center">&#9744;</th>
            <th class="col-num text-center">#</th>
            <th class="col-qty text-center">Qty</th>
            <th class="col-name">Card Name</th>
            <th class="col-set">Set / #</th>
            <th class="col-type">Type</th>
            <th class="col-price text-right">Price</th>
            <th class="col-total text-center" title="Total copies owned in collection or binder">Total</th>
            <th class="col-indecks text-center" title="Total copies currently in decks">In Decks</th>
            <th class="col-decks">Decks with Copies / Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="10" class="text-center" style="padding: 24px; color: #64748b;">No cards to display.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Multi-Column Cards Container (1, 2, or 3 Columns) -->
    <div class="cards-container">
      <div class="checklist-grid">
        ${cardsHtml.length > 0 ? cardsHtml : '<div style="padding: 24px; text-align: center; color: #64748b;">No cards to display.</div>'}
      </div>
    </div>

    <div class="footer">
      <span>MTG Deck Builder & Collection Tracker &bull; Physical Audit Sheet</span>
      <span id="footer-layout-info">${columns} Column${columns > 1 ? 's' : ''} Layout</span>
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

      var viewContainer = document.getElementById('view-mode-container');
      if (viewContainer) {
        viewContainer.style.display = cols === 1 ? 'inline-flex' : 'none';
      }

      var badge = document.getElementById('paper-savings-badge');
      if (badge) {
        if (cols === 3) {
          badge.innerHTML = '&#127793; Saves ~65% Paper (3 Columns)';
        } else if (cols === 2) {
          badge.innerHTML = '&#127793; Saves ~50% Paper (2 Columns)';
        } else {
          badge.innerHTML = 'Full Width (1 Column)';
        }
      }

      var footerInfo = document.getElementById('footer-layout-info');
      if (footerInfo) {
        footerInfo.textContent = cols + ' Column' + (cols > 1 ? 's' : '') + ' Layout';
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

      setTimeout(function() {
        window.print();
      }, 450);
    };
  </script>
</body>
</html>`;
};

export const printChecklist = (options: ChecklistPrintOptions): boolean => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up window was blocked. Please allow popups for this site to print the physical checklist.');
    return false;
  }

  const html = generateChecklistHtml(options);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
};
