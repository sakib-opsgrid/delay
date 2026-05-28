/* ================================================================
   SMS Delay Analyzer — app.js
   © 2026 Najmaz Sakib · Infozillion Teletech BD
   ================================================================ */

'use strict';

// ── CONSTANTS ────────────────────────────────────────────────────
const DELAY_THRESHOLD = 1; // seconds >= this = "delayed"

const OP_ORDER = ['GrameenPhone', 'Robi', 'Banglalink', 'Teletalk'];

const OP_CLASS = {
  GrameenPhone: 'gp',
  Robi:         'robi',
  Banglalink:   'bl',
  Teletalk:     'tt',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── STATE ────────────────────────────────────────────────────────
let state = {
  data:      null,   // computed pivot data
  timeRange: { min: null, max: null },
};

// ── DOM REFS ─────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const screens = {
  upload:   $('screen-upload'),
  loading:  $('screen-loading'),
  results:  $('screen-results'),
};

// ── BOOT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUpload();
  initFormEvents();
  initDatetimeDefaults();
});

// ════════════════════════════════════════════════════════════════
// UPLOAD
// ════════════════════════════════════════════════════════════════
function initUpload() {
  const dropZone  = $('dropZone');
  const fileInput = $('fileInput');
  const browseBtn = $('browseBtn');

  // Browse button — stop propagation so dropZone click doesn't double-fire
  browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Click on zone (not on button) also opens picker
  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  // Drag events
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // File picker
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = ''; // reset so same file can be re-selected
  });

  // Reset button
  $('resetBtn').addEventListener('click', resetToUpload);
}

// ════════════════════════════════════════════════════════════════
// FILE HANDLING
// ════════════════════════════════════════════════════════════════
function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showToast('Please select a .csv file');
    return;
  }

  showScreen('loading');
  setLoading('Reading file…', 10);

  const reader = new FileReader();

  reader.onprogress = (e) => {
    if (e.lengthComputable) setLoading('Reading file…', (e.loaded / e.total) * 40);
  };

  reader.onload = (e) => {
    setTimeout(() => {
      try {
        setLoading('Parsing CSV…', 50);

        const rows = parseCSV(e.target.result);

        setLoading(`Computing delays for ${rows.length.toLocaleString()} rows…`, 70);

        setTimeout(() => {
          const data = computeData(rows);
          state.data = data;

          setLoading('Rendering report…', 90);

          setTimeout(() => {
            renderResults(data, file.name, rows.length);
            setLoading('Done', 100);
            setTimeout(() => showScreen('results'), 150);
          }, 80);
        }, 40);

      } catch (err) {
        showScreen('upload');
        showToast('Error: ' + err.message);
        console.error('[SMS Delay Analyzer]', err);
      }
    }, 30);
  };

  reader.onerror = () => {
    showScreen('upload');
    showToast('Could not read file');
  };

  reader.readAsText(file, 'UTF-8');
}

// ════════════════════════════════════════════════════════════════
// CSV PARSER
// ════════════════════════════════════════════════════════════════
function parseCSV(text) {
  const rawLines = text.split(/\r?\n/);
  const lines    = rawLines.filter(l => l.trim().length > 0);

  if (lines.length < 2) throw new Error('File has no data rows');

  // Detect delimiter
  const firstLine = lines[0];
  const delim     = firstLine.includes('\t') ? '\t' : ',';

  // Parse headers
  const headers = splitLine(firstLine, delim).map(normaliseHeader);

  // Locate required columns (case-insensitive, trimmed)
  const col = {
    ts:  findCol(headers, ['@timestamp', 'timestamp', 'time']),
    req: findCol(headers, ['ansrequesttime', 'ans_request_time', 'requesttime']),
    res: findCol(headers, ['ansresponsetime', 'ans_response_time', 'responsetime']),
    op:  findCol(headers, ['applicablesmsgateway', 'applicable_sms_gateway', 'operator', 'gateway']),
  };

  if (col.req === -1) throw new Error('Column "ansRequestTime" not found.\nAvailable: ' + headers.join(', '));
  if (col.res === -1) throw new Error('Column "ansResponseTime" not found.\nAvailable: ' + headers.join(', '));
  if (col.op  === -1) throw new Error('Column "applicableSmsGateway" not found.\nAvailable: ' + headers.join(', '));

  // Parse rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim).map(c => c.trim());
    rows.push({
      ts:       col.ts  !== -1 ? cells[col.ts]  : '',
      request:  cells[col.req] || '',
      response: cells[col.res] || '',
      operator: cells[col.op]  || '(blank)',
    });
  }

  return rows;
}

