const STORAGE_KEY = "pk030_yield_sheets";
const LOW_YIELD_THRESHOLD = 0.945;
const HIGH_YIELD_THRESHOLD = 1.024999;

const form = document.getElementById("yieldForm");
const editingBadge = document.getElementById("editingBadge");
let editingId = null;

const fields = [
  "fgItem", "woNumber", "bulkItem", "dateCreated", "createdBy",
  "qtyCompleted", "retains", "donations", "totalPackaged",
  "fillRate", "bulkRejected", "bulkIssued",
  "pieceWt", "tareWeight", "scrap1", "scrap2", "scrap3", "mfgScrap",
  "videoJetCount", "palletLayers", "palletBoxes"
];

const SCRAP_FIELDS = [
  { id: "scrap1", key: "Packaging Scrap #1" },
  { id: "scrap2", key: "Packaging Scrap #2" },
  { id: "scrap3", key: "Packaging Scrap #3" },
  { id: "mfgScrap", key: "Manufacturing Scrap" }
];

function el(id) { return document.getElementById(id); }

function toNum(v) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Mirrors the PK030 formulas; `error` is set where Excel would show #DIV/0!.
// Sheets saved before Retains/Donations existed only stored the total.
function withBottleBreakdown(data) {
  if (data.qtyCompleted !== undefined) return data;
  return { ...data, qtyCompleted: data.totalPackaged ?? "0", retains: "0", donations: "0" };
}

function computeResults(input) {
  const data = withBottleBreakdown(input);
  const totalPackaged = toNum(data.qtyCompleted) + toNum(data.retains) + toNum(data.donations);
  const fillRate = toNum(data.fillRate);
  const bulkRejected = toNum(data.bulkRejected);
  const bulkIssued = toNum(data.bulkIssued);
  const pieceWt = toNum(data.pieceWt);
  const tareWeight = data.tareWeight === undefined ? 6 : toNum(data.tareWeight);

  const scrapInputs = SCRAP_FIELDS.map(({ id, key }) => {
    const gross = toNum(data[id]);
    const net = gross > 0 ? gross - tareWeight : 0;
    const pieces = gross > 0 && pieceWt !== 0 ? (net * 1000) / pieceWt : 0;
    return { key, gross, net, pieces };
  });
  const scrapDivError = pieceWt === 0 && scrapInputs.some(s => s.gross > 0);
  const scrapPiecesSum = scrapInputs.reduce((sum, s) => sum + s.pieces, 0);

  const bulkIssuedNet = bulkIssued - bulkRejected;
  const bulkPackagedTH = (totalPackaged * fillRate) / 1000;
  const netIssuedDenom = (bulkIssued * 1000) - (bulkRejected * 1000);

  let error = "";
  if (netIssuedDenom === 0) {
    error = bulkIssued === 0
      ? "Enter Issued Bulk (TH) to calculate the yield."
      : "Issued Bulk equals Bulk Rejected/Returned, so the yield can't be calculated.";
  } else if (scrapDivError) {
    error = "Enter Bulk Piece Wt (mg) to convert the scrap weights.";
  }

  const finalYieldRatio = error ? null
    : ((totalPackaged * fillRate) + scrapPiecesSum * 1000) / netIssuedDenom;
  const lowYield = !error && finalYieldRatio < LOW_YIELD_THRESHOLD;
  const highYield = !error && finalYieldRatio > HIGH_YIELD_THRESHOLD;
  const outOfRange = lowYield || highYield;

  let statusLabel = "Within range";
  if (error) statusLabel = "Incomplete";
  else if (highYield) statusLabel = "High Yield NCCAPA";
  else if (lowYield) statusLabel = "Low Yield NCCAPA";

  return {
    totalPackaged, fillRate, bulkRejected, bulkIssued, pieceWt, tareWeight,
    scrapInputs, scrapDivError, scrapPiecesSum, bulkIssuedNet, bulkPackagedTH,
    netIssuedDenom, finalYieldRatio, lowYield, highYield, outOfRange, statusLabel, error
  };
}

