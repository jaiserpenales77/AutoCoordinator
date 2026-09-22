const STORAGE_KEY = "pk030_yield_sheets";
const LOW_YIELD_THRESHOLD = 0.945;
const HIGH_YIELD_THRESHOLD = 1.024999;

const form = document.getElementById("yieldForm");
const editingBadge = document.getElementById("editingBadge");
let editingId = null;

const fields = [
  "fgItem", "woNumber", "bulkItem", "dateCreated",
  "totalPackaged", "fillRate", "bulkRejected", "bulkIssued",
  "pieceWt", "tareWeight", "scrap1", "scrap2", "scrap3", "mfgScrap",
  "videoJetCount"
];

function el(id) { return document.getElementById(id); }

function num(id) {
  const v = parseFloat(el(id).value);
  return isNaN(v) ? 0 : v;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

el("dateCreated").value = todayISO();

function scrapConversion(grossKg, tareKg, pieceWtMg) {
  if (grossKg <= 0) return { net: 0, pieces: 0 };
  const net = grossKg - tareKg;
  const pieces = pieceWtMg > 0 ? (net * 1000) / pieceWtMg : 0;
  return { net, pieces };
}

function computeResults() {
  const totalPackaged = num("totalPackaged");
  const fillRate = num("fillRate");
  const bulkRejected = num("bulkRejected");
  const bulkIssued = num("bulkIssued");
  const pieceWt = num("pieceWt");
  const tareWeight = num("tareWeight");

  const scrapInputs = [
    { key: "Packaging Scrap #1", gross: num("scrap1") },
    { key: "Packaging Scrap #2", gross: num("scrap2") },
    { key: "Packaging Scrap #3", gross: num("scrap3") },
    { key: "Manufacturing Scrap", gross: num("mfgScrap") }
  ].map(s => ({ ...s, ...scrapConversion(s.gross, tareWeight, pieceWt) }));

  const scrapPiecesSum = scrapInputs.reduce((sum, s) => sum + s.pieces, 0);

  const bulkIssuedNet = bulkIssued - bulkRejected;
  const bulkPackagedTH = (totalPackaged * fillRate) / 1000;
  const bulkScrappedTH = scrapPiecesSum;

  const denominator = (bulkIssued * 1000) - (bulkRejected * 1000);
  const finalYieldRatio = denominator !== 0
    ? ((totalPackaged * fillRate) + scrapPiecesSum * 1000) / denominator
    : 0;

  const lowYield = finalYieldRatio < LOW_YIELD_THRESHOLD;
  const highYield = finalYieldRatio > HIGH_YIELD_THRESHOLD;
  const videoJetCount = lowYield || highYield;

  let statusLabel = "Within range";
  if (highYield) statusLabel = "High Yield NCCAPA";
  else if (lowYield) statusLabel = "Low Yield NCCAPA";

  return {
    totalPackaged, fillRate, bulkRejected, bulkIssued, pieceWt, tareWeight,
    scrapInputs, scrapPiecesSum, bulkIssuedNet, bulkPackagedTH, bulkScrappedTH,
    finalYieldRatio, lowYield, highYield, videoJetCount, statusLabel
  };
}

function fmt(n, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "0";
}

function renderResults(r) {
  el("rBulkIssuedNet").textContent = fmt(r.bulkIssuedNet) + " TH";
  el("rBulkPackaged").textContent = fmt(r.bulkPackagedTH) + " TH";
  el("rBulkScrapped").textContent = fmt(r.bulkScrappedTH) + " TH";
  el("rFinalYield").textContent = fmt(r.finalYieldRatio * 100) + "%";

  const banner = el("statusBanner");
  if (r.videoJetCount) {
    banner.className = "status-banner warn";
    banner.textContent = `${r.statusLabel} — VideoJet Count required (outside 94.5%–102.4999%)`;
  } else {
    banner.className = "status-banner ok";
    banner.textContent = "Within range (94.5% – 102.4999%)";
  }

  const tbody = el("scrapTableBody");
  tbody.innerHTML = "";
  r.scrapInputs.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.key}</td><td>${fmt(s.gross)}</td><td>${fmt(s.net)}</td><td>${fmt(s.pieces)}</td>`;
    tbody.appendChild(tr);
  });

  const { line1, line2 } = buildSummaryLines(collectFormData());
  el("summaryLine1").textContent = line1;
  el("summaryLine2").textContent = line2;
}

function recalc() {
  const r = computeResults();
  renderResults(r);
  return r;
}

fields.forEach(id => {
  el(id).addEventListener("input", recalc);
});

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function collectFormData() {
  const data = {};
  fields.forEach(id => { data[id] = el(id).value; });
  return data;
}

function applyFormData(data) {
  fields.forEach(id => { el(id).value = data[id] ?? (id === "tareWeight" ? 6 : ""); });
  recalc();
}

function clearForm() {
  editingId = null;
  editingBadge.classList.add("hidden");
  form.reset();
  el("dateCreated").value = todayISO();
  el("tareWeight").value = 6;
  recalc();
}

function renderRecordsTable() {
  const search = el("searchBox").value.trim().toLowerCase();
  const records = loadRecords();
  const tbody = el("recordsTableBody");
  tbody.innerHTML = "";

  const filtered = records.filter(rec => {
    if (!search) return true;
    return [rec.woNumber, rec.fgItem, rec.bulkItem]
      .some(v => (v || "").toLowerCase().includes(search));
  });

  el("noRecordsMsg").classList.toggle("hidden", filtered.length > 0);

  filtered
    .slice()
    .sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""))
    .forEach(rec => {
      const results = computeFromData(rec);
      const tr = document.createElement("tr");
      const statusClass = results.videoJetCount ? "yield-warn" : "yield-ok";
      tr.innerHTML = `
        <td>${escapeHtml(rec.woNumber)}</td>
        <td>${escapeHtml(rec.fgItem)}</td>
        <td>${escapeHtml(rec.bulkItem)}</td>
        <td class="${statusClass}">${fmt(results.finalYieldRatio * 100)}%</td>
        <td class="${statusClass}">${results.statusLabel}</td>
        <td>${escapeHtml(rec.dateCreated)}</td>
        <td class="row-actions">
          <button type="button" data-action="load" data-id="${escapeHtml(rec.id)}">Load</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(rec.id)}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