function normaliseHeader(h) {
  return h.replace(/^["']|["']$/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function splitLine(line, delim) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === delim && !inQ) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// ════════════════════════════════════════════════════════════════
// COMPUTE
// ════════════════════════════════════════════════════════════════
function computeData(rows) {
  const operatorSet = new Set();
  let tsMin = null, tsMax = null;

  // pivot[delayInt][operatorName] = count
  const pivot       = {};
  const opTotals    = {};
  const delayTotals = {};
  let   grand       = 0;

  for (const row of rows) {
    const op  = row.operator || '(blank)';
    const req = parseISODate(row.request);
    const res = parseISODate(row.response);

    operatorSet.add(op);

    // Track time range from @timestamp if available
    const ts = row.ts ? parseTimestamp(row.ts) : null;
    if (ts) {
      if (!tsMin || ts < tsMin) tsMin = ts;
      if (!tsMax || ts > tsMax) tsMax = ts;
    }

    if (!req || !res) continue;

    const delaySec = (res.getTime() - req.getTime()) / 1000;
    const delayInt = Math.floor(delaySec);

    // Also use req/res for range if no @timestamp
    if (!tsMin || req < tsMin) tsMin = req;
    if (!tsMax || res > tsMax) tsMax = res;

    if (!pivot[delayInt])       pivot[delayInt] = {};
    pivot[delayInt][op]         = (pivot[delayInt][op] || 0) + 1;
    opTotals[op]                = (opTotals[op] || 0) + 1;
    delayTotals[delayInt]       = (delayTotals[delayInt] || 0) + 1;
    grand++;
  }

  // Sort operators by canonical order, others alphabetically after
  const opArr = [...operatorSet].sort((a, b) => {
    const ai = OP_ORDER.indexOf(a);
    const bi = OP_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // Delay keys sorted ascending
  const delayKeys = Object.keys(pivot).map(Number).sort((a, b) => a - b);

  // Per-operator delayed count (delay >= threshold)
  const opDelayed = {};
  for (const op of opArr) {
    opDelayed[op] = delayKeys
      .filter(d => d >= DELAY_THRESHOLD)
      .reduce((s, d) => s + (pivot[d][op] || 0), 0);
  }

  // Store time range globally and pre-fill form
  state.timeRange = { min: tsMin, max: tsMax };
  if (tsMin) $('fFrom').value = toDatetimeLocal(tsMin);
  if (tsMax) $('fTo').value   = toDatetimeLocal(tsMax);

  // Update hints
  if (tsMin && tsMax) {
    $('fromHint').textContent = 'auto from CSV';
    $('toHint').textContent   = 'auto from CSV';
  } else {
    $('fromHint').textContent = 'manual';
    $('toHint').textContent   = 'manual';
  }

  return { pivot, delayKeys, opArr, opTotals, delayTotals, grand, opDelayed };
}

// ════════════════════════════════════════════════════════════════
// RENDER RESULTS
// ════════════════════════════════════════════════════════════════
function renderResults(data, filename, totalRows) {
  const { pivot, delayKeys, opArr, opTotals, delayTotals, grand, opDelayed } = data;

  // Meta
  $('resultsMeta').textContent =
    `${filename}  ·  ${totalRows.toLocaleString()} rows  ·  ${grand.toLocaleString()} valid`;

  // Time range bar
  const tr = $('timeRange');
  if (state.timeRange.min && state.timeRange.max) {
    const dur = formatDuration(state.timeRange.max - state.timeRange.min);
    tr.innerHTML =
      `<span><strong>From</strong> ${formatDT(state.timeRange.min)}</span>` +
      `<span><strong>To</strong> ${formatDT(state.timeRange.max)}</span>` +
      `<span><strong>Duration</strong> ${dur}</span>`;
    tr.style.display = 'flex';
  } else {
    tr.style.display = 'none';
  }

  // Pivot table
  buildPivotTable(data);

  // Operator cards
  buildOpCards(data);

  // Wire export buttons
  $('copyTableBtn').onclick = () => copyTableAsText(data);
  $('exportCsvBtn').onclick = () => exportCSV(data);
}

// ── PIVOT TABLE ────────────────────────────────────────────────
function buildPivotTable({ pivot, delayKeys, opArr, opTotals, delayTotals, grand }) {
  const table = $('pivotTable');
  const thead = table.tHead;
  const tbody = table.tBodies[0];
  const tfoot = table.tFoot;

  thead.innerHTML = '';
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  // ── Header row 1: "Count of delay" | operator names | Grand Total
  const hr1 = thead.insertRow();
  addTH(hr1, 'Count of delay', 'left');
  for (const op of opArr) {
    const th = addTH(hr1, op);
    const cls = OP_CLASS[op];
    if (cls) th.classList.add(`th-${cls}`);
  }
  addTH(hr1, 'Grand Total');

  // ── Header row 2: "Row Labels ▼" | empty operator cols
  const hr2 = thead.insertRow();
  addTH(hr2, 'Row Labels ▼', 'left');
  for (let i = 0; i < opArr.length + 1; i++) addTH(hr2, '');

  // ── Body rows
  for (const d of delayKeys) {
    const tr  = tbody.insertRow();
    const isD = d >= DELAY_THRESHOLD;

    // Row key cell
    const keyTD = tr.insertCell();
    keyTD.textContent = String(d);
    keyTD.style.textAlign = 'left';
    keyTD.style.fontWeight = '500';
    if (isD) keyTD.style.color = 'var(--warn)';

    // Operator cells
    for (const op of opArr) {
      const val = pivot[d][op] || 0;
      const td  = tr.insertCell();
      if (val === 0) {
        td.textContent = '';
        td.classList.add('cell-empty');
      } else {
        td.textContent = val.toLocaleString();
        td.classList.add(isD ? 'cell-delayed' : 'cell-ok');
      }
    }

    // Row total
    const rtd = tr.insertCell();
    rtd.textContent = (delayTotals[d] || 0).toLocaleString();
    rtd.classList.add('cell-row-total');
    if (isD) rtd.classList.add('cell-delayed');
  }

  // ── Footer: Grand Total
  const fr = tfoot.insertRow();
  const fk = fr.insertCell();
  fk.textContent = 'Grand Total';
  fk.style.textAlign = 'left';

  for (const op of opArr) {
    const td = fr.insertCell();
    td.textContent = (opTotals[op] || 0).toLocaleString();
  }

  const ftotal = fr.insertCell();
  ftotal.textContent = grand.toLocaleString();
}

function addTH(row, text, align = 'right') {
  const th = document.createElement('th');
  th.textContent = text;
  th.style.textAlign = align;
  row.appendChild(th);
  return th;
}

// ── OPERATOR CARDS ─────────────────────────────────────────────
function buildOpCards({ opArr, opTotals, grand, opDelayed }) {
  const container = $('opCards');
  container.innerHTML = '';

  // Grand total card first
  const totalDelayed = opArr.reduce((s, op) => s + (opDelayed[op] || 0), 0);
  container.appendChild(makeOpCard('All Operators', 'c-total', grand, totalDelayed, grand));

  for (const op of opArr) {
    const cls = 'c-' + (OP_CLASS[op] || 'blank');
    container.appendChild(makeOpCard(op, cls, opTotals[op] || 0, opDelayed[op] || 0, grand));
  }
}

function makeOpCard(name, cls, total, delayed, grand) {
  const card = document.createElement('div');
  card.className = `op-card ${cls}`;

  const pct = total > 0 ? ((delayed / total) * 100).toFixed(1) : '0.0';

  card.innerHTML = `
    <div class="op-card__name">${name}</div>
    <div class="op-card__total">${total.toLocaleString()}</div>
    <div class="op-card__delayed">
      ${delayed > 0
        ? `<span class="d-num">${delayed.toLocaleString()}</span> delayed <span class="d-pct">(${pct}%)</span>`
        : `<span class="d-none">No delay</span>`
      }
    </div>`;

  return card;
}

// ════════════════════════════════════════════════════════════════
// FORM EVENTS
// ════════════════════════════════════════════════════════════════
function initFormEvents() {
  $('fStatus').addEventListener('change', function () {
    $('fIssueGroup').style.display = this.value === 'Issue' ? 'block' : 'none';
  });

  $('generateBtn').addEventListener('click', generateCard);
  $('copyImgBtn').addEventListener('click', () => captureCard(false));
  $('downloadImgBtn').addEventListener('click', () => captureCard(true));
}

function initDatetimeDefaults() {
  const now  = new Date(); now.setSeconds(0, 0);
  const from = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  $('fFrom').value = toDatetimeLocal(from);
  $('fTo').value   = toDatetimeLocal(now);
}

// ════════════════════════════════════════════════════════════════
// GENERATE REPORT CARD
// ════════════════════════════════════════════════════════════════
function generateCard() {
  if (!state.data) { showToast('Upload a CSV file first'); return; }

  const { pivot, delayKeys, opArr, opTotals, delayTotals, grand } = state.data;

  const reportType = ($('fReportType').value.trim()) || 'Delay Report';
  const reporter   = ($('fReporter').value.trim())   || '—';
  const status     = $('fStatus').value;
  const issueText  = ($('fIssue').value.trim());

  // Resolve time range
  let fromStr, toStr;
  const { min, max } = state.timeRange;
  if (min && max) {
    fromStr = formatCardDT(min);
    toStr   = formatCardDT(max);
  } else {
    const fv = $('fFrom').value;
    const tv = $('fTo').value;
    fromStr = fv ? formatCardDT(new Date(fv)) : '—';
    toStr   = tv ? formatCardDT(new Date(tv)) : '—';
  }

  // ── Build header cells
  let thCells = `<th style="text-align:left">Count of delay</th>`;
  for (const op of opArr) {
    const cls = OP_CLASS[op] ? `rc-th-${OP_CLASS[op]}` : 'rc-th-blank';
    thCells += `<th class="${cls}">${op}</th>`;
  }
  thCells += `<th class="rc-th-grand">Grand Total</th>`;

  let th2Cells = `<th style="text-align:left">Row Labels ▼</th>`;
  for (let i = 0; i < opArr.length + 1; i++) th2Cells += `<th></th>`;

  // ── Body rows
  let bodyHTML = '';
  for (const d of delayKeys) {
    const isD = d >= DELAY_THRESHOLD;
    let row = `<td style="text-align:left;font-weight:600;${isD ? 'color:#B84E1A' : ''}">${d}</td>`;
    for (const op of opArr) {
      const val = pivot[d][op] || 0;
      if (val === 0) {
        row += `<td class="rc-td-zero"></td>`;
      } else {
        row += `<td class="${isD ? 'rc-td-delayed' : ''}">${val.toLocaleString()}</td>`;
      }
    }
    const rowTotal = delayTotals[d] || 0;
    row += `<td class="rc-td-total${isD ? ' rc-td-delayed' : ''}">${rowTotal.toLocaleString()}</td>`;
    bodyHTML += `<tr>${row}</tr>`;
  }

  // ── Footer
  let footHTML = `<td style="text-align:left">Grand Total</td>`;
  for (const op of opArr) footHTML += `<td>${(opTotals[op] || 0).toLocaleString()}</td>`;
  footHTML += `<td>${grand.toLocaleString()}</td>`;

  // ── Status line
  const statusHTML = status === 'Normal'
    ? `<span class="rc-status-normal">Normal</span>`
    : `<span class="rc-status-issue">Issue</span>${issueText ? ` — <span class="rc-issue-text">${esc(issueText)}</span>` : ''}`;

  // ── Assemble card
  $('reportCard').innerHTML = `
    <div class="rc-eyebrow">Infozillion Teletech BD · Service Assurance</div>
    <div class="rc-title">${esc(reportType)}</div>
    <div class="rc-time">${esc(fromStr)} &mdash; ${esc(toStr)}</div>
    <table class="rc-table">
      <thead>
        <tr>${thCells}</tr>
        <tr>${th2Cells}</tr>
      </thead>
      <tbody>${bodyHTML}</tbody>
      <tfoot><tr>${footHTML}</tr></tfoot>
    </table>
    <div class="rc-meta">
      <div class="rc-meta-line"><strong>Reporter:</strong> ${esc(reporter)}</div>
      <div class="rc-meta-line"><strong>Status:</strong> ${statusHTML}</div>
    </div>`;

  const preview = $('cardPreview');
  preview.style.display = 'flex';
  preview.style.flexDirection = 'column';
  setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

// ════════════════════════════════════════════════════════════════
// IMAGE CAPTURE
// ════════════════════════════════════════════════════════════════
async function captureCard(download) {
  const card = $('reportCard');
  if (!card.innerHTML.trim()) { showToast('Generate a card first'); return; }

  showToast('Generating image…');

  // Measure full content size
  const fullW = card.scrollWidth;
  const fullH = card.scrollHeight;

  // Pin exact size, remove any clipping
  card.style.setProperty('width',     fullW + 'px', 'important');
  card.style.setProperty('height',    fullH + 'px', 'important');
  card.style.setProperty('overflow',  'visible',    'important');
  card.style.setProperty('max-width', 'none',       'important');

  // Wait for browser to settle layout
  await new Promise(r => setTimeout(r, 80));

  const w = card.offsetWidth;
  const h = card.offsetHeight;

  const restoreCard = () => {
    card.style.removeProperty('width');
    card.style.removeProperty('height');
    card.style.removeProperty('overflow');
    card.style.removeProperty('max-width');
  };

  try {
    const canvas = await html2canvas(card, {
      backgroundColor:  '#FFFFFF',
      scale:            2.5,
      useCORS:          true,
      logging:          false,
      width:            w,
      height:           h,
      windowWidth:      w + 200,
      windowHeight:     h + 200,
      x:                0,
      y:                0,
      scrollX:          0,
      scrollY:          0,
    });

    restoreCard();

    if (download) {
      const a = document.createElement('a');
      a.href     = canvas.toDataURL('image/png');
      a.download = `delay_report_${formatFileDate(new Date())}.png`;
      a.click();
      showToast('Downloaded successfully');
    } else {
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Copied! Paste directly in WhatsApp ✓');
        } catch {
          // Fallback: open in new tab
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          showToast('Opened in new tab — save & share');
        }
      }, 'image/png');
    }

  } catch (err) {
    restoreCard();
    showToast('Capture failed: ' + err.message);
    console.error('[captureCard]', err);
  }
}

// ════════════════════════════════════════════════════════════════
// EXPORT / COPY TABLE
// ════════════════════════════════════════════════════════════════
function exportCSV({ pivot, delayKeys, opArr, opTotals, delayTotals, grand }) {
  const rows = [];

  // Header
  rows.push(['Count of delay', ...opArr, 'Grand Total'].join(','));

  // Data rows
  for (const d of delayKeys) {
    const cells = [d];
    for (const op of opArr) cells.push(pivot[d][op] || 0);
    cells.push(delayTotals[d] || 0);
    rows.push(cells.join(','));
  }

  // Grand total
  const ft = ['Grand Total'];
  for (const op of opArr) ft.push(opTotals[op] || 0);
  ft.push(grand);
  rows.push(ft.join(','));

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `delay_report_${formatFileDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

function copyTableAsText({ pivot, delayKeys, opArr, opTotals, delayTotals, grand }) {
  const rows = [];
  rows.push(['Count of delay', ...opArr, 'Grand Total'].join('\t'));
  for (const d of delayKeys) {
    const cells = [d];
    for (const op of opArr) cells.push(pivot[d][op] || 0);
    cells.push(delayTotals[d] || 0);
    rows.push(cells.join('\t'));
  }
  const ft = ['Grand Total'];
  for (const op of opArr) ft.push(opTotals[op] || 0);
  ft.push(grand);
  rows.push(ft.join('\t'));

  navigator.clipboard.writeText(rows.join('\n'))
    .then(() => showToast('Table copied — paste into Excel'))
    .catch(() => showToast('Copy failed'));
}

// ════════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════════
function showScreen(name) {
  Object.values(screens).forEach(s => {
    s.classList.remove('screen--active');
    s.style.display = 'none';
  });
  screens[name].style.display = 'block';
  // Force reflow then add class for animation
  void screens[name].offsetWidth;
  screens[name].classList.add('screen--active');
}

function setLoading(label, pct) {
  $('loadingLabel').textContent    = label;
  $('loadingFill').style.width     = Math.min(pct, 100) + '%';
}

function resetToUpload() {
  state.data      = null;
  state.timeRange = { min: null, max: null };
  $('cardPreview').style.display = 'none';
  $('reportCard').innerHTML      = '';
  initDatetimeDefaults();
  $('fromHint').textContent = 'auto from CSV';
  $('toHint').textContent   = 'auto from CSV';
  showScreen('upload');
}

let _toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('toast--show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('toast--show'), 2800);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════════════════════
// DATE / TIME UTILITIES
// ════════════════════════════════════════════════════════════════
function parseISODate(str) {
  if (!str) return null;
  const d = new Date(str.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function parseTimestamp(str) {
  // Handles "May 27, 2026 @ 12:17:49.094" and ISO strings
  if (!str) return null;
  const cleaned = str.replace(' @ ', 'T').replace(/\.\d{3}$/, '');
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;
  d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function toDatetimeLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatDT(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function formatCardDT(d) {
  const p = (n, l=2) => String(n).padStart(l, '0');
  return `${MONTHS[d.getMonth()]} ${p(d.getDate())}, ${d.getFullYear()} @ ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.000`;
}

function formatFileDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0)  return `${h}h ${m % 60}m`;
  if (m > 0)  return `${m}m ${s % 60}s`;
  return `${s}s`;
}