// Rounds half away from zero on the displayed digits, as Excel does
// (plain toFixed/Math.round misround values like 1.0005 or 28.5%).
function excelRound(n, digits) {
  const scaled = Number((Math.abs(n) * 10 ** digits).toPrecision(15));
  const r = Math.sign(n) * Math.round(scaled) / 10 ** digits;
  return r === 0 ? 0 : r;
}

function fmtFixed(n, digits) {
  return excelRound(n, digits).toFixed(digits);
}

function fmtYield(r, digits) {
  return r.error ? "—" : fmtFixed(r.finalYieldRatio * 100, digits) + "%";
}

function statusClass(r) {
  if (r.error) return "yield-na";
  return r.outOfRange ? "yield-warn" : "yield-ok";
}

function renderResults(r, data) {
  el("rBulkIssuedNet").textContent = fmtFixed(r.bulkIssuedNet, 2) + " TH";
  el("rBulkPackaged").textContent = fmtFixed(r.bulkPackagedTH, 2) + " TH";
  el("rBulkScrapped").textContent = r.scrapDivError ? "—" : fmtFixed(r.scrapPiecesSum, 2) + " TH";
  el("rFinalYield").textContent = fmtYield(r, 2);

  document.querySelectorAll(".out-of-range-only")
    .forEach(section => section.classList.toggle("hidden", !r.outOfRange));

  const banner = el("statusBanner");
  if (r.error) {
    banner.className = "status-banner info";
    banner.textContent = r.error;
  } else if (r.outOfRange) {
    banner.className = "status-banner warn";
    banner.textContent = `${r.statusLabel} — VideoJet Count required (outside 94.5%–102.4999%)`;
  } else {
    banner.className = "status-banner ok";
    banner.textContent = "Within range (94.5% – 102.4999%)";
  }

  const tbody = el("scrapTableBody");
  tbody.innerHTML = "";
  r.scrapInputs.forEach(s => {
    const pieces = s.gross > 0 && r.scrapDivError ? "—" : fmtFixed(s.pieces, 2);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${s.key}</td><td>${fmtFixed(s.gross, 2)}</td><td>${fmtFixed(s.net, 2)}</td><td>${pieces}</td>`;
    tbody.appendChild(tr);
  });

  const { line1, line2 } = buildSummaryLines(data);
  el("summaryLine1").textContent = line1;
  el("summaryLine2").textContent = line2;
}

function recalc() {
  const data = collectFormData();
  const r = computeResults(data);
  data.totalPackaged = String(r.totalPackaged);
  el("totalPackaged").value = data.totalPackaged;
  renderResults(r, data);
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

const OTHER_LEAD = "__other__";

function populateLeads() {
  const options = [["", "— Select lead —"], ...LEADS.map(name => [name, name]), [OTHER_LEAD, "Other…"]];
  el("createdBy").innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
}

function syncOtherLead() {
  el("createdByOtherWrap").classList.toggle("hidden", el("createdBy").value !== OTHER_LEAD);
}

function getCreatedBy() {
  return el("createdBy").value === OTHER_LEAD ? el("createdByOther").value.trim() : el("createdBy").value;
}

// Names not in LEADS (typed via "Other…", or a lead since removed) load into the text box.
function setCreatedBy(name) {
  const listed = name === "" || LEADS.includes(name);
  el("createdBy").value = listed ? name : OTHER_LEAD;
  el("createdByOther").value = listed ? "" : name;
  syncOtherLead();
}

function collectFormData() {
  const data = {};
  fields.forEach(id => { data[id] = id === "createdBy" ? getCreatedBy() : el(id).value; });
  return data;
}

function applyFormData(record) {
  const data = withBottleBreakdown(record);
  fields.forEach(id => {
    if (id === "createdBy") setCreatedBy(data.createdBy ?? "");
    else el(id).value = data[id] ?? (id === "tareWeight" ? 6 : "");
  });
  recalc();
}

el("createdBy").addEventListener("change", () => {
  syncOtherLead();
  if (el("createdBy").value === OTHER_LEAD) el("createdByOther").focus();
});

function clearForm() {
  editingId = null;
  editingBadge.classList.add("hidden");
  form.reset();
  syncOtherLead();
  el("dateCreated").value = todayISO();
  el("tareWeight").value = 6;
  el("importLog").innerHTML = "";
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
      const results = computeResults(rec);
      const tr = document.createElement("tr");
      const cls = statusClass(results);
      tr.innerHTML = `
        <td>${escapeHtml(rec.woNumber)}</td>
        <td>${escapeHtml(rec.fgItem)}</td>
        <td>${escapeHtml(rec.bulkItem)}</td>
        <td class="${cls}">${fmtYield(results, 2)}</td>
        <td class="${cls}">${results.statusLabel}</td>
        <td>${escapeHtml(rec.dateCreated)}</td>
        <td class="row-actions">
          <button type="button" data-action="load" data-id="${escapeHtml(rec.id)}">Load</button>
          <button type="button" data-action="delete" data-id="${escapeHtml(rec.id)}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

form.addEventListener("submit", e => {
  e.preventDefault();
  const id = editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const record = { ...collectFormData(), id };
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  saveRecords(records);
  editingId = id;
  editingBadge.classList.remove("hidden");
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
    const r = computeResults(rec);
    return [...fields.map(f => rec[f] ?? ""), r.error ? "" : fmtFixed(r.finalYieldRatio * 100, 2), r.statusLabel];
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

function excelPct0(ratio) {
  return excelRound(ratio * 100, 0) + "%";
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
  const content = opts.html ?? escapeHtml(text);
  return `<td${cls}${style}${opts.span ? " " + opts.span : ""}>${content}</td>`;
}

const CREATED_BY_LABEL = "Yield Sheet Created By:";
const CREATED_BY_BLANKS = 45;
const CREATED_BY_LINE = CREATED_BY_LABEL + "_".repeat(CREATED_BY_BLANKS);

// Writes `value` on a rule as wide as `blanks` of the workbook's underscores
// (an Arial underscore at 10pt is 5.56pt wide); no value keeps the underscores.
function blankHtml(value, blanks, cls = "xl-blank") {
  if (!value) return "_".repeat(blanks);
  return `<span class="${cls}" style="width:${(blanks * 5.56).toFixed(1)}pt">${escapeHtml(value)}</span>`;
}

function createdByHtml(name) {
  return name ? CREATED_BY_LABEL + blankHtml(name, CREATED_BY_BLANKS, "xl-fill") : undefined;
}

// "5 Layers + 2 Boxes"; empty unless both counts are entered.
function palletConfig(data) {
  const layers = String(data.palletLayers ?? "").trim();
  const boxes = String(data.palletBoxes ?? "").trim();
  if (!layers || !boxes) return "";
  const count = (n, one, many) => `${excelGeneral(n)} ${Number(n) === 1 ? one : many}`;
  return `${count(layers, "Layer", "Layers")} + ${count(boxes, "Box", "Boxes")}`;
}

function initials(name) {
  return (name || "").split(/[\s-]+/).filter(Boolean).map(w => w[0].toUpperCase()).join("");
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
  const r = computeResults(data);
  const { line1, line2 } = buildSummaryLines(data);

  const DIV0 = "#DIV/0!";
  const i32 = r.scrapDivError ? DIV0 : fmtFixed(r.scrapPiecesSum, 3);
  const k31 = r.netIssuedDenom === 0 ? DIV0 : excelPct0((r.totalPackaged * r.fillRate) / r.netIssuedDenom);
  const k32 = r.scrapDivError || r.bulkIssued === 0 ? DIV0 : excelPct0(r.scrapPiecesSum / r.bulkIssued);
  const k33 = r.error ? DIV0 : excelPct0(r.finalYieldRatio);

  const flagText = r.highYield ? "High Yield NCCAPA___________"
    : r.lowYield ? "Low Yield NCCAPA____________" : "";
  const videoJetText = r.outOfRange
    ? `VideoJet Count:      ${excelGeneral(data.videoJetCount)}       By:___________          Date:_________________`
    : "";
  const byAndDate = gap => "By:" + blankHtml(initials(data.createdBy), 11)
    + gap + "Date:" + blankHtml(formatDateMMDDYY(todayISO()), 17);
  const videoJetHtml = r.outOfRange
    ? escapeHtml(`VideoJet Count:      ${excelGeneral(data.videoJetCount)}       `) + byAndDate("          ")
    : undefined;
  const palletText = r.outOfRange ? PARTIAL_PALLET_TEXT : "";
  const palletHtml = r.outOfRange
    ? "Partial Pallet Configuration:" + blankHtml(palletConfig(data), 49) + " " + byAndDate("  ")
    : undefined;

  // Conditional formatting copied from the workbook.
  const k33Cf = r.outOfRange ? " cf-bad" : "";
  const videoJetCf = Number(data.videoJetCount) ? " cf-yellow" : "";
  const palletCf = palletText === PARTIAL_PALLET_TEXT ? " cf-yellow" : "";

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
      + xlCell(fmtFixed(r.bulkIssuedNet, 3), { sz: 24, cls: `al-r ${bb}` }) + xlEmpty(3)],
    [30, xlEmpty() + xlCell("Bulk Packaged (TH)", { sz: 24, cls: bb }) + xlCell("", { cls: bb }) + xlCell("", { cls: bb })
      + xlCell(fmtFixed(r.bulkPackagedTH, 3), { sz: 24, cls: `al-r ${bb}` }) + xlCell("", { cls: bb })
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
    [14.25, xlEmpty() + xlCell(CREATED_BY_LINE, { sz: 10, html: createdByHtml(data.createdBy) }) + xlEmpty(3)
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
    [14.25, xlCell(videoJetText, { sz: 10, cls: `bold${videoJetCf}`, span: 'colspan="5" rowspan="2"', html: videoJetHtml }) + xlEmpty(3)],
    [14.25, xlEmpty(3)],
    [12.75, xlEmpty(8)],
    [12.75, xlCell(palletText, { sz: 10, cls: `bold${palletCf}`, span: 'colspan="7" rowspan="2"', html: palletHtml }) + xlEmpty()],
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

  el("xlPage1").innerHTML = xlTable(page1);
  el("xlPage2").innerHTML = xlTable(page2);
}

// Also covers Ctrl+P and the browser's File > Print, not just the button.
window.addEventListener("beforeprint", buildPrintSheet);

el("printBtn").addEventListener("click", () => {
  buildPrintSheet();
  window.print();
});

const IMPORT_FIELDS = ["fgItem", "woNumber", "bulkItem", "qtyCompleted", "bulkIssued", "bulkRejected"];

function renderImportLog(log) {
  el("importLog").innerHTML = log
    .map(m => `<li class="log-${m.level}">${escapeHtml(m.text)}</li>`)
    .join("");
}

function flashField(input) {
  input.classList.remove("imported");
  void input.offsetWidth;
  input.classList.add("imported");
}

async function importPdfs(fileList) {
  const files = [...fileList].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (!files.length) {
    renderImportLog([{ level: "error", text: "Choose PDF files." }]);
    return;
  }
  renderImportLog([{ level: "info", text: `Reading ${files.length} PDF${files.length > 1 ? "s" : ""}…` }]);

  let result;
  try {
    result = await PdfImport.readReports(files);
  } catch (err) {
    renderImportLog([{ level: "error", text: `Import failed: ${err.message}` }]);
    return;
  }

  const { values, log } = result;
  const found = IMPORT_FIELDS.filter(id => values[id] !== undefined && values[id] !== null);
  if (found.length) {
    const currentWo = el("woNumber").value.trim();
    if (currentWo && values.woNumber && currentWo !== values.woNumber) {
      clearForm();
      log.push({ level: "info", text: `Started a new sheet, since the form had WO ${currentWo}.` });
    }
    found.forEach(id => {
      el(id).value = String(values[id]);
      flashField(el(id));
    });
    recalc();
    log.push({ level: "info", text: "Still to enter by hand: Retains, Donations, Count, Bulk Piece Wt and the scrap weights." });
  }
  renderImportLog(log);
}

el("pdfInput").addEventListener("change", e => {
  importPdfs(e.target.files);
  e.target.value = "";
});

const dropZone = el("dropZone");
["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, e => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
}));
dropZone.addEventListener("dragleave", e => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove("drag-over");
});
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  importPdfs(e.dataTransfer.files);
});
// A PDF dropped just outside the zone would otherwise open in the tab and lose the form.
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", e => e.preventDefault());

populateLeads();
clearForm();
renderRecordsTable();