function computeFromData(data) {
  const snapshot = collectFormData();
  applyFormDataSilently(data);
  const r = computeResults();
  applyFormDataSilently(snapshot);
  return r;
}

function applyFormDataSilently(data) {
  fields.forEach(id => { el(id).value = data[id] ?? (id === "tareWeight" ? 6 : ""); });
}

form.addEventListener("submit", e => {
  e.preventDefault();
  const data = collectFormData();
  if (!data.woNumber) {
    alert("WO # is required.");
    return;
  }
  const records = loadRecords();
  if (editingId) {
    const idx = records.findIndex(r => r.id === editingId);
    if (idx >= 0) records[idx] = { ...data, id: editingId };
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    records.push(data);
    editingId = data.id;
    editingBadge.classList.remove("hidden");
  }
  saveRecords(records);
  renderRecordsTable();
});

el("newBtn").addEventListener("click", clearForm);

el("searchBox").addEventListener("input", renderRecordsTable);

el("recordsTableBody").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const records = loadRecords();
  if (btn.dataset.action === "load") {
    const rec = records.find(r => r.id === id);
    if (rec) {
      editingId = id;
      editingBadge.classList.remove("hidden");
      applyFormData(rec);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } else if (btn.dataset.action === "delete") {
    if (confirm("Delete this saved yield sheet?")) {
      saveRecords(records.filter(r => r.id !== id));
      if (editingId === id) clearForm();
      renderRecordsTable();
    }
  }
});

