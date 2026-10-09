/**
 * Utility for generating and printing high-readability MTG Physical Checklists.
 * Formatted for clean printing on standard paper (Letter / A4) or PDF export.
 */

export interface ChecklistPrintItem {
  id: string;
  name: string;
  quantity: number;
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

  const rowsHtml = items.map((item, index) => {
    const isChecked = Boolean(item.isChecked);
    const boxContent = isChecked ? '&#10003;' : '';
    const boxClass = isChecked ? 'check-box checked' : 'check-box';
    const foilBadge = item.isFoil ? '<span class="foil-badge">&#10022; Foil</span>' : '';
    const conditionBadge = item.condition ? `<span class="cond-badge">${escapeHtml(item.condition)}</span>` : '';
    const setInfo = item.set ? `${escapeHtml(item.set.toUpperCase())}${item.collectorNumber ? ` #${escapeHtml(item.collectorNumber)}` : ''}` : '';
    const priceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || 0));
    const priceFormatted = !isNaN(priceNum) && priceNum > 0 ? `$${priceNum.toFixed(2)}` : '-';
    
    let locationHtml = '';
    if (item.deckUsageText) {
      locationHtml = `<span class="location-text">${escapeHtml(item.deckUsageText)}</span>`;
    } else if (item.isMissing) {
      locationHtml = '<span class="status-missing">&#9888; Missing from binder</span>';
    } else {
      locationHtml = '<span class="location-idle">In Binder Only</span>';
    }

    const categoryBadge = item.category && item.category !== 'main' ? `<span class="category-badge">${escapeHtml(item.category)}</span>` : '';

    return `
      <tr class="${isChecked ? 'row-verified' : ''}">
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
        <td class="col-decks">${locationHtml}</td>
      </tr>
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
      max-width: 1000px;
      margin: 16px auto;
      background: #ffffff;
      padding: 24px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    /* Header Block */
    .header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 2px 0;
      letter-spacing: -0.01em;
    }
    .subtitle {
      font-size: 11px;
      color: #64748b;
      margin: 0;
    }
    .meta-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      background: #f1f5f9;
      color: #334155;
      padding: 2px 8px;
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

    /* Checklist Table */
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
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 6px 6px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
      font-size: 10.5px;
    }
    tr:nth-child(even) td {
      background-color: #fafbfc;
    }
    tr.row-verified td {
      background-color: #f0fdf4 !important;
    }

    /* Column Widths & Alignments */
    .col-check { width: 34px; }
    .col-num { width: 34px; color: #64748b; font-family: monospace; font-size: 9.5px; }
    .col-qty { width: 40px; font-family: monospace; }
    .col-name { min-width: 180px; }
    .col-set { width: 90px; font-family: monospace; font-size: 9.5px; color: #475569; }
    .col-type { width: 150px; color: #64748b; font-size: 10px; }
    .col-price { width: 60px; font-family: monospace; font-size: 10px; color: #047857; font-weight: 600; }
    .col-decks { min-width: 160px; font-size: 10px; }

    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: 700; }

    /* Checkbox representation */
    .check-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      border: 1.5px solid #0f172a;
      border-radius: 2px;
      font-size: 11px;
      font-weight: bold;
      line-height: 1;
      background: #ffffff;
      color: #0f172a;
    }
    .check-box.checked {
      background: #0f172a;
      color: #ffffff;
    }

    /* Card Details */
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
      padding: 0 4px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 700;
      margin-left: 4px;
      vertical-align: middle;
    }
    .cond-badge {
      display: inline-block;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
      padding: 0 3px;
      border-radius: 2px;
      font-size: 8.5px;
      font-family: monospace;
      margin-left: 4px;
      vertical-align: middle;
    }
    .category-badge {
      display: inline-block;
      background: #e0e7ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
      padding: 0 4px;
      border-radius: 3px;
      font-size: 8.5px;
      font-weight: 600;
      text-transform: capitalize;
      margin-left: 4px;
      vertical-align: middle;
    }

    /* Deck usage */
    .location-text {
      color: #5b21b6;
      font-weight: 600;
    }
    .location-idle {
      color: #94a3b8;
      font-style: italic;
    }
    .status-missing {
      color: #dc2626;
      font-weight: 600;
    }

    .footer {
      margin-top: 16px;
      padding-top: 8px;
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
        margin: 10mm 8mm;
      }
      body {
        background: #ffffff !important;
        color: #000000 !important;
        font-size: 10px !important;
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
      thead {
        display: table-header-group !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      td, th {
        border-color: #cbd5e1 !important;
        padding: 3.5px 5px !important;
      }
      .card-name {
        color: #000000 !important;
      }
      .name-checked {
        color: #64748b !important;
      }
    }
  </style>
</head>
<body>
  <div class="floating-bar">
    <div class="bar-info">
      <span><b>MTG Physical Checklist</b></span>
      <span class="bar-pill">${items.length} cards (${totalQuantity} copies)</span>
      <span>${escapeHtml(dateFormatted)}</span>
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

    <table>
      <thead>
        <tr>
          <th class="col-check text-center">&#9744;</th>
          <th class="col-num text-center">#</th>
          <th class="col-qty text-center">Qty</th>
          <th class="col-name">Card Name</th>
          <th class="col-set">Set / Collector #</th>
          <th class="col-type">Type</th>
          <th class="col-price text-right">Price</th>
          <th class="col-decks">Cross-Reference / In Decks</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="8" class="text-center" style="padding: 24px; color: #64748b;">No cards to display.</td></tr>'}
      </tbody>
    </table>

    <div class="footer">
      <span>MTG Deck Builder & Collection Tracker</span>
      <span>Page 1 / Physical Audit Sheet</span>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
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