el("exportCsvBtn").addEventListener("click", () => {
  const records = loadRecords();
  if (records.length === 0) {
    alert("No saved records to export.");
    return;
  }
  const header = [...fields, "finalYieldPercent", "status"];
  const rows = records.map(rec => {
    const r = computeFromData(rec);
    return [...fields.map(f => rec[f] ?? ""), fmt(r.finalYieldRatio * 100), r.statusLabel];
  });
  const csv = [header, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pk030_yield_sheets.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// Column widths (pt) of the Excel print area PK030!E21:L71, columns E..L.
const XL_COL_WIDTHS_PT = [48, 65.25, 138.75, 98.25, 123, 37.5, 108.75, 161.25];
const PARTIAL_PALLET_TEXT =
  "Partial Pallet Configuration:_________________________________________________ By:___________  Date:_________________";
const FOOTER_NOTE = "For Pharmavite internal use, only. ";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Mimics how Excel's CONCATENATE renders a cell in General format.
function excelGeneral(raw) {
  const t = String(raw ?? "").trim();
  if (t === "") return "";
  const n = Number(t);
  return Number.isFinite(n) ? String(n) : t;
}

function fmt3(n) {
  return n.toFixed(3);
}

function excelPct0(ratio) {
  const v = Math.sign(ratio) * Math.round(Math.abs(ratio) * 100);
  return (v === 0 ? 0 : v) + "%";
}

function formatDateMMDDYY(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y.slice(2)}`;
}

function buildSummaryLines(data) {
  const g = id => excelGeneral(data[id]);
  const line1 =
    `Total Bottles Produced =${g("totalPackaged")}   Bulk Piece Weight =${g("pieceWt")}` +
    `   Fill Rate =${g("fillRate")}   Bulk Rejected/Returned =${g("bulkRejected")}TH` +
    `   Bulk Issued=${g("bulkIssued")}TH`;
  const line2 =
    `Packaging Scrap #1 =${g("scrap1")} KG    Packaging Scrap #2 =${g("scrap2")} KG` +
    `    Packaging Scrap #3 =${g("scrap3")} KG    Manufacturing Scrap =${g("mfgScrap")} KG` +
    `     Container Tare Weight= ${g("tareWeight")}KG`;
  return { line1, line2 };
}

function xlCell(text = "", opts = {}) {
  const style = opts.sz ? ` style="font-size:${opts.sz}pt"` : "";
  const cls = opts.cls ? ` class="${opts.cls}"` : "";
  return `<td${cls}${style}${opts.span ? " " + opts.span : ""}>${escapeHtml(text)}</td>`;
}

function xlEmpty(n = 1) {
  return "<td></td>".repeat(n);
}

function xlTable(rows) {
  const cols = XL_COL_WIDTHS_PT.map(w => `<col style="width:${w}pt">`).join("");
  const body = rows.map(([h, cells]) => `<tr style="height:${h}pt">${cells}</tr>`).join("");
  return `<table class="xl"><colgroup>${cols}</colgroup>${body}</table>`;
}

function buildPrintSheet() {
  const data = collectFormData();
  const r = computeResults();
  const { line1, line2 } = buildSummaryLines(data);

  // Excel's C12..C18 divide by Bulk Piece Wt whenever a scrap weight is entered.
  const scrapDivError = r.pieceWt === 0 && r.scrapInputs.some(s => s.gross > 0);
  const netIssuedDenom = (r.bulkIssued * 1000) - (r.bulkRejected * 1000);
  const DIV0 = "#DIV/0!";

  const i32 = scrapDivError ? DIV0 : fmt3(r.scrapPiecesSum);
  const k31 = netIssuedDenom === 0 ? DIV0 : excelPct0((r.totalPackaged * r.fillRate) / netIssuedDenom);
  const k32 = scrapDivError || r.bulkIssued === 0 ? DIV0 : excelPct0(r.scrapPiecesSum / r.bulkIssued);
  const yieldValid = !scrapDivError && netIssuedDenom !== 0;
  const k33 = yieldValid ? excelPct0(r.finalYieldRatio) : DIV0;
  const outOfRange = yieldValid && (r.lowYield || r.highYield);

  const flagText = !yieldValid ? ""
    : r.highYield ? "High Yield NCCAPA___________"
    : r.lowYield ? "Low Yield NCCAPA____________" : "";
  const videoJetText = outOfRange
    ? `VideoJet Count:      ${excelGeneral(data.videoJetCount)}       By:___________          Date:_________________`
    : "";
  const palletText = outOfRange ? PARTIAL_PALLET_TEXT : "";

  // Conditional formatting copied from the workbook.
  const k33Cf = outOfRange ? " cf-bad" : "";
  const videoJetCf = Number(data.videoJetCount) ? " cf-yellow" : "";
  const palletCf = palletText === PARTIAL_PALLET_TEXT ? " cf-yellow-white" : "";

  const bb = "b-b";
  const tb = "b-t b-b";

  const page1 = [
    [15, xlEmpty(2) + xlCell("PK030M [ALL] Final Packaging Yield Sheet ", { sz: 26, cls: "al-c va-m", span: 'colspan="5" rowspan="2"' }) + xlEmpty()],
    [44.25, xlEmpty(2) + xlCell("Page 1 of 2", { sz: 10, cls: "al-r" })],
    [18.75, xlEmpty(8)],
    [33, xlEmpty(2) + xlCell("FG Item:", { sz: 26, cls: "al-r" }) + xlCell(data.fgItem, { sz: 26 }) + xlEmpty()
      + xlCell("Work Order:", { sz: 26, cls: "al-c", span: 'colspan="2"' }) + xlCell(data.woNumber, { sz: 26 })],
    [7.5, xlEmpty(8)],
    [33, xlEmpty(2) + xlCell("Bulk Item:", { sz: 26, cls: "al-r" }) + xlCell(data.bulkItem, { sz: 26 }) + xlEmpty(4)],
    [9.75, xlEmpty(8)],
    [14.25, xlEmpty(8)],
    [23.25, xlCell("Bulk Reconciliation:", { sz: 18 }) + xlEmpty(7)],
    [30, xlEmpty() + xlCell("Bulk Issued (TH) ", { sz: 24, cls: bb }) + xlCell("", { cls: bb }) + xlCell("", { cls: bb })
      + xlCell(fmt3(r.bulkIssuedNet), { sz: 24, cls: `al-r ${bb}` }) + xlEmpty(3)],
    [30, xlEmpty() + xlCell("Bulk Packaged (TH)", { sz: 24, cls: bb }) + xlCell("", { cls: bb }) + xlCell("", { cls: bb })
      + xlCell(fmt3(r.bulkPackagedTH), { sz: 24, cls: `al-r ${bb}` }) + xlCell("", { cls: bb })
      + xlCell(k31, { sz: 24, cls: `al-r ${bb}` }) + xlCell("", { cls: bb })],
    [30, xlEmpty() + xlCell("Bulk Scrapped (TH)", { sz: 24, cls: tb }) + xlCell("", { cls: tb }) + xlCell("", { cls: tb })
      + xlCell(i32, { sz: 24, cls: `al-r ${tb}` }) + xlCell("", { cls: tb })
      + xlCell(k32, { sz: 24, cls: `al-r ${tb}` }) + xlCell("", { cls: tb })],
    [30, xlEmpty() + xlCell("Final Yield", { sz: 24, cls: tb }) + xlCell("", { cls: tb }) + xlCell("", { cls: tb })
      + xlCell("", { cls: tb }) + xlCell("", { cls: tb })
      + xlCell(k33, { sz: 24, cls: `al-r ${tb}${k33Cf}` })
      + xlCell("Range 95% to 102%(In-House)   Range 95% to 110%(PIM)", { sz: 10, cls: `va-m wrap ${tb}` })],
    [16.5, xlEmpty() + xlCell(line1, { sz: 10 }) + xlEmpty(6)],
    [16.5, xlEmpty() + xlCell(line2, { sz: 10 }) + xlEmpty(6)],
    [19.5, xlEmpty(8)],
    [20.25, xlEmpty(6) + xlCell(formatDateMMDDYY(data.dateCreated), { sz: 11, cls: "bold ul", span: 'rowspan="2"' }) + xlEmpty()],
    [14.25, xlEmpty() + xlCell("Yield Sheet Created By:_____________________________________________", { sz: 10 }) + xlEmpty(3)
      + xlCell("    Date:", { sz: 10 }) + xlEmpty()],
    [15.75, xlEmpty(8)],
    [14.25, xlEmpty() + xlCell("Packaging Review By:_______________________________________________", { sz: 10 }) + xlEmpty(3)
      + xlCell("    Date:_________________", { sz: 10 }) + xlEmpty(2)],
    [14.25, xlEmpty(8)],
    [14.25, xlEmpty() + xlCell("Quality Review By: _________________________________________________", { sz: 10 }) + xlEmpty(3)
      + xlCell("    Date:_________________", { sz: 10 }) + xlEmpty(2)],
    [14.25, xlEmpty(8)],
    [14.25, xlEmpty() + xlCell("Quality Release By: ________________________________________________", { sz: 10 }) + xlEmpty(3)
      + xlCell("    Date:_________________", { sz: 10 }) + xlEmpty(2)],
    [14.25, xlEmpty(8)],
    [14.25, xlEmpty(7) + xlCell(flagText, { sz: 10, cls: "bold" })],
    [14.25, xlCell(videoJetText, { sz: 10, cls: `bold${videoJetCf}`, span: 'colspan="5" rowspan="2"' }) + xlEmpty(3)],
    [14.25, xlEmpty(3)],
    [12.75, xlEmpty(8)],
    [12.75, xlCell(palletText, { sz: 10, cls: `bold${palletCf}`, span: 'colspan="7" rowspan="2"' }) + xlEmpty()],
    [14.25, xlEmpty()],
    [19.5, xlEmpty() + xlCell("QS017B", { sz: 11 }) + xlEmpty(2) + xlCell(FOOTER_NOTE, { sz: 11 }) + xlEmpty(2)
      + xlCell("PKGN-0140, PKGN-0154", { sz: 11 })]
  ];

  const bigRow = (label, labelSz, value) =>
    [99.75, xlEmpty() + xlCell(label, { sz: labelSz, cls: "al-r va-m", span: 'colspan="2"' })
      + xlCell(value, { sz: 80, cls: "va-m", span: 'colspan="5"' })];

  const page2 = [
    [14.25, xlEmpty(2) + xlCell("PK030M [ALL] Final Packaging Yield Sheet", { sz: 10, cls: "bold al-c", span: 'colspan="4"' })
      + xlEmpty() + xlCell("Page 2 of 2", { sz: 10, cls: "al-r" })],
    [99, xlEmpty(8)],
    bigRow("List #  ", 46, data.fgItem),
    bigRow("Lot #  ", 48, data.woNumber),
    bigRow("CC #  ", 45, data.bulkItem),
    ...Array.from({ length: 12 }, () => [14.25, xlEmpty(8)]),
    [13.5, xlEmpty(8)],
    [14.25, xlEmpty() + xlCell("QS017B", { sz: 11 }) + xlEmpty(2) + xlCell(FOOTER_NOTE, { sz: 11 }) + xlEmpty(2)
      + xlCell("PKGN-0140, PKGN-0154", { sz: 11 })]
  ];

  el("printSheet").innerHTML = `
    <div class="xl-page">
      <img class="xl-logo" src="assets/pharmavite-logo.png" alt="Pharmavite">
      ${xlTable(page1)}
    </div>
    <div class="xl-page">
      ${xlTable(page2)}
    </div>`;
}

el("printBtn").addEventListener("click", () => {
  buildPrintSheet();
  window.print();
});

clearForm();
renderRecordsTable();
