const STORAGE_KEY = "pk030_yield_sheets";
const TWO_SIDED_KEY = "pk030_two_sided";
const LOW_YIELD_THRESHOLD = 0.945;
const HIGH_YIELD_THRESHOLD = 1.024999;

const form = document.getElementById("yieldForm");
const editingBadge = document.getElementById("editingBadge");
let editingId = null;
// True once the open sheet has changes that aren't saved (see confirmLeaveSheet).
let sheetDirty = false;
// The signed-in username (null when not signed in), and whether someone chose
// in the Created By dropdown on this sheet (see applyDefaultCreatedBy).
let currentUser = null;
let createdByPicked = false;
// The signed-in account's type (null until known) and name, every account
// (for admins), and whether the app runs without a database on this computer
// (see renderAccess).
let role = null;
let accountName = "";
let accounts = [];
let localOnly = false;
// Account types, lowest first, and the views PLT and MLT may open (see
// renderAccess).
const ROLE_ORDER = ["plt", "mlt", "lead", "admin", "owner"];
const ROLE_LABELS = { plt: "PLT", mlt: "MLT", lead: "Lead", admin: "Admin", owner: "Owner" };
const LIMITED_VIEWS = {
  plt: ["formsTab", "unplannedTab", "bulkReturnTab", "bulkCalcTab"],
  mlt: ["formsTab", "unplannedTab", "bulkReturnTab", "swTab", "ctTab", "trainingTab", "tsTab", "pcTab", "rotTab", "bulkCalcTab"]
};
// Views only Admins and Owners open.
const ADMIN_VIEWS = ["adminTab", "activityTab"];
const atLeast = (r, min) => ROLE_ORDER.indexOf(r) >= ROLE_ORDER.indexOf(min);
const effectiveRole = () => (localOnly ? "owner" : role);
// True while renderStoredData replaces the leads list (see the lead-username
// focusout handler).
let redrawingLeads = false;
// Imported report PDFs as page images (see addImportedReports).
const REPORT_ORDER = { closeout: 0, pallet: 1, charge: 2 };
let importedReports = [];
// Bumped by every import and by New / Clear, so a slower earlier import can
// tell it was superseded and stop.
let importGen = 0;

const fields = [
  "fgItem", "woNumber", "bulkItem", "dateCreated", "createdBy",
  "qtyCompleted", "retains", "donations", "stability", "totalPackaged",
  "fillRate", "bulkRejected", "bulkReturned", "bulkIssued",
  "pieceWt", "tareWeight", "scrap1", "scrap2", "scrap3", "mfgScrap",
  "videoJetCount", "palletLayers", "palletBoxes"
];

// The yield sheet won't print until these are filled in (0 counts as filled).
const REQUIRED_FOR_PRINT = [
  ["fgItem", "FG Item"], ["woNumber", "WO #"], ["bulkItem", "Bulk Item"],
  ["qtyCompleted", "Quantity Completed"], ["retains", "Retains"], ["donations", "Donations"],
  ["fillRate", "Count"], ["bulkIssued", "Issued Bulk"], ["pieceWt", "Bulk Piece Wt"],
  ["scrap1", "Packaging Scrap #1"]
];
// Set by the first print attempt; from then on the highlights follow the form.
let printChecked = false;

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

// A date (today by default) as YYYY-MM-DD.
function todayISO(d = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sheets saved before the bottle breakdown only stored the total, and ones
// saved before Stability existed have no stability count.
function withBottleBreakdown(data) {
  const withStability = data.stability === undefined ? { ...data, stability: "0" } : data;
  if (data.qtyCompleted !== undefined) return withStability;
  return { ...withStability, qtyCompleted: data.totalPackaged ?? "", retains: "", donations: "" };
}

// Mirrors the PK030 formulas; `error` is set where Excel would show #DIV/0!.
function computeResults(input) {
  const data = withBottleBreakdown(input);
  const totalPackaged = toNum(data.qtyCompleted) + toNum(data.retains)
    + toNum(data.donations) + toNum(data.stability);
  const fillRate = toNum(data.fillRate);
  // The workbook's single Bulk Rejected/Returned cell (B8).
  const bulkRejected = toNum(data.bulkRejected) + toNum(data.bulkReturned);
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

// Animations are skipped when the computer asks for reduced motion.
const reducedMotion = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

// Counts a number up (or down) to its new value over a moment.
const countUps = new WeakMap();
function countUp(node, to, format) {
  cancelAnimationFrame(countUps.get(node)?.frame);
  const from = countUps.get(node)?.value;
  if (reducedMotion.matches || from === undefined || from === null || to === null || from === to) {
    node.textContent = to === null ? "—" : format(to);
    countUps.set(node, { value: to });
    return;
  }
  const start = performance.now();
  const step = now => {
    const t = Math.min(1, (now - start) / 350);
    const v = from + (to - from) * (1 - (1 - t) ** 3);
    node.textContent = format(t === 1 ? to : v);
    countUps.set(node, { value: t === 1 ? to : v, frame: t === 1 ? undefined : requestAnimationFrame(step) });
  };
  countUps.set(node, { value: from, frame: requestAnimationFrame(step) });
}

// The gauge's scale: 90% at the left end, 107% at the right.
const GAUGE_MIN = 0.90;
const GAUGE_MAX = 1.07;
const gaugePos = ratio => `${Math.min(100, Math.max(0, (ratio - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN) * 100))}%`;

function renderGauge(r) {
  const state = r.error ? "na" : r.outOfRange ? "warn" : "ok";
  el("ysGauge").dataset.state = state;
  countUp(el("rFinalYield"), r.error ? null : excelRound(r.finalYieldRatio * 100, 2), v => `${v.toFixed(2)}%`);
  el("ysMarker").style.left = r.error ? "50%" : gaugePos(r.finalYieldRatio);
  el("ysMarker").title = r.error ? "" : fmtYield(r, 2);
  const pill = el("ysPill");
  pill.hidden = !!r.error;
  pill.className = `ys-pill ${state}`;
  pill.textContent = r.error ? "" : `${fmtYield(r, 2)} · ${r.highYield ? "high" : r.lowYield ? "low" : "in range"}`;
}

// Where the issued bulk went: packaged, scrapped, rejected/returned, and
// what's left over (or how much more than issued was counted).
function renderBalance(r) {
  const issued = r.bulkIssued;
  const scrapped = r.scrapDivError ? 0 : r.scrapPiecesSum;
  const rest = issued - r.bulkPackagedTH - scrapped - r.bulkRejected;
  const over = rest < -0.005;
  const parts = { packaged: r.bulkPackagedTH, scrapped, rejected: r.bulkRejected, missing: over ? 0 : Math.max(0, rest) };
  const total = Math.max(issued, r.bulkPackagedTH + scrapped + r.bulkRejected) || 0;
  Object.entries(parts).forEach(([k, v]) => {
    const seg = el("ysBar").querySelector(`.seg-${k}`);
    seg.style.flexGrow = total > 0 ? Math.max(0, v) / total : 0;
    const pct = total > 0 ? v / total * 100 : 0;
    seg.textContent = k === "packaged" && pct >= 25 ? `Packaged ${fmtFixed(pct, 2)}%` : k === "missing" && pct >= 4 ? `${fmtFixed(pct, 2)}%` : "";
  });
  el("ysBar").classList.toggle("empty", !(total > 0));
  el("ysBalanceOf").textContent = issued > 0 ? `of ${fmtFixed(issued, 2)} TH issued` : "";
  el("ysRejected").textContent = fmtFixed(r.bulkRejected, 2) + " TH";
  el("ysMissingLabel").textContent = over ? "Counted beyond what was issued" : "Not accounted for";
  el("ysMissing").textContent = issued > 0 ? `${over ? "+" : ""}${fmtFixed(Math.abs(rest), 2)} TH` : "—";
  el("ysMissing").classList.toggle("yield-warn", over);
}

function renderResults(r, data) {
  el("rBulkIssuedNet").textContent = fmtFixed(r.bulkIssuedNet, 2) + " TH";
  el("rBulkPackaged").textContent = fmtFixed(r.bulkPackagedTH, 2) + " TH";
  el("rBulkScrapped").textContent = r.scrapDivError ? "—" : fmtFixed(r.scrapPiecesSum, 2) + " TH";
  renderGauge(r);
  renderBalance(r);
  const bottles = data.totalPackaged;
  el("ysTotalText").textContent = bottles === "" ? "—" : `${Number(bottles).toLocaleString("en-US")} bottle${Number(bottles) === 1 ? "" : "s"}`;
  const wo = data.woNumber.trim();
  const fg = data.fgItem.trim();
  el("ysChip").textContent = wo || fg ? [wo && `WO ${wo}`, fg && `FG ${fg}`].filter(Boolean).join(" · ") : "New sheet";

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

  renderCardPreview(data);

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

// The paper card's values, as entered on the form (scrap weights gross).
function renderCardPreview(data) {
  const cells = {
    cardTotalPacked: excelGeneral(data.qtyCompleted),
    cardPkgScrap: sumEntered(data, ["scrap1", "scrap2", "scrap3"]),
    cardMfgScrap: excelGeneral(data.mfgScrap),
    cardPieceWt: excelGeneral(data.pieceWt),
    cardBulkIssued: excelGeneral(data.bulkIssued),
    cardBulkRejected: excelGeneral(data.bulkRejected),
    cardBulkReturned: excelGeneral(data.bulkReturned),
    cardTotalYielded: excelGeneral(data.totalPackaged)
  };
  Object.entries(cells).forEach(([id, text]) => { el(id).textContent = text; });
}

function recalc() {
  const data = collectFormData();
  const r = computeResults(data);
  // Stability starts at 0, so only a nonzero Stability counts as entered.
  const bottlesEntered = ["qtyCompleted", "retains", "donations"].some(id => data[id] !== "")
    || toNum(data.stability) !== 0;
  data.totalPackaged = bottlesEntered ? String(r.totalPackaged) : "";
  el("totalPackaged").value = data.totalPackaged;
  renderResults(r, data);
  updatePrintReports();
  markMissing();
  saveDraft();
}

// The steps above the sheet: each turns ✓ once its required fields are in,
// and says what's left; a click goes to the first field still empty.
const YS_STEPS = [
  { key: "import", label: "Reports", fields: [] },
  { key: "wo", label: "Work order", fields: ["fgItem", "woNumber", "bulkItem"] },
  { key: "bottles", label: "Bottles", fields: ["qtyCompleted", "retains", "donations"] },
  { key: "bulk", label: "Bulk", fields: ["fillRate", "bulkIssued"] },
  { key: "scrap", label: "Scrap", fields: ["pieceWt", "scrap1"] }
];
const requiredLabel = id => REQUIRED_FOR_PRINT.find(([f]) => f === id)[1];
let stepsDone = null;
function renderSteps() {
  const missing = new Set(missingForPrint().map(([id]) => id));
  const done = new Set();
  el("ysSteps").innerHTML = YS_STEPS.map((step, i) => {
    const left = step.fields.filter(id => missing.has(id));
    const isDone = step.key === "import" ? el("importBox").classList.contains("done") : left.length === 0;
    if (isDone) done.add(step.key);
    const pop = isDone && stepsDone && !stepsDone.has(step.key) ? " pop" : "";
    let cls = isDone ? "done" : step.key === "import" ? "optional" : printChecked ? "todo" : "";
    let text = escapeHtml(step.label);
    if (!isDone && step.key === "import") text += ' <small>optional</small>';
    else if (!isDone && printChecked) text += `: ${escapeHtml(left.map(requiredLabel).join(", "))}`;
    else if (!isDone) text += ` <small>${left.length} left</small>`;
    return `<li><button type="button" class="ys-step ${cls}${pop}" data-step="${step.key}"><i aria-hidden="true">${isDone ? "✓" : printChecked && step.key !== "import" ? "!" : i + 1}</i>${text}</button></li>`;
  }).join("");
  stepsDone = done;
  el("ysLeft").textContent = missing.size ? `${missing.size} left before it can print` : "✓ Ready to print";
  el("ysLeft").classList.toggle("ready", !missing.size);
}
el("ysSteps").addEventListener("click", e => {
  const b = e.target.closest("[data-step]");
  if (!b) return;
  const step = YS_STEPS.find(s => s.key === b.dataset.step);
  const first = step.fields.find(id => el(id).value.trim() === "") ?? step.fields[0];
  const target = first ? el(first) : el("importBox");
  target.scrollIntoView({ block: "center", behavior: reducedMotion.matches ? "auto" : "smooth" });
  if (first) target.focus({ preventScroll: true });
});

// Live Results: Pink card, Scrap table or Summary lines.
document.querySelectorAll("[data-ys-tab]").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll("[data-ys-tab]").forEach(t => {
    t.classList.toggle("active", t === tab);
    t.setAttribute("aria-selected", String(t === tab));
  });
  document.querySelectorAll("[data-ys-panel]").forEach(p => p.classList.toggle("hidden", p.dataset.ysPanel !== tab.dataset.ysTab));
}));

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
  const current = getCreatedBy();
  const options = [["", "— Select lead —"], ...StoredData.leads().map(name => [name, name]), [OTHER_LEAD, "Other…"]];
  el("createdBy").innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  setCreatedBy(current);
}

function syncOtherLead() {
  el("createdByOtherWrap").classList.toggle("hidden", el("createdBy").value !== OTHER_LEAD);
}

function getCreatedBy() {
  return el("createdBy").value === OTHER_LEAD ? el("createdByOther").value.trim() : el("createdBy").value;
}

// Names not in Stored Data (typed via "Other…", or a lead since removed) load into the text box.
function setCreatedBy(name) {
  const listed = name === "" || StoredData.leads().includes(name);
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
    else el(id).value = data[id] ?? el(id).defaultValue;
  });
  resetAutoFills();
  document.querySelectorAll("#yieldForm .from-import").forEach(l => l.classList.remove("from-import"));
  sheetDirty = false;
  recalc();
}

// Fields filled from Stored Data unless someone typed them (a blank or 0 value
// counts as not typed); a value filled for a previous item is replaced, or
// cleared if the new item isn't stored.
const AUTO_FILLS = [
  { input: "pieceWt", hint: "pieceWtHint", source: "bulkItem", store: StoredData.bulkItems, field: "pieceWt", empty: "" },
  { input: "fillRate", hint: "fillRateHint", source: "fgItem", store: StoredData.fgItems, field: "count", empty: "" }
];

function markManual(fill) {
  delete el(fill.input).dataset.fromItem;
  el(fill.hint).textContent = "";
}

function resetAutoFills() {
  AUTO_FILLS.forEach(markManual);
}

function applyAutoFill(fill) {
  const input = el(fill.input);
  const autoFilled = input.dataset.fromItem !== undefined;
  const blank = input.value === "" || Number(input.value) === 0;
  if (!blank && !autoFilled) return false;
  const hit = fill.store.find(el(fill.source).value);
  if (hit) {
    const value = String(hit[fill.field]);
    if (input.value === value && input.dataset.fromItem === hit.item) return false;
    input.value = value;
    input.dataset.fromItem = hit.item;
    el(fill.hint).textContent = "Stored Data";
    el(fill.hint).title = `Filled from Stored Data (${hit.item})`;
    return true;
  }
  if (!autoFilled) return false;
  input.value = fill.empty;
  markManual(fill);
  return true;
}

function fillFromStoredData() {
  if (AUTO_FILLS.map(applyAutoFill).some(Boolean)) recalc();
}

["bulkItem", "fgItem"].forEach(id => el(id).addEventListener("input", fillFromStoredData));
AUTO_FILLS.forEach(fill => el(fill.input).addEventListener("input", () => markManual(fill)));

el("createdBy").addEventListener("change", () => {
  syncOtherLead();
  if (el("createdBy").value === OTHER_LEAD) el("createdByOther").focus();
});

function clearForm() {
  editingId = null;
  editingBadge.classList.add("hidden");
  form.reset();
  restoreTwoSided();
  syncOtherLead();
  el("dateCreated").value = todayISO();
  el("tareWeight").value = 6;
  el("importLog").innerHTML = "";
  renderImportPreview(null);
  importGen++;
  clearImportedReports();
  resetAutoFills();
  createdByPicked = false;
  applyDefaultCreatedBy();
  printChecked = false;
  document.querySelectorAll("#yieldForm .from-import").forEach(l => l.classList.remove("from-import"));
  el("draftNote").classList.add("hidden");
  sheetDirty = false;
  recalc();
}

// Before replacing a sheet that has unsaved changes, ask.
function confirmLeaveSheet() {
  const blank = REQUIRED_FOR_PRINT.every(([id]) => el(id).value.trim() === "");
  return !sheetDirty || blank || confirm("This yield sheet has changes that aren't saved. Leave it anyway?");
}

// The sheet being worked on is kept on this computer as it's typed, so a
// reload or a closed tab doesn't lose it (sign-out removes it).
const DRAFT_KEY = "pk030_yield_draft";
function saveDraft() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: collectFormData(), editingId, dirty: sheetDirty })); } catch { /* not kept */ }
}
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return d && d.data && REQUIRED_FOR_PRINT.some(([id]) => String(d.data[id] ?? "").trim() !== "") ? d : null;
  } catch {
    return null;
  }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ }
}
function restoreDraft(d) {
  if (!d) return;
  applyFormData(d.data);
  if (d.editingId && loadRecords().some(r => r.id === d.editingId)) {
    editingId = d.editingId;
    editingBadge.classList.remove("hidden");
  }
  sheetDirty = !!d.dirty;
  el("draftNote").classList.remove("hidden");
  saveDraft();
}
el("draftDiscardBtn").addEventListener("click", clearForm);

form.addEventListener("input", e => {
  sheetDirty = true;
  e.target.closest("label")?.classList.remove("from-import");
});

// Enter moves to the next box instead of saving the sheet.
form.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target.matches("input, select")) return;
  e.preventDefault();
  const boxes = [...form.querySelectorAll("input:not([type=hidden]):not([type=file]):not([readonly]), select")]
    .filter(b => b.offsetParent !== null && !b.disabled);
  const next = boxes[boxes.indexOf(e.target) + 1];
  if (next) next.focus();
  else e.target.blur();
});
// Phones and tablets show the number keypad.
form.querySelectorAll("input[type=number]").forEach(i => {
  i.inputMode = i.step === "1" ? "numeric" : "decimal";
});

// Saved yield sheets, in the side panel: search, filters (all, out of range,
// this week, the signed-in lead's) and a row per sheet with its yield.
let savedFilter = "all";
const myLeadName = () => (currentUser && (StoredData.leadForUser(currentUser) ?? accountName)) || "";
const SAVED_FILTERS = {
  all: () => true,
  out: rec => computeResults(rec).outOfRange,
  week: rec => (rec.dateCreated || "") >= todayISO(new Date(Date.now() - 6 * 864e5)),
  mine: rec => !!myLeadName() && rec.createdBy === myLeadName()
};

function renderRecordsTable() {
  const search = el("searchBox").value.trim().toLowerCase();
  const records = loadRecords();
  const tbody = el("recordsTableBody");
  el("savedCount").textContent = records.length || "";
  document.querySelectorAll("#savedFilters [data-filter]").forEach(b => {
    b.querySelector("span").textContent = records.filter(SAVED_FILTERS[b.dataset.filter]).length;
    b.classList.toggle("active", b.dataset.filter === savedFilter);
    if (b.dataset.filter === "mine") b.classList.toggle("hidden", !myLeadName());
  });

  const filtered = records.filter(rec => SAVED_FILTERS[savedFilter](rec) && (!search
    || [rec.woNumber, rec.fgItem, rec.bulkItem].some(v => (v || "").toLowerCase().includes(search))));

  el("noRecordsMsg").textContent = records.length ? "No saved yield sheets match." : "No saved yield sheets yet.";
  el("noRecordsMsg").classList.toggle("hidden", filtered.length > 0);

  tbody.innerHTML = filtered
    .slice()
    .sort((a, b) => (b.dateCreated || "").localeCompare(a.dateCreated || ""))
    .map(rec => {
      const results = computeResults(rec);
      const cls = results.error ? "na" : results.outOfRange ? "warn" : "ok";
      const sub = [rec.fgItem && `FG ${rec.fgItem}`, rec.bulkItem, formatDateMMDDYY(rec.dateCreated), rec.createdBy].filter(Boolean).join(" · ");
      return `<li class="ys-rec${rec.id === editingId ? " current" : ""}">
        <button type="button" class="ys-rec-open" data-action="load" data-id="${escapeHtml(rec.id)}">
          <strong>WO ${escapeHtml(rec.woNumber || "—")}</strong><small>${escapeHtml(sub)}</small></button>
        <span class="ys-pill ${cls}" title="${escapeHtml(results.statusLabel)}">${fmtYield(results, 2)}</span>
        <button type="button" class="ys-rec-del" data-action="delete" data-id="${escapeHtml(rec.id)}" title="Delete" aria-label="Delete WO ${escapeHtml(rec.woNumber || "")}">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>
      </li>`;
    }).join("");
}

el("savedFilters").addEventListener("click", e => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  savedFilter = b.dataset.filter;
  renderRecordsTable();
});
function openSaved() {
  renderRecordsTable();
  if (!el("savedDrawer").open) el("savedDrawer").showModal();
}
el("savedBtn").addEventListener("click", () => {
  openSaved();
  el("searchBox").focus();
});
el("savedCloseBtn").addEventListener("click", () => el("savedDrawer").close());
el("savedDrawer").addEventListener("click", e => {
  if (e.target === el("savedDrawer")) el("savedDrawer").close();
});

form.addEventListener("submit", e => {
  e.preventDefault();
  const id = editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const record = { ...collectFormData(), id };
  const records = loadRecords();
  const idx = records.findIndex(r => r.id === id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  saveRecords(records);
  CloudSync.saveSheet(record);
  logActivity(idx >= 0 ? "Updated a yield sheet" : "Saved a yield sheet", sheetLabel(record));
  editingId = id;
  editingBadge.classList.remove("hidden");
  sheetDirty = false;
  el("draftNote").classList.add("hidden");
  saveDraft();
  renderRecordsTable();
  // The Save button says it worked for a moment.
  const btn = el("saveBtn");
  clearTimeout(btn.savedTimer);
  btn.classList.add("saved");
  btn.textContent = "✓ Saved";
  btn.savedTimer = setTimeout(() => {
    btn.classList.remove("saved");
    btn.textContent = "Save";
  }, 1600);
});

el("newBtn").addEventListener("click", () => {
  if (confirmLeaveSheet()) clearForm();
});

el("searchBox").addEventListener("input", renderRecordsTable);

el("recordsTableBody").addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  const records = loadRecords();
  if (btn.dataset.action === "load") {
    const rec = records.find(r => r.id === id);
    if (rec && (id === editingId && !sheetDirty || confirmLeaveSheet())) {
      editingId = id;
      editingBadge.classList.remove("hidden");
      el("draftNote").classList.add("hidden");
      applyFormData(rec);
      el("savedDrawer").close();
      window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
    }
  } else if (btn.dataset.action === "delete") {
    if (confirm("Delete this saved yield sheet?")) {
      saveRecords(records.filter(r => r.id !== id));
      CloudSync.deleteSheet(id);
      logActivity("Deleted a yield sheet", sheetLabel(records.find(r => r.id === id) ?? {}));
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
  downloadCsv([header, ...rows], "pk030_yield_sheets.csv");
  logActivity("Exported yield sheets", `${records.length} sheet(s) to CSV`);
});

function downloadCsv(rows, filename) {
  const csv = rows
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

// Adds entered values without float noise (8.6 + 0.1 is 8.7, not 8.700000000000001);
// blank when none of them is entered.
function sumEntered(data, ids) {
  if (ids.every(id => String(data[id] ?? "").trim() === "")) return "";
  return String(Number(ids.reduce((sum, id) => sum + toNum(data[id]), 0).toPrecision(15)));
}

function buildSummaryLines(data) {
  const g = id => excelGeneral(data[id]);
  const line1 =
    `Total Bottles Produced =${g("totalPackaged")}   Bulk Piece Weight =${g("pieceWt")}` +
    `   Fill Rate =${g("fillRate")}   Bulk Rejected/Returned =${excelGeneral(sumEntered(data, ["bulkRejected", "bulkReturned"]))}TH` +
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

const CREATED_BY_NAME_PT = 18;
let measureCtx = null;

// The lead's name, as large as CREATED_BY_NAME_PT allows on the line's rule;
// a long name is shrunk to fit.
function createdByHtml(name) {
  if (!name) return undefined;
  const width = CREATED_BY_BLANKS * 5.56;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  measureCtx.font = `700 ${CREATED_BY_NAME_PT}pt Arial, "Liberation Sans", Helvetica, sans-serif`;
  const textWidth = measureCtx.measureText(name).width * 0.75; // px to pt
  const size = Math.max(8, Math.min(CREATED_BY_NAME_PT, CREATED_BY_NAME_PT * (width - 6) / textWidth));
  // The &nbsp; keeps the rule at the same height as a 12pt line of text.
  return CREATED_BY_LABEL + `<span class="xl-fill" style="width:${width.toFixed(1)}pt">`
    + `&nbsp;<span class="xl-fill-text" style="font-size:${size.toFixed(1)}pt">${escapeHtml(name)}</span></span>`;
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
  // The workbook highlights whenever B21 has a count, even with the line blank; only highlight a printed line.
  const videoJetCf = r.outOfRange && Number(data.videoJetCount) ? " cf-yellow" : "";
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
  updatePrintReports();
}

function missingForPrint() {
  return REQUIRED_FOR_PRINT.filter(([id]) => el(id).value.trim() === "");
}

function markMissing() {
  const missing = printChecked ? missingForPrint() : [];
  const ids = new Set(missing.map(([id]) => id));
  REQUIRED_FOR_PRINT.forEach(([id]) => {
    el(id).classList.toggle("missing", ids.has(id));
    el(id).closest("label").classList.toggle("missing", ids.has(id));
  });
  const msg = el("printMissingMsg");
  msg.textContent = missing.length ? `Can't print yet. Fill in: ${missing.map(([, label]) => label).join(", ")}.` : "";
  msg.classList.toggle("hidden", !missing.length);
  renderSteps();
  return missing;
}

// Also covers Ctrl+P and the browser's File > Print, not just the button.
window.addEventListener("beforeprint", () => {
  // Tabs with their own printout (bulk-calc.js, bulk-return.js) set this
  // after this listener when they're the open tab; otherwise the yield sheet prints.
  delete document.body.dataset.print;
  buildPrintSheet();
  const open = VIEWS.find(v => !el(v).classList.contains("hidden"));
  if (PRINT_ACTIONS[open]) return;
  printChecked = true;
  const missing = markMissing();
  if (!missing.length) return;
  // The browser's print can't be cancelled from here, so print a note instead.
  document.body.dataset.print = "blocked";
  el("printBlocked").innerHTML = `<h1>Yield sheet not printed</h1><p>Fill in these fields first: ${
    escapeHtml(missing.map(([, label]) => label).join(", "))}.</p>`;
});
window.addEventListener("afterprint", () => delete document.body.dataset.print);

el("printBtn").addEventListener("click", async () => {
  printChecked = true;
  const missing = markMissing();
  if (missing.length) {
    el(missing[0][0]).focus();
    el(missing[0][0]).scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  buildPrintSheet();
  await Promise.all([...document.querySelectorAll("#reportPages img")].map(img => img.decode().catch(() => {})));
  window.print();
});

// Imported report PDFs, rendered to page images at import time so they're
// ready for any print (the button, Ctrl+P or the browser menu). They print
// after the yield sheet while its WO # matches the reports' work order.
function reportsToPrint() {
  const wo = el("woNumber").value.trim();
  return importedReports.filter(r => r.woNumber === wo);
}

// Printing on both sides, each PDF (the yield sheet, then each report)
// starts on the front of a new sheet: a report with an odd number of pages
// gets a blank back page when another report follows it. The yield sheet is
// always two pages, so it fills one sheet. Remembered on this computer (and
// put back after New / Clear resets the form).
function restoreTwoSided() {
  try { el("printTwoSided").checked = localStorage.getItem(TWO_SIDED_KEY) !== "off"; } catch { /* stays on */ }
}

function updatePrintReports() {
  const reports = reportsToPrint();
  const pages = reports.reduce((n, r) => n + r.urls.length, 0);
  el("printReportsCount").textContent =
    `${reports.length} report${reports.length === 1 ? "" : "s"}, ${pages} page${pages === 1 ? "" : "s"}`;
  el("printReportsWrap").classList.toggle("hidden", reports.length === 0);
  const shown = el("printReports").checked ? new Set(reports) : new Set();
  document.querySelectorAll("#reportPages .report-page").forEach(page => {
    page.classList.toggle("hidden", !shown.has(importedReports[page.dataset.report]));
  });
  document.querySelectorAll("#reportPages .report-blank").forEach(blank => blank.remove());
  const printing = importedReports.map((r, i) => [r, i]).filter(([r]) => shown.has(r));
  let blanks = 0;
  if (el("printTwoSided").checked) {
    printing.slice(0, -1).forEach(([r, i]) => {
      if (r.urls.length % 2 === 0) return;
      const pagesOf = document.querySelectorAll(`#reportPages .report-page[data-report="${i}"]`);
      pagesOf[pagesOf.length - 1]?.insertAdjacentHTML("afterend", '<div class="report-page report-blank" aria-hidden="true"></div>');
      blanks++;
    });
  }
  el("printTwoSidedWrap").classList.toggle("hidden", printing.length === 0);
  el("printBlankCount").textContent = blanks ? ` (adds ${blanks} blank page${blanks === 1 ? "" : "s"})` : "";
}

// Preview: the imported PDFs' pages, one PDF at a time (tabs), as they'll print.
const REPORT_NAMES = { closeout: "WO Close-out", pallet: "Pallet Transfers", charge: "Charge Report" };
let rvOpen = 0;
function renderReportViewer() {
  if (!importedReports.length) return;
  rvOpen = Math.min(rvOpen, importedReports.length - 1);
  el("rvTabs").innerHTML = importedReports.map((r, i) => `
    <button type="button" role="tab" class="${i === rvOpen ? "active" : ""}" aria-selected="${i === rvOpen}" data-rv="${i}" title="${escapeHtml(r.name)}">
      ${escapeHtml(REPORT_NAMES[r.type] ?? r.name)}<span>${r.urls.length} page${r.urls.length === 1 ? "" : "s"}</span></button>`).join("");
  const r = importedReports[rvOpen];
  el("rvBody").innerHTML = `<p class="rv-file">${escapeHtml(r.name)} · WO ${escapeHtml(r.woNumber ?? "?")}</p>` + r.urls.map((url, n) =>
    `<figure class="rv-page"><img src="${url}" alt="${escapeHtml(`${r.name} page ${n + 1}`)}"><figcaption>Page ${n + 1} of ${r.urls.length}</figcaption></figure>`).join("");
  el("rvBody").scrollTop = 0;
}
el("previewReportsBtn").addEventListener("click", () => {
  rvOpen = 0;
  renderReportViewer();
  el("reportViewer").showModal();
  setRvZoom(1);
});

// Zoom: 100% fits the page to the window's width (at most 900 px); −/+ step
// through the levels, the % button goes back to fit. Also Ctrl/⌘ + mouse
// wheel, two-finger pinch, double-click (200% there, or back to fit) and the
// −, + and 0 keys. Up to 300% (the pages are rendered at about 216 dpi).
const RV_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const RV_MIN = RV_LEVELS[0];
const RV_MAX = RV_LEVELS[RV_LEVELS.length - 1];
let rvZoom = 1;
function rvFitWidth() {
  const body = el("rvBody");
  const pad = parseFloat(getComputedStyle(body).paddingLeft) * 2;
  return Math.min(900, body.clientWidth - pad);
}
// Keeps the spot of the page at (x, y) inside the body (default: its middle)
// where it is.
function setRvZoom(z, x, y) {
  const body = el("rvBody");
  z = Math.min(RV_MAX, Math.max(RV_MIN, z));
  const box = body.getBoundingClientRect();
  const px = box.left + (x ?? body.clientWidth / 2);
  const py = box.top + (y ?? body.clientHeight / 2);
  const dist = r => (py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0);
  const anchor = [...body.querySelectorAll(".rv-page img")]
    .map(img => [img, dist(img.getBoundingClientRect())]).sort((a, b) => a[1] - b[1])[0]?.[0];
  let fx = 0;
  let fy = 0;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    fx = (px - r.left) / (r.width || 1);
    fy = (py - r.top) / (r.height || 1);
  }
  rvZoom = z;
  body.style.setProperty("--rv-page-w", `${Math.round(rvFitWidth() * z)}px`);
  body.classList.toggle("zoomed", z > 1);
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    body.scrollLeft += r.left + fx * r.width - px;
    body.scrollTop += r.top + fy * r.height - py;
  }
  el("rvZoomFit").textContent = `${Math.round(z * 100)}%`;
  el("rvZoomOut").disabled = z <= RV_MIN + 1e-6;
  el("rvZoomIn").disabled = z >= RV_MAX - 1e-6;
}
const rvStep = dir => dir > 0
  ? RV_LEVELS.find(l => l > rvZoom + 1e-6) ?? RV_MAX
  : [...RV_LEVELS].reverse().find(l => l < rvZoom - 1e-6) ?? RV_MIN;
el("rvZoomIn").addEventListener("click", () => setRvZoom(rvStep(1)));
el("rvZoomOut").addEventListener("click", () => setRvZoom(rvStep(-1)));
el("rvZoomFit").addEventListener("click", () => setRvZoom(1));
const rvPoint = (body, clientX, clientY) => {
  const box = body.getBoundingClientRect();
  return [clientX - box.left, clientY - box.top];
};
el("rvBody").addEventListener("wheel", e => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setRvZoom(rvZoom * Math.exp(-e.deltaY * 0.0025), ...rvPoint(e.currentTarget, e.clientX, e.clientY));
}, { passive: false });
el("rvBody").addEventListener("dblclick", e => {
  if (!e.target.closest(".rv-page img")) return;
  setRvZoom(rvZoom > 1 ? 1 : 2, ...rvPoint(e.currentTarget, e.clientX, e.clientY));
});
let rvPinch = null;
const touchGap = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
el("rvBody").addEventListener("touchstart", e => {
  if (e.touches.length === 2) rvPinch = { gap: touchGap(e.touches), zoom: rvZoom };
}, { passive: true });
el("rvBody").addEventListener("touchmove", e => {
  if (!rvPinch || e.touches.length !== 2) return;
  e.preventDefault();
  const [a, b] = e.touches;
  setRvZoom(rvPinch.zoom * touchGap(e.touches) / rvPinch.gap,
    ...rvPoint(e.currentTarget, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2));
}, { passive: false });
el("rvBody").addEventListener("touchend", e => {
  if (e.touches.length < 2) rvPinch = null;
});
// On the document: a button greyed out at 50% or 300% drops the focus.
document.addEventListener("keydown", e => {
  if (!el("reportViewer").open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "+" || e.key === "=") setRvZoom(rvStep(1));
  else if (e.key === "-" || e.key === "_") setRvZoom(rvStep(-1));
  else if (e.key === "0") setRvZoom(1);
  else return;
  e.preventDefault();
});
window.addEventListener("resize", () => {
  if (el("reportViewer").open) setRvZoom(rvZoom);
});
el("rvTabs").addEventListener("click", e => {
  const b = e.target.closest("[data-rv]");
  if (!b) return;
  rvOpen = Number(b.dataset.rv);
  renderReportViewer();
});
el("rvCloseBtn").addEventListener("click", () => el("reportViewer").close());
el("reportViewer").addEventListener("click", e => {
  if (e.target === el("reportViewer")) el("reportViewer").close();
});

function renderReportPages() {
  el("previewReportsBtn").classList.toggle("hidden", !importedReports.length);
  el("previewReportsBtn").lastChild.textContent = importedReports.length === 1 ? "Preview the PDF" : "Preview the PDFs";
  if (!importedReports.length && el("reportViewer").open) el("reportViewer").close();
  el("reportPages").innerHTML = importedReports.flatMap((r, i) => r.urls.map((url, n) =>
    `<div class="report-page" data-report="${i}"><img src="${url}" alt="${escapeHtml(`${r.name} page ${n + 1}`)}"></div>`)).join("");
  updatePrintReports();
}

function clearImportedReports() {
  importedReports.forEach(r => r.urls.forEach(url => URL.revokeObjectURL(url)));
  importedReports = [];
  renderReportPages();
}

// Adds to the reports already imported for this work order (e.g. the Charge
// Reports dropped after the Close-out); a file imported twice is kept once.
async function addImportedReports(accepted, woNumber, isCurrent) {
  if (importedReports.some(r => r.woNumber !== woNumber)) clearImportedReports();
  for (const { file, type } of accepted) {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (importedReports.some(r => r.key === key)) continue;
    const blobs = await PdfImport.renderPages(file);
    if (!isCurrent()) return;
    importedReports.push({ key, type, name: file.name, woNumber, urls: blobs.map(b => URL.createObjectURL(b)) });
  }
  importedReports.sort((a, b) => REPORT_ORDER[a.type] - REPORT_ORDER[b.type]);
  renderReportPages();
}

el("printReports").addEventListener("change", updatePrintReports);
el("printTwoSided").addEventListener("change", () => {
  try { localStorage.setItem(TWO_SIDED_KEY, el("printTwoSided").checked ? "on" : "off"); } catch { /* still applies for this visit */ }
  updatePrintReports();
});

const IMPORT_FIELDS = ["fgItem", "woNumber", "bulkItem", "qtyCompleted", "bulkIssued", "bulkReturned"];

function renderImportLog(log) {
  el("importLog").innerHTML = log
    .map(m => `<li class="log-${m.level}">${escapeHtml(m.text)}</li>`)
    .join("");
}

// A small table of the imported reports, with the same-work-order check.
function renderImportPreview(preview) {
  const box = el("importPreview");
  // Once the reports are in, the import box folds to one line; the table and
  // the notes open with "Show what was imported" (warnings stay in view).
  const done = !!preview?.rows.length && preview.sameWo;
  el("importBox").classList.toggle("done", done);
  el("importBox").classList.remove("show-details");
  el("importDetailsBtn").setAttribute("aria-expanded", "false");
  el("importDetailsBtn").textContent = "Show what was imported";
  renderSteps();
  if (done) {
    const n = preview.rows.length;
    el("importDone").textContent = `✓ ${n} report${n === 1 ? "" : "s"} imported for WO ${preview.woNumber ?? "?"}. Drop more here, or`;
  }
  if (!preview || !preview.rows.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }
  const count = preview.rows.length;
  const check = preview.sameWo
    ? `<p class="wo-check wo-ok">✓ ${count === 1 ? "Report is" : `All ${count} reports are`} for WO ${escapeHtml(preview.woNumber ?? "?")}</p>`
    : `<p class="wo-check wo-bad">✗ Reports are for different work orders — nothing was filled in</p>`;
  const rows = preview.rows.map(r => `<tr>
      <td><strong>${escapeHtml(r.report)}</strong><br><span class="muted">${escapeHtml(r.file)}</span></td>
      <td class="${r.woOk ? "wo-ok" : "wo-bad"}">${escapeHtml(r.woNumber ?? "?")}</td>
      <td>${escapeHtml(r.fgItem ?? "?")}</td>
      <td>${r.details.map(([k, v]) => `${escapeHtml(k)}: <strong>${escapeHtml(v)}</strong>`).join("<br>")}</td>
    </tr>`).join("");
  box.innerHTML = `${check}<div class="table-scroll"><table>
      <thead><tr><th>Report</th><th>WO #</th><th>FG Item</th><th>Values</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  box.classList.remove("hidden");
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
    renderImportPreview(null);
    return;
  }
  let gen = ++importGen;
  renderImportLog([{ level: "info", text: `Reading ${files.length} PDF${files.length > 1 ? "s" : ""}…` }]);
  renderImportPreview(null);

  let result;
  try {
    result = await PdfImport.readReports(files);
  } catch (err) {
    if (gen !== importGen) return;
    renderImportLog([{ level: "error", text: `Import failed: ${err.message}` }]);
    renderImportPreview(null);
    return;
  }

  if (gen !== importGen) return;
  const { values, log, preview, accepted } = result;
  logActivity("Imported JDE reports", [`${files.length} PDF(s)`, values.woNumber && `WO ${values.woNumber}`].filter(Boolean).join(", "));
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
      el(id).closest("label").classList.add("from-import");
    });
    sheetDirty = true;
    recalc();
    fillFromStoredData();
    const fromStore = id => el(id).dataset.fromItem;
    if (fromStore("fillRate")) log.push({ level: "ok", text: `Count ${el("fillRate").value} from Stored Data (${fromStore("fillRate")}).` });
    if (fromStore("pieceWt")) log.push({ level: "ok", text: `Bulk Piece Wt ${el("pieceWt").value} mg from Stored Data (${fromStore("pieceWt")}).` });
    const todo = ["Retains", "Donations", "Stability",
      ...(Number(el("fillRate").value) ? [] : ["Count"]),
      ...(el("pieceWt").value === "" ? ["Bulk Piece Wt"] : [])];
    log.push({ level: "info", text: `Still to enter by hand: ${todo.join(", ")} and the scrap weights.` });
  }
  renderImportLog(log);
  renderImportPreview(preview);
  gen = importGen; // this import's own New Sheet (clearForm) doesn't count
  const isCurrent = () => gen === importGen;
  if (accepted.length && preview.woNumber) {
    try {
      await addImportedReports(accepted, preview.woNumber, isCurrent);
      if (!isCurrent()) return;
      const pages = reportsToPrint().reduce((n, r) => n + r.urls.length, 0);
      if (pages) log.push({ level: "info", text: `Print Yield Sheet also prints the imported reports (${pages} page${pages === 1 ? "" : "s"}).` });
    } catch (err) {
      if (!isCurrent()) return;
      log.push({ level: "warn", text: `Couldn't prepare the reports for printing (${err.message}).` });
    }
    renderImportLog(log);
  }
}

el("importDetailsBtn").addEventListener("click", e => {
  const open = el("importBox").classList.toggle("show-details");
  e.currentTarget.setAttribute("aria-expanded", String(open));
  e.currentTarget.textContent = open ? "Hide what was imported" : "Show what was imported";
});

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

// Each top tab shows one view; the Forms tab shows its menu (formsTab) or one
// of the forms listed there. Exactly one view is visible at a time, so a
// form's print listener only fires while that form is open.
const FORM_VIEWS = [...document.querySelectorAll("#formsTab [data-form]")]
  .map(card => ({
    id: card.dataset.form,
    name: card.querySelector(".form-card-name").textContent,
    code: card.querySelector(".form-card-code").textContent,
    icon: card.querySelector(".form-card-icon").innerHTML
  }));
const VIEWS = [...[...document.querySelectorAll(".tab")].map(t => t.dataset.tab), ...FORM_VIEWS.map(f => f.id)];

function showView(id) {
  // Once the account type is known, only views it may open (see canOpen).
  if ((role || localOnly) && !canOpen(id)) return;
  const tabId = FORM_VIEWS.some(f => f.id === id) ? "formsTab" : id;
  document.querySelectorAll(".tab").forEach(t => {
    const active = t.dataset.tab === tabId;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  });
  VIEWS.forEach(v => el(v).classList.toggle("hidden", v !== id));
  if (FORM_VIEWS.some(f => f.id === id)) rememberRecentForm(id);
  renderOpenForm(id);
  renderCrumbs(id);
  if (id === "sheetTab") fillFromStoredData();
  if (id === "adminTab") lineupNetwork();
  window.dispatchEvent(new CustomEvent("viewshown", { detail: id }));
}

// The top bar says where you are: the section, and the form inside Forms.
function renderCrumbs(id) {
  const form = FORM_VIEWS.find(f => f.id === id);
  const section = document.querySelector(`.tab[data-tab="${form ? "formsTab" : id}"] .lbl`)?.textContent ?? "";
  el("crumbs").innerHTML = form
    ? `<button type="button" data-crumb="formsTab">${escapeHtml(section)}</button><span class="crumb-sep">/</span><span class="crumb-here">${escapeHtml(form.name)}</span>`
    : `<span class="crumb-here">${escapeHtml(section)}</span>`;
}
el("crumbs").addEventListener("click", e => {
  const b = e.target.closest("[data-crumb]");
  if (b) showView(b.dataset.crumb);
});
renderCrumbs("sheetTab");

// Runs fn each time the view with this id is shown.
function onViewShown(id, fn) {
  window.addEventListener("viewshown", e => { if (e.detail === id) fn(); });
}

// The forms opened last on this computer, newest first, shown as chips above
// the Forms list.
const RECENT_FORMS_KEY = "pk030_recent_forms";
function recentForms() {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_FORMS_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter(id => FORM_VIEWS.some(f => f.id === id)) : [];
  } catch {
    return [];
  }
}
function rememberRecentForm(id) {
  const ids = [id, ...recentForms().filter(r => r !== id)].slice(0, 4);
  try { localStorage.setItem(RECENT_FORMS_KEY, JSON.stringify(ids)); } catch { /* chips just won't update */ }
  renderRecentForms();
}
function renderRecentForms() {
  const forms = recentForms().filter(id => !(role || localOnly) || canOpen(id)).map(id => FORM_VIEWS.find(f => f.id === id));
  el("formsRecent").classList.toggle("hidden", !forms.length);
  el("formsRecent").innerHTML = forms.length ? `<span class="forms-recent-label">Recent</span>${forms.map(f =>
    `<button type="button" class="recent-chip" data-recent="${f.id}"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${f.icon}</svg>${escapeHtml(f.name)}</button>`).join("")}` : "";
}
el("formsRecent").addEventListener("click", e => {
  const b = e.target.closest("[data-recent]");
  if (b) showView(b.dataset.recent);
});

// Under Forms in the sidebar: the form opened last, to get back to it from
// anywhere.
let lastForm = null;
function renderOpenForm(id) {
  if (FORM_VIEWS.some(f => f.id === id)) lastForm = id;
  if (lastForm && (role || localOnly) && !canOpen(lastForm)) lastForm = null;
  const form = FORM_VIEWS.find(f => f.id === lastForm);
  el("sideOpenForm").classList.toggle("hidden", !form);
  el("sideOpenForm").classList.toggle("active", !!form && id === form.id);
  if (form) {
    el("sideOpenForm").textContent = form.name;
    el("sideOpenForm").title = `Back to ${form.name}`;
  }
}
el("sideOpenForm").addEventListener("click", () => {
  if (lastForm) showView(lastForm);
});

// Each form's top line: name, form code, an ⓘ that shows the instructions,
// and the form's buttons. It stays in view while the form scrolls.
FORM_VIEWS.forEach(({ id, code }) => {
  const panel = el(id).querySelector(".panel");
  el(id).classList.add("form-view");
  let head = panel.querySelector(".panel-head");
  const h2 = panel.querySelector("h2");
  if (!head) {
    head = document.createElement("div");
    head.className = "panel-head";
    h2.before(head);
    head.append(h2);
  }
  head.classList.add("form-toolbar");
  const title = document.createElement("div");
  title.className = "form-title";
  h2.before(title);
  title.append(h2);
  title.insertAdjacentHTML("beforeend", `<span class="form-code">${escapeHtml(code)}</span>`);
  const help = head.nextElementSibling;
  if (help?.matches("p.muted")) {
    help.classList.add("form-help", "hidden");
    help.id = `${id}Help`;
    title.insertAdjacentHTML("beforeend", `<button type="button" class="help-btn" aria-expanded="false" aria-controls="${id}Help" title="How to fill it in">i</button>`);
    title.querySelector(".help-btn").addEventListener("click", e => {
      const open = help.classList.toggle("hidden") === false;
      e.currentTarget.setAttribute("aria-expanded", String(open));
      e.currentTarget.classList.toggle("active", open);
    });
  }
});

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => showView(tab.dataset.tab)));
document.querySelectorAll("#formsTab [data-form]").forEach(card =>
  card.addEventListener("click", () => {
    showView(card.dataset.form);
    window.scrollTo(0, 0);
  }));

function showMsg(id, text, ok = true) {
  el(id).textContent = text;
  el(id).className = `form-msg ${ok ? "hint-ok" : "hint-err"}`;
}

// Search (the top bar's box, or Ctrl+K): jumps to a section or form, a stored
// FG or bulk item (Stored Data, filtered to it) or a saved yield sheet (the
// saved list, filtered to its WO). Only what this account can open is listed.
function searchEntries() {
  const entries = [];
  document.querySelectorAll(".tab").forEach(t => {
    if (!canOpen(t.dataset.tab)) return;
    entries.push({ kind: "Section", label: t.querySelector(".lbl").textContent, words: "", go: () => showView(t.dataset.tab) });
  });
  FORM_VIEWS.forEach(f => {
    if (!canOpen(f.id)) return;
    const desc = document.querySelector(`[data-form="${f.id}"] .form-card-desc`)?.textContent ?? "";
    entries.push({ kind: "Form", label: f.name, sub: f.code, words: `${f.code} ${desc}`, icon: f.icon, go: () => showView(f.id) });
  });
  if (canOpen("storedTab")) {
    const toList = (panel, search, value) => () => {
      showView("storedTab");
      showStoredList(panel);
      el(search).value = value;
      el(search).dispatchEvent(new Event("input"));
    };
    StoredData.fgItems.all().forEach(i => entries.push({ kind: "FG item", label: i.item, sub: `Count ${i.count}`, words: "fg", go: toList("fgPanel", "fgItemSearch", i.item) }));
    StoredData.bulkItems.all().forEach(i => entries.push({ kind: "Bulk item", label: i.item, sub: `${i.pieceWt} mg`, words: "bulk", go: toList("bulkPanel", "bulkItemSearch", i.item) }));
  }
  if (canOpen("sheetTab")) {
    loadRecords().forEach(r => {
      if (!r.woNumber) return;
      entries.push({
        kind: "Saved sheet", label: `WO ${r.woNumber}`, sub: [r.fgItem && `FG ${r.fgItem}`, r.bulkItem].filter(Boolean).join(" · "),
        words: `${r.fgItem ?? ""} ${r.bulkItem ?? ""}`,
        go: () => {
          showView("sheetTab");
          el("searchBox").value = r.woNumber;
          savedFilter = "all";
          openSaved();
        }
      });
    });
  }
  return entries;
}

let searchHits = [];
let searchPick = 0;
function renderSearch() {
  const q = el("searchInput").value.trim().toLowerCase();
  const all = searchEntries();
  if (!q) {
    searchHits = all.filter(e => e.kind === "Section" || e.kind === "Form");
  } else {
    const terms = q.split(/\s+/);
    const score = e => {
      const label = e.label.toLowerCase();
      const hay = `${label} ${(e.sub ?? "").toLowerCase()} ${e.words.toLowerCase()} ${e.kind.toLowerCase()}`;
      if (!terms.every(t => hay.includes(t))) return -1;
      return (label === q ? 0 : label.startsWith(q) ? 1 : label.includes(q) ? 2 : 3);
    };
    searchHits = all.map(e => [score(e), e]).filter(([sc]) => sc >= 0).sort((a, b) => a[0] - b[0]).map(([, e]) => e).slice(0, 30);
  }
  searchPick = Math.min(searchPick, Math.max(searchHits.length - 1, 0));
  el("searchResults").innerHTML = searchHits.length ? searchHits.map((e, i) => `
    <li role="option" id="searchHit${i}" class="search-hit${i === searchPick ? " active" : ""}" data-hit="${i}" aria-selected="${i === searchPick}">
      <span class="search-kind">${escapeHtml(e.kind)}</span>
      <span class="search-label">${escapeHtml(e.label)}</span>
      ${e.sub ? `<span class="search-sub">${escapeHtml(e.sub)}</span>` : ""}
    </li>`).join("") : `<li class="search-none">Nothing found for "${escapeHtml(el("searchInput").value.trim())}".</li>`;
  el("searchInput").setAttribute("aria-activedescendant", searchHits.length ? `searchHit${searchPick}` : "");
  el(`searchHit${searchPick}`)?.scrollIntoView({ block: "nearest" });
}
function openSearch() {
  if (!(role || localOnly) || el("searchDialog").open) return;
  el("searchInput").value = "";
  searchPick = 0;
  renderSearch();
  el("searchDialog").showModal();
  el("searchInput").focus();
}
function pickSearch(i) {
  const hit = searchHits[i];
  if (!hit) return;
  el("searchDialog").close();
  hit.go();
}
el("searchBtn").addEventListener("click", openSearch);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
});
el("searchInput").addEventListener("input", () => {
  searchPick = 0;
  renderSearch();
});
el("searchInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!searchHits.length) return;
    searchPick = (searchPick + (e.key === "ArrowDown" ? 1 : -1) + searchHits.length) % searchHits.length;
    renderSearch();
  } else if (e.key === "Enter") {
    e.preventDefault();
    pickSearch(searchPick);
  } else if (e.key === "Escape") {
    e.preventDefault();
    el("searchDialog").close();
  }
});
el("searchResults").addEventListener("click", e => {
  const hit = e.target.closest("[data-hit]");
  if (hit) pickSearch(Number(hit.dataset.hit));
});
// A click on the dimmed page around the box closes it.
el("searchDialog").addEventListener("click", e => {
  if (e.target === el("searchDialog")) el("searchDialog").close();
});

// Stored Data shows one list at a time, picked from the tabs (remembered on
// this computer). Each list has one line on top: its name, an ⓘ for the
// explanation, the search and "+ Add", which opens the add form.
const STORED_TAB_KEY = "pk030_stored_tab";
const STORED_COUNTS = {
  bulkItems: () => StoredData.bulkItems.all().length,
  fgItems: () => StoredData.fgItems.all().length,
  lineRates: () => StoredData.lineRates.all().length,
  cotton: () => StoredData.cotton.all().length,
  desiccant: () => StoredData.desiccant.all().length,
  allergen: () => StoredData.allergen.all().length
};
function renderStoredCounts() {
  document.querySelectorAll(".stored-count[data-count]").forEach(c => { c.textContent = STORED_COUNTS[c.dataset.count](); });
}
function showStoredList(id) {
  if (!el(id)?.classList.contains("stored-panel")) return;
  document.querySelectorAll(".stored-tab").forEach(t => {
    const on = t.dataset.stored === id;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll(".stored-panel").forEach(p => p.classList.toggle("hidden", p.id !== id));
  try { localStorage.setItem(STORED_TAB_KEY, id); } catch { /* starts on the first list next time */ }
}
document.querySelectorAll(".stored-tab").forEach(t => t.addEventListener("click", () => showStoredList(t.dataset.stored)));
try { showStoredList(localStorage.getItem(STORED_TAB_KEY)); } catch { /* the first list */ }

function setAdding(panel, on) {
  panel.classList.toggle("adding", on);
  const btn = panel.querySelector(".add-toggle");
  btn.textContent = on ? "Close" : "+ Add";
  btn.classList.toggle("primary", !on);
  btn.setAttribute("aria-expanded", String(on));
}
document.querySelectorAll(".stored-panel").forEach(panel => {
  const h2 = panel.querySelector("h2");
  const help = h2.nextElementSibling;
  const search = panel.querySelector(".stored-search");
  const form = panel.querySelector("form");
  form.classList.add("stored-add");
  const head = document.createElement("div");
  head.className = "stored-panel-head";
  head.innerHTML = `<div class="form-title"></div><div class="stored-tools"></div>`;
  panel.prepend(head);
  head.firstChild.append(h2);
  help.classList.add("form-help", "hidden");
  help.id = `${panel.id}Help`;
  head.firstChild.insertAdjacentHTML("beforeend",
    `<button type="button" class="help-btn" aria-expanded="false" aria-controls="${help.id}" title="What this list is for">i</button>`);
  head.querySelector(".help-btn").addEventListener("click", e => {
    const open = help.classList.toggle("hidden") === false;
    e.currentTarget.setAttribute("aria-expanded", String(open));
    e.currentTarget.classList.toggle("active", open);
  });
  head.after(help);
  head.lastChild.append(search);
  head.lastChild.insertAdjacentHTML("beforeend", `<button type="button" class="add-toggle primary" aria-controls="${form.id}">+ Add</button>`);
  head.querySelector(".add-toggle").addEventListener("click", () => {
    setAdding(panel, !panel.classList.contains("adding"));
    if (panel.classList.contains("adding")) form.querySelector("input")?.focus();
  });
  // Edit fills the add form, so it opens it.
  panel.addEventListener("click", e => {
    if (e.target.closest("[data-edit], [data-action=edit]")) setAdding(panel, true);
  }, true);
});

// Accounts & Leads shows one part at a time: Accounts (with the account
// types), Leads, or LineUp network (Owners only; its tab shows with its panel).
const ADMIN_TAB_KEY = "pk030_admin_tab";
function showAdminPart(part) {
  if (!document.querySelector(`[data-admin-tab="${part}"]`)) return;
  document.querySelectorAll("[data-admin-tab]").forEach(t => {
    const on = t.dataset.adminTab === part;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  document.querySelectorAll("[data-admin-panel]").forEach(p => p.classList.toggle("tab-off", p.dataset.adminPanel !== part));
  try { localStorage.setItem(ADMIN_TAB_KEY, part); } catch { /* starts on Accounts next time */ }
}
document.querySelectorAll("[data-admin-tab]").forEach(t => t.addEventListener("click", () => showAdminPart(t.dataset.adminTab)));
try { showAdminPart(localStorage.getItem(ADMIN_TAB_KEY)); } catch { /* Accounts */ }
// The LineUp network tab only for those who see its panel (Owners).
new MutationObserver(() => {
  const owner = !el("lineupNetworkPanel").classList.contains("hidden");
  document.querySelector('[data-admin-tab="network"]').classList.toggle("hidden", !owner);
  if (!owner && !el("lineupNetworkPanel").classList.contains("tab-off")) showAdminPart("accounts");
}).observe(el("lineupNetworkPanel"), { attributes: true, attributeFilter: ["class"] });
document.querySelector('[data-admin-tab="network"]').classList.add("hidden");
if (!el("lineupNetworkPanel").classList.contains("tab-off")) showAdminPart("accounts");

function renderStoredData() {
  const leads = StoredData.leads();
  // A live update mustn't wipe a username someone is typing.
  const typing = document.activeElement?.matches?.("#leadList input.lead-user") ? document.activeElement : null;
  const draft = typing && { lead: typing.dataset.lead, value: typing.value, start: typing.selectionStart, end: typing.selectionEnd };
  redrawingLeads = true;
  el("leadList").innerHTML = leads.map(name => `
    <li><span class="lead-name">${escapeHtml(name)}</span>
      <input type="text" class="lead-user" data-lead="${escapeHtml(name)}" value="${escapeHtml(StoredData.usernameForLead(name))}"
        placeholder="Username" aria-label="Sign-in username for ${escapeHtml(name)}" autocapitalize="none" spellcheck="false">
      <button type="button" data-remove-lead="${escapeHtml(name)}">Remove</button></li>`).join("");
  redrawingLeads = false;
  el("noLeadsMsg").classList.toggle("hidden", leads.length > 0);
  const again = draft && [...el("leadList").querySelectorAll("input.lead-user")].find(i => i.dataset.lead === draft.lead);
  if (again) {
    again.value = draft.value;
    again.focus();
    again.setSelectionRange(draft.start, draft.end);
  }

  ITEM_PANELS.forEach(renderItemPanel);
  renderLineRates();
  FLAG_PANELS.forEach(renderFlagPanel);
  renderStoredCounts();

  populateLeads();
  // The Bulk Calculator's item suggestions (bulk-calc.js loads after this file).
  if (typeof BulkCalc !== "undefined") BulkCalc.refreshItemList();
  showSignedInName();
  applyDefaultCreatedBy();
  renderAccounts();
}

el("leadForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = el("leadName").value.trim();
  if (StoredData.addLead(name)) {
    logActivity("Added a lead", name);
    showMsg("leadMsg", `Added ${name}.`);
    el("leadName").value = "";
    renderStoredData();
  } else {
    showMsg("leadMsg", `${name} is already in the list.`, false);
  }
  el("leadName").focus();
});

// Linking a sign-in username to a lead; saved when the box loses focus or on
// Enter. (Not "change": a box redrawn while someone types in it, see
// renderStoredData, gets its text back from code, which "change" ignores.)
el("leadList").addEventListener("focusout", e => {
  const input = e.target.closest("input.lead-user");
  // A box taken away by a redraw isn't being left by the person typing.
  if (!input || redrawingLeads) return;
  const name = input.dataset.lead;
  const username = StoredData.normUser(input.value);
  if (username && !StoredData.validUsername(username)) {
    showMsg("leadMsg", `"${input.value.trim()}" isn't a username: use letters, numbers, dots, dashes or underscores (no @pk030.local).`, false);
    input.value = StoredData.usernameForLead(name);
    return;
  }
  const before = StoredData.usernameForLead(name);
  if (username === before) return;
  const movedFrom = StoredData.setLeadUsername(name, username);
  logActivity(username ? "Linked a username" : "Unlinked a username", username ? `${username} → ${name}` : `${before} from ${name}`);
  if (!username) showMsg("leadMsg", `${name} is no longer linked to ${before}.`);
  else showMsg("leadMsg", `${username} now signs in as ${name}.${movedFrom ? ` (Unlinked from ${movedFrom}.)` : ""}`);
  renderStoredData();
});
el("leadList").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches("input.lead-user")) e.target.blur();
});

el("leadList").addEventListener("click", e => {
  const name = e.target.closest("button")?.dataset.removeLead;
  if (name && confirm(`Remove ${name} from the leads list?`)) {
    StoredData.removeLead(name);
    logActivity("Removed a lead", name);
    showMsg("leadMsg", `Removed ${name}.`);
    renderStoredData();
  }
});

// The two item lists on the Stored Data tab share the same form/table layout,
// with element ids prefixed by `prefix`.
const ITEM_PANELS = [
  { prefix: "bulkItem", store: StoredData.bulkItems, field: "pieceWt", what: "piece weight", unit: " mg", none: "noBulkItemsMsg", label: "bulk items", one: "a bulk item" },
  { prefix: "fgItem", store: StoredData.fgItems, field: "count", what: "count", unit: "", none: "noFgItemsMsg", label: "FG items", one: "an FG item" }
];

function renderItemPanel(panel) {
  const all = panel.store.all();
  const query = el(`${panel.prefix}Search`).value.trim().toUpperCase();
  const items = query ? all.filter(i => i.item.toUpperCase().includes(query)) : all;
  // Leads only add items; changing or removing a stored one is for admins.
  const change = canChangeStoredItems();
  el(`${panel.prefix}TableBody`).innerHTML = items.map(i => `
    <tr><td>${escapeHtml(i.item)}</td><td>${escapeHtml(String(i[panel.field]))}</td>
      <td class="row-actions">${change ? `
        <button type="button" data-edit="${escapeHtml(i.item)}">Edit</button>
        <button type="button" data-remove="${escapeHtml(i.item)}">Remove</button>` : ""}
      </td></tr>`).join("");
  el(`${panel.prefix}AddOnlyNote`).classList.toggle("hidden", change);
  el(panel.none).textContent = all.length
    ? `No ${panel.label} match "${el(`${panel.prefix}Search`).value.trim()}".`
    : `No ${panel.label} yet.`;
  el(panel.none).classList.toggle("hidden", items.length > 0);
  el(`${panel.prefix}Search`).classList.toggle("hidden", all.length === 0);
}

ITEM_PANELS.forEach(panel => {
  const id = suffix => `${panel.prefix}${suffix}`;
  el(id("Search")).addEventListener("input", () => renderItemPanel(panel));
  el(id("Form")).addEventListener("submit", e => {
    e.preventDefault();
    const item = el(id("Number")).value.trim().toUpperCase();
    const value = el(id("Value")).value;
    if (!(Number(value) > 0)) {
      showMsg(id("Msg"), `The ${panel.what} must be more than 0.`, false);
      return;
    }
    const stored = panel.store.find(item);
    if (stored && !canChangeStoredItems()) {
      showMsg(id("Msg"), `${item} is already stored (${stored[panel.field]}${panel.unit}). Only an admin can change it.`, false);
      return;
    }
    const existed = stored !== null;
    panel.store.save(item, value);
    logActivity(`${existed ? "Changed" : "Added"} ${panel.one}`,
      `${item}: ${value}${panel.unit}${existed ? ` (was ${stored[panel.field]}${panel.unit})` : ""}`);
    showMsg(id("Msg"), `${existed ? "Updated" : "Added"} ${item}: ${value}${panel.unit}.`);
    el(id("Number")).value = "";
    el(id("Value")).value = "";
    renderStoredData();
    el(id("Number")).focus();
  });

  el(id("TableBody")).addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn || !canChangeStoredItems()) return;
    if (btn.dataset.edit) {
      const hit = panel.store.find(btn.dataset.edit);
      el(id("Number")).value = hit.item;
      el(id("Value")).value = hit[panel.field];
      el(id("Value")).focus();
      showMsg(id("Msg"), `Editing ${hit.item} — change the ${panel.what} and click Save Item.`);
    } else if (btn.dataset.remove && confirm(`Remove ${btn.dataset.remove}?`)) {
      const removed = panel.store.find(btn.dataset.remove);
      panel.store.remove(btn.dataset.remove);
      logActivity(`Removed ${panel.one}`, removed ? `${removed.item}: ${removed[panel.field]}${panel.unit}` : btn.dataset.remove);
      showMsg(id("Msg"), `Removed ${btn.dataset.remove}.`);
      renderStoredData();
    }
  });
});

// Line Rates: Full Hour, Lunch and Break for each line and FG item. As with
// the item lists, Leads only add; changing or removing is for admins.
const RATE_INPUTS = { line: "lineRateLine", fgItem: "lineRateFg", fullHour: "lineRateFull", lunch: "lineRateLunch", break: "lineRateBreak" };
const RATE_FIGURES = ["fullHour", "lunch", "break"];
// Lunch and Break are optional (null): a line that runs through them.
const fmtRate = n => (n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 3 }));
const rateName = r => `Line ${r.line}, FG ${r.fgItem}`;
const rateFigures = r => `full hour ${fmtRate(r.fullHour)}, lunch ${fmtRate(r.lunch)}, break ${fmtRate(r.break)}`;

function renderLineRates() {
  const all = StoredData.lineRates.all();
  const query = el("lineRateSearch").value.trim().toUpperCase();
  const rates = query ? all.filter(r => `LINE ${r.line} ${r.fgItem}`.includes(query)) : all;
  const change = canChangeStoredItems();
  const ids = r => `data-line="${escapeHtml(r.line)}" data-fg="${escapeHtml(r.fgItem)}"`;
  el("lineRateTableBody").innerHTML = rates.map(r => `
    <tr><td>${escapeHtml(r.line)}</td><td>${escapeHtml(r.fgItem)}</td>
      <td>${fmtRate(r.fullHour)}</td><td>${fmtRate(r.lunch)}</td><td>${fmtRate(r.break)}</td>
      <td class="row-actions">${change ? `
        <button type="button" data-action="edit" ${ids(r)}>Edit</button>
        <button type="button" data-action="remove" ${ids(r)}>Remove</button>` : ""}
      </td></tr>`).join("");
  el("lineRateAddOnlyNote").classList.toggle("hidden", change);
  el("noLineRatesMsg").textContent = all.length
    ? `No line rates match "${el("lineRateSearch").value.trim()}".`
    : "No line rates yet.";
  el("noLineRatesMsg").classList.toggle("hidden", rates.length > 0);
  el("lineRateSearch").classList.toggle("hidden", all.length === 0);
  // Suggestions: lines already in use, and the stored FG items.
  el("lineRateLineList").innerHTML = [...new Set(all.map(r => r.line))]
    .map(line => `<option value="${escapeHtml(line)}">`).join("");
  el("lineRateFgList").innerHTML = StoredData.fgItems.all()
    .map(i => `<option value="${escapeHtml(i.item)}">`).join("");
}

el("lineRateSearch").addEventListener("input", renderLineRates);
el("lineRateForm").addEventListener("submit", e => {
  e.preventDefault();
  const rate = Object.fromEntries(Object.entries(RATE_INPUTS).map(([field, id]) => [field, el(id).value.trim()]));
  if (`${rate.line}${rate.fgItem}`.includes("|")) {
    showMsg("lineRateMsg", "Line and FG Item can't contain \"|\".", false);
    return;
  }
  if (rate.fullHour === "" || !(Number(rate.fullHour) >= 0)
    || [rate.lunch, rate.break].some(v => v !== "" && !(Number(v) >= 0))) {
    showMsg("lineRateMsg", "Full Hour must be a number (0 or more); Lunch and Break too, or left empty.", false);
    return;
  }
  const stored = StoredData.lineRates.find(rate.line, rate.fgItem);
  if (stored && !canChangeStoredItems()) {
    showMsg("lineRateMsg", `${rateName(stored)} is already stored (${rateFigures(stored)}). Only an admin can change it.`, false);
    return;
  }
  StoredData.lineRates.save(rate);
  const saved = StoredData.lineRates.find(rate.line, rate.fgItem);
  logActivity(`${stored ? "Changed" : "Added"} a line rate`,
    `${rateName(saved)}: ${rateFigures(saved)}${stored ? ` (was ${rateFigures(stored)})` : ""}`);
  showMsg("lineRateMsg", `${stored ? "Updated" : "Added"} ${rateName(saved)}: ${rateFigures(saved)}.`);
  // The line stays filled in (as saved), for entering several FG items on one line.
  el("lineRateLine").value = saved.line;
  ["fgItem", ...RATE_FIGURES].forEach(f => { el(RATE_INPUTS[f]).value = ""; });
  renderStoredData();
  el("lineRateFg").focus();
});

el("lineRateTableBody").addEventListener("click", e => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || !canChangeStoredItems()) return;
  const hit = StoredData.lineRates.find(btn.dataset.line, btn.dataset.fg);
  if (!hit) return;
  if (btn.dataset.action === "edit") {
    Object.entries(RATE_INPUTS).forEach(([field, id]) => { el(id).value = String(hit[field] ?? ""); });
    el("lineRateFull").focus();
    showMsg("lineRateMsg", `Editing ${rateName(hit)} — change the figures and click Save Line Rate.`);
  } else if (confirm(`Remove ${rateName(hit)}?`)) {
    StoredData.lineRates.remove(hit.line, hit.fgItem);
    logActivity("Removed a line rate", `${rateName(hit)}: ${rateFigures(hit)}`);
    showMsg("lineRateMsg", `Removed ${rateName(hit)}.`);
    renderStoredData();
  }
});

// Cotton, Desiccant and Allergen: the FG items that take cotton or desiccant
// ("Yes", or which) or have an allergen (its code), for LineUp's printouts,
// changeover notes and QA sheets. Only admins add, change or remove them;
// Leads see the lists (the database rules let Leads add only bulk and FG
// items). Each panel's elements are named after its `id`: cottonForm,
// cottonFg, cottonType, cottonSearch and so on. `blank` is what an empty
// value saves (none: the value must be typed); `upper` saves it in capitals.
const NO_FLAG = ["N", "NO", "0", "-", "FALSE", "NONE"];
const FLAG_PANELS = [
  { id: "cotton", word: "cotton", Word: "Cotton", store: () => StoredData.cotton, blank: "Yes" },
  { id: "desiccant", word: "desiccant", Word: "Desiccant", store: () => StoredData.desiccant, blank: "Yes" },
  { id: "allergen", word: "allergen", Word: "Allergen", store: () => StoredData.allergen, blank: "", upper: true }
];
const flagEl = (p, part) => el(`${p.id}${part}`);

function renderFlagPanel(p) {
  const all = p.store().all();
  const query = flagEl(p, "Search").value.trim().toUpperCase();
  const list = query ? all.filter(i => `${i.item} ${i[p.id].toUpperCase()}`.includes(query)) : all;
  const change = canChangeStoredItems();
  flagEl(p, "Form").classList.toggle("hidden", !change);
  flagEl(p, "Msg").classList.toggle("hidden", !change);
  flagEl(p, "ViewOnlyNote").classList.toggle("hidden", change);
  flagEl(p, "TableBody").innerHTML = list.map(i => `
    <tr><td>${escapeHtml(i.item)}</td><td>${escapeHtml(i[p.id])}</td>
      <td class="row-actions">${change ? `
        <button type="button" data-action="edit" data-item="${escapeHtml(i.item)}">Edit</button>
        <button type="button" data-action="remove" data-item="${escapeHtml(i.item)}">Remove</button>` : ""}
      </td></tr>`).join("");
  flagEl(p, "None").textContent = all.length
    ? `No ${p.word} matches "${flagEl(p, "Search").value.trim()}".`
    : `No ${p.id === "allergen" ? "allergens" : p.word} yet.`;
  flagEl(p, "None").classList.toggle("hidden", list.length > 0);
  flagEl(p, "Search").classList.toggle("hidden", all.length === 0);
  flagEl(p, "Count").textContent = all.length ? `${all.length} FG item${all.length === 1 ? "" : "s"}` : "";
  // Suggestions: the stored FG items.
  flagEl(p, "FgList").innerHTML = StoredData.fgItems.all()
    .map(i => `<option value="${escapeHtml(i.item)}">`).join("");
}

FLAG_PANELS.forEach(p => {
  flagEl(p, "Search").addEventListener("input", () => renderFlagPanel(p));
  flagEl(p, "Form").addEventListener("submit", e => {
    e.preventDefault();
    if (!canChangeStoredItems()) return;
    const items = [...new Set(flagEl(p, "Fg").value.split(/[\s,;]+/).map(s => s.trim().toUpperCase()).filter(Boolean))];
    const typed = flagEl(p, "Type").value.trim().replace(/\s+/g, " ");
    const value = (p.upper ? typed.toUpperCase() : typed) || p.blank;
    if (!items.length) {
      showMsg(`${p.id}Msg`, "Type an FG item.", false);
      return;
    }
    if (!value) {
      showMsg(`${p.id}Msg`, `Type the ${p.word}.`, false);
      return;
    }
    if (NO_FLAG.includes(value.toUpperCase())) {
      showMsg(`${p.id}Msg`, `To take an FG item off the ${p.word} list, click Remove next to it.`, false);
      return;
    }
    const saved = items.map(item => ({ item, was: p.store().find(item) }));
    saved.forEach(({ item, was }) => {
      p.store().save(item, value);
      logActivity(`${was ? "Changed" : "Added"} ${p.word}`, `${item}: ${value}${was ? ` (was ${was[p.id]})` : ""}`);
    });
    showMsg(`${p.id}Msg`, saved.length === 1
      ? `${saved[0].was ? "Updated" : "Added"} ${saved[0].item}: ${value}.`
      : `Saved ${saved.length} FG items: ${value}.`);
    flagEl(p, "Fg").value = "";
    flagEl(p, "Type").value = "";
    renderStoredData();
    flagEl(p, "Fg").focus();
  });
  flagEl(p, "TableBody").addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || !canChangeStoredItems()) return;
    const hit = p.store().find(btn.dataset.item);
    if (!hit) return;
    if (btn.dataset.action === "edit") {
      flagEl(p, "Fg").value = hit.item;
      flagEl(p, "Type").value = p.blank && hit[p.id] === p.blank ? "" : hit[p.id];
      flagEl(p, "Type").focus();
      showMsg(`${p.id}Msg`, `Editing ${hit.item} — change the ${p.word} and click Save ${p.Word}.`);
    } else if (confirm(`Take ${hit.item} off the ${p.word} list?`)) {
      p.store().remove(hit.item);
      logActivity(`Removed ${p.word}`, `${hit.item}: ${hit[p.id]}`);
      showMsg(`${p.id}Msg`, `Removed ${hit.item}.`);
      renderStoredData();
    }
  });
});

el("exportStoredBtn").addEventListener("click", () => {
  logActivity("Exported Stored Data");
  const blob = new Blob([StoredData.exportJson()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pk030-stored-data.json";
  a.click();
  URL.revokeObjectURL(url);
});

el("importStoredInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    // Only admins may change leads and stored items, so for everyone else
    // leads are left out and items already stored keep their values.
    const n = StoredData.importJson(await file.text(), { withLeads: canManageLeads(), addOnly: !canChangeStoredItems() });
    const counts = `${n.items} bulk item(s), ${n.fgItems} FG item(s), ${n.lineRates} line rate(s)`
      + (n.cotton !== null ? `, ${n.cotton} cotton, ${n.desiccant} desiccant and ${n.allergen} allergen item(s)` : "");
    logActivity("Imported Stored Data", `${file.name}: ${n.leads !== null ? `${n.leads} lead(s), ` : ""}${counts}`);
    const kept = n.kept ? ` ${n.kept} already stored ${n.kept === 1 ? "entry" : "entries"} kept their values (only an admin can change them).` : "";
    showMsg("storedImportMsg", n.leads === null
      ? `Imported ${counts} from ${file.name} (leads are left to admins).${kept}`
      : `Imported ${n.leads} lead(s), ${counts} from ${file.name}.${kept}`);
    renderStoredData();
  } catch (err) {
    showMsg("storedImportMsg", `${file.name}: ${err.message}.`, false);
  }
});

renderStoredData();
const startDraft = readDraft();
clearForm();
restoreDraft(startDraft);
renderRecordsTable();

function showSyncStatus({ state, text }) {
  el("syncStatus").className = `sync-status sync-${state}`;
  el("syncStatus").textContent = text;
}

el("signInForm").addEventListener("submit", async e => {
  e.preventDefault();
  el("signInBtn").disabled = true;
  el("signInMsg").textContent = "";
  try {
    await CloudSync.signIn(el("signInUser").value, el("signInPassword").value);
    el("signInPassword").value = "";
  } catch (err) {
    el("signInMsg").textContent = err.message;
    el("signInPassword").select();
  } finally {
    el("signInBtn").disabled = false;
  }
});

function showSignUp(on) {
  el("signInForm").classList.toggle("hidden", on);
  el("signUpForm").classList.toggle("hidden", !on);
  el(on ? "signUpName" : "signInUser").focus();
}
el("showSignUpBtn").addEventListener("click", () => showSignUp(true));
el("showSignInBtn").addEventListener("click", () => showSignUp(false));

// Anyone can create an account; it starts as a PLT.
el("signUpForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = el("signUpName").value.trim().replace(/\s+/g, " ");
  const username = StoredData.normUser(el("signUpUser").value);
  const password = el("signUpPassword").value;
  const problem = !name ? "Enter your full name."
    : !StoredData.validUsername(username) || username.length < 3 || username.length > 30
      ? "Pick a username of 3–30 letters, numbers, dots, dashes or underscores."
    : password.length < 6 ? "The password needs at least 6 characters."
    : password !== el("signUpConfirm").value ? "The passwords don't match." : "";
  if (problem) {
    el("signUpMsg").textContent = problem;
    return;
  }
  el("signUpBtn").disabled = true;
  el("signUpMsg").textContent = "";
  try {
    await CloudSync.signUp(name, username, password);
    el("signUpForm").reset();
    showSignUp(false);
  } catch (err) {
    el("signUpMsg").textContent = err.message;
  } finally {
    el("signUpBtn").disabled = false;
  }
});

el("signOutBtn").addEventListener("click", async () => {
  if (CloudSync.hasUnsyncedChanges() && !confirm(
    "Some changes haven't reached the database yet, and signing out removes them from this computer. Sign out anyway?")) return;
  await CloudSync.signOut(() => {
    saveRecords([]);
    clearDraft();
    StoredData.replaceAll({ leads: [], bulkItems: [], fgItems: [] });
    location.reload();
  });
});

// Light/dark theme. The choice is kept on this computer; until someone picks
// one, the app follows the computer's setting (index.html applies it early).
const THEME_KEY = "pk030_theme";
const systemDark = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

function savedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  const btn = el("themeToggle");
  btn.innerHTML = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${dark
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
    : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'}</svg><span class="lbl">${dark ? "Light theme" : "Dark theme"}</span>`;
  btn.setAttribute("aria-label", dark ? "Light theme" : "Dark theme");
  btn.title = dark ? "Switch to the light theme" : "Switch to the dark theme";
}

applyTheme(savedTheme() ?? (systemDark?.matches ? "dark" : "light"));
el("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(THEME_KEY, next); } catch { /* still switches for this visit */ }
  applyTheme(next);
});
systemDark?.addEventListener("change", e => {
  if (!savedTheme()) applyTheme(e.matches ? "dark" : "light");
});


// Account types (see cloud-sync.js). PLT and MLT only open some forms and the
// Bulk Calculator, and never the saved sheets or Stored Data; Lead and up open
// everything but the Admin tab; Admin and Owner open everything. The database
// rules enforce the same split. With no database (local-only) there's
// nothing to protect, so whoever uses that copy gets everything.
function canOpen(view) {
  const r = effectiveRole();
  if (!r) return false;
  if (LIMITED_VIEWS[r]) return LIMITED_VIEWS[r].includes(view);
  return !ADMIN_VIEWS.includes(view) || atLeast(r, "admin");
}

function hasDatabaseAccess() {
  const r = effectiveRole();
  return !!r && atLeast(r, "lead");
}

function canManageLeads() {
  const r = effectiveRole();
  return !!r && atLeast(r, "admin");
}

// Leads add bulk items, FG items and line rates; changing or removing stored
// ones is for admins.
function canChangeStoredItems() {
  return canManageLeads();
}

// Shows only the tabs, forms and buttons this account type can use.
function renderAccess() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("hidden", !canOpen(t.dataset.tab)));
  el("adminGroup").classList.toggle("hidden", !ADMIN_VIEWS.some(canOpen));
  document.querySelectorAll("#formsTab [data-form]").forEach(b => b.classList.toggle("hidden", !canOpen(b.dataset.form)));
  document.querySelectorAll(".forms-group").forEach(g =>
    g.classList.toggle("hidden", !g.querySelector(".form-card:not(.hidden)")));
  renderRecentForms();
  renderOpenForm(VIEWS.find(v => !el(v).classList.contains("hidden")));
  // Filling a form from the yield sheet needs the yield sheet.
  ["upFillBtn", "brFillBtn", "holdFillBtn", "swFillBtn", "ctFillBtn"].forEach(id => el(id).classList.toggle("hidden", !hasDatabaseAccess()));
  if (typeof BulkCalc !== "undefined") BulkCalc.refreshItemList();
  const open = VIEWS.find(v => !el(v).classList.contains("hidden"));
  if (!canOpen(open)) showView(canOpen("sheetTab") ? "sheetTab" : "formsTab");
}

const accountDisplayName = a => a.name || StoredData.leadForUser(a.username) || a.username;

// The Admin tab's account list: everyone's account type, changeable by
// admins (only owners change an admin's; nobody changes an owner's or their own).
function renderAccounts() {
  el("accountsCount").textContent = accounts.length || "";
  el("leadsCount").textContent = StoredData.leads().length || "";
  el("adminLocalMsg").classList.toggle("hidden", !localOnly);
  el("accountSearch").classList.toggle("hidden", localOnly || accounts.length === 0);
  const query = el("accountSearch").value.trim().toLowerCase();
  const shown = accounts
    .filter(a => !query || `${accountDisplayName(a)} ${a.username} ${ROLE_LABELS[a.role]}`.toLowerCase().includes(query))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
      || accountDisplayName(a).localeCompare(accountDisplayName(b), undefined, { sensitivity: "base" }));
  el("accountTableBody").innerHTML = shown.map(a => {
    const you = a.username === currentUser;
    const locked = a.role === "owner" || you || (a.role === "admin" && role !== "owner");
    const type = locked
      ? `<span class="role-fixed">${ROLE_LABELS[a.role]}</span>`
      : `<select data-uid="${escapeHtml(a.uid)}" aria-label="Account type for ${escapeHtml(a.username)}">${
        ROLE_ORDER.filter(r => r !== "owner").map(r =>
          `<option value="${r}"${r === a.role ? " selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}</select>`;
    return `<tr><td>${escapeHtml(accountDisplayName(a))}${you ? ` <span class="account-you">(you)</span>` : ""}</td>
      <td>${escapeHtml(a.username)}</td>
      <td>${type}${a.role === "plt" ? `<span class="role-new">New</span>` : ""}</td>
      <td>${a.created ? escapeHtml(formatDateMMDDYY(todayISO(a.created))) : ""}</td></tr>`;
  }).join("");
  el("noAccountsMsg").textContent = accounts.length ? `No accounts match "${el("accountSearch").value.trim()}".` : "No accounts yet.";
  el("noAccountsMsg").classList.toggle("hidden", localOnly || shown.length > 0);
}

// LineUp: Network Access (Owners only): the network this computer is on, the
// networks allowed from here (each for 30 days), and the button that allows
// this one. The list itself is kept by the lineupNetwork function, not here.
const lnDate = ms => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
let lnBusy = false;
let lnDays = 30; // how long "temporary" is (the function says)

async function lineupNetwork(action = "status", extra = {}) {
  const panel = el("lineupNetworkPanel");
  const owner = !localOnly && role === "owner";
  panel.classList.toggle("hidden", !owner);
  if (!owner || lnBusy) return;
  lnBusy = true;
  ["lnAllowBtn", "lnRemoveBtn", "lnRefreshBtn"].forEach(id => { el(id).disabled = true; });
  try {
    const r = await CloudSync.callFunction("lineupNetwork", { action, ...extra });
    const mine = r.temporary.find(t => t.mine);
    const permanent = r.permanentList ?? [];
    el("lnStatus").textContent = `This network: ${r.ip || "unknown"} — ${r.allowedNow ? "LineUp opens from here." : "not on the list."}`
      + (r.enabled ? "" : " (The network check is off, so LineUp opens from anywhere for now.)");
    el("lnStatus").classList.toggle("ln-ok", r.allowedNow || !r.enabled);
    el("lnRemoveBtn").classList.toggle("hidden", !mine);
    // The allowed list (from the Activity Log, or typed in the console), then
    // the networks allowed from here for 30 days.
    lnDays = r.days ?? 30;
    const buttons = (ip, label, to) => `<td><div class="ln-actions">
      <button type="button" class="link-btn" data-ln-make="${to}" data-ip="${escapeHtml(ip)}" data-label="${escapeHtml(label)}"${to === "temporary" ? ` title="Allowed for ${lnDays} days from now"` : ""}>${to === "temporary" ? "Make temporary" : "Make permanent"}</button>
      <button type="button" class="link-btn" data-ln-remove="${escapeHtml(ip)}">Remove</button></div></td>`;
    el("lnTableBody").innerHTML = permanent.map(p => `
      <tr><td>${escapeHtml(p.ip)}</td>
        <td>${p.label ? escapeHtml(p.label) : `<span class="muted">Set in the Firebase console</span>`}${p.by ? ` <span class="muted">(${escapeHtml(p.by)})</span>` : ""}</td>
        <td>Until removed</td>${buttons(p.ip, p.label || "From the Firebase console", "temporary")}</tr>`).join("")
      + r.temporary.map(t => `
      <tr><td>${escapeHtml(t.ip)}</td><td>${escapeHtml(t.label)}${t.mine ? ` <span class="account-you">(yours)</span>` : t.by ? ` <span class="muted">(${escapeHtml(t.by)})</span>` : ""}</td>
        <td>${escapeHtml(lnDate(t.until))}</td>${buttons(t.ip, t.label, "permanent")}</tr>`).join("");
    el("lnNone").classList.toggle("hidden", permanent.length + r.temporary.length > 0);
    // The list may have changed: the Activity Log asks again when it's next shown.
    lnAllowedIps = new Set();
    lnCheckedIps.clear();
    if (action === "allow") {
      logActivity("Allowed LineUp from a network", `${r.ip}, until ${lnDate(mine?.until ?? Date.now())}`);
      showMsg("lnMsg", `LineUp now opens from this network (${r.ip}) until ${lnDate(mine?.until ?? Date.now())}.`);
    } else if (action === "remove") {
      logActivity("Removed a LineUp network", r.ip);
      showMsg("lnMsg", "Your network is off the list.");
    } else if (action === "removeIp") {
      logActivity("Removed a LineUp network", extra.ip);
      showMsg("lnMsg", `${extra.ip} is off the list.`);
    } else if (action === "allowIp") {
      const until = r.temporary.find(t => t.ip === extra.ip && t.listed)?.until;
      const ok = extra.days ? !!until : permanent.some(p => p.ip === extra.ip);
      if (!ok) throw new Error("The server's lineupNetwork function needs updating (deploy the functions again).");
      logActivity("Changed a LineUp network", `${extra.ip}: ${extra.days ? `until ${lnDate(until)}` : "until removed"}`);
      showMsg("lnMsg", `${extra.ip} is allowed ${extra.days ? `until ${lnDate(until)}` : "until removed"}.`);
    } else {
      showMsg("lnMsg", "");
    }
  } catch (err) {
    el("lnStatus").textContent = "Couldn't check this network.";
    showMsg("lnMsg", `${err.message}`, false);
  } finally {
    lnBusy = false;
    ["lnAllowBtn", "lnRemoveBtn", "lnRefreshBtn"].forEach(id => { el(id).disabled = false; });
  }
}
el("lnAllowBtn").addEventListener("click", () => lineupNetwork("allow"));
el("lnRemoveBtn").addEventListener("click", () => lineupNetwork("remove"));
el("lnRefreshBtn").addEventListener("click", () => lineupNetwork("status"));
el("lnTableBody").addEventListener("click", e => {
  const make = e.target.closest("[data-ln-make]");
  if (make) {
    const { ip, label, lnMake } = make.dataset;
    lineupNetwork("allowIp", lnMake === "temporary" ? { ip, label, days: lnDays } : { ip, label });
    return;
  }
  const ip = e.target.closest("[data-ln-remove]")?.dataset.lnRemove;
  if (ip && confirm(`Take ${ip} off LineUp's allowed networks? LineUp won't open from it once the check is on.`)) lineupNetwork("removeIp", { ip });
});

// Lead and up are in the Created By leads list, linked to their username;
// PLT and MLT aren't.
function syncLeadList(account, newRole) {
  const linked = StoredData.leadForUser(account.username);
  if (atLeast(newRole, "lead")) {
    if (linked) return;
    const name = accountDisplayName(account).trim().replace(/\s+/g, " ");
    const existing = StoredData.leads().find(n => n.toLowerCase() === name.toLowerCase());
    if (!existing) StoredData.addLead(name);
    StoredData.setLeadUsername(existing ?? name, account.username);
  } else if (linked) {
    StoredData.removeLead(linked);
  }
}

el("accountSearch").addEventListener("input", renderAccounts);
el("accountTableBody").addEventListener("change", e => {
  const select = e.target.closest("select[data-uid]");
  const account = select && accounts.find(a => a.uid === select.dataset.uid);
  if (!account) return;
  const newRole = select.value;
  CloudSync.setRole(account.uid, newRole);
  logActivity("Changed an account type", `${accountDisplayName(account)} (${account.username}): ${ROLE_LABELS[account.role]} → ${ROLE_LABELS[newRole]}`);
  syncLeadList(account, newRole);
  showMsg("accountMsg", `${accountDisplayName(account)} is now ${ROLE_LABELS[newRole]}.`);
  renderStoredData();
});

// The activity log (cloud-sync.js): what people do, saved as they do it.
function logActivity(action, detail = "") {
  CloudSync.log(action, detail);
}

const sheetLabel = rec => [rec.woNumber && `WO ${rec.woNumber}`, rec.fgItem && `FG ${rec.fgItem}`].filter(Boolean).join(", ") || "no WO #";

// Printing (the buttons, Ctrl+P or the browser menu), by what's open.
const PRINT_ACTIONS = {
  unplannedTab: "Printed an Unplanned Issue form",
  bulkReturnTab: "Printed a Bulk Return form",
  holdTab: "Printed a Hold Tag",
  swTab: "Printed Standard Work",
  ctTab: "Printed a Component Transfer Notice",
  rotTab: "Printed a Rotation Schedule",
  trainingTab: "Printed a Training Sign-in Sheet",
  tsTab: "Printed a Trouble Shooting Template",
  pcTab: "Printed a Pulse Check Conversation sheet",
  bulkCalcTab: "Printed a Bulk Calculator report"
};
window.addEventListener("beforeprint", () => {
  const open = VIEWS.find(v => !el(v).classList.contains("hidden"));
  if (PRINT_ACTIONS[open]) {
    const item = open === "bulkCalcTab" ? el("calcBulkItem").value.trim().toUpperCase()
      : open === "ctTab" && typeof ComponentTransfer !== "undefined" ? ComponentTransfer.summary()
      : open === "rotTab" && typeof Rotation !== "undefined" ? Rotation.summary()
      : open === "trainingTab" && typeof TrainingSignIn !== "undefined" ? TrainingSignIn.summary()
      : open === "tsTab" && typeof Troubleshooting !== "undefined" ? Troubleshooting.summary()
      : open === "bulkReturnTab" && typeof BulkReturn !== "undefined" ? BulkReturn.summary() : "";
    logActivity(PRINT_ACTIONS[open], item);
  } else if (document.body.dataset.print !== "blocked") {
    // Every other tab prints the yield sheet.
    logActivity("Printed a yield sheet", sheetLabel({ woNumber: el("woNumber").value.trim(), fgItem: el("fgItem").value.trim() }));
  }
});

// The Activity Log tab (Admin and Owner): entries grouped by person, names
// A–Z, newest first within each.
let activityEntries = [];
let activityTruncated = false;
let activityLoaded = false;
const activityOpen = new Set();
// Whether the list on screen was drawn for a search (every group open).
let activityDrawnSearching = false;
const ACTIVITY_DAY_MS = 24 * 60 * 60 * 1000;

const activityAccount = e => accounts.find(a => a.uid === e.uid);
// The other apps sign in with shared accounts: LineUp's shifts, Cremer
// Recipes' Mech and Super. They're named by app and account.
const OTHER_APP_ACCOUNTS = { "1st": "1st shift", "2nd": "2nd shift", "3rd": "3rd shift",
  "cremer-mech": "Mech", "cremer-super": "Super" };
const isHubEntry = e => e.app === CloudSync.HUB_APP;
const activityName = e => {
  if (!isHubEntry(e)) return `${e.app} · ${OTHER_APP_ACCOUNTS[e.username] ?? e.username}`;
  const account = activityAccount(e);
  return account ? accountDisplayName(account) : StoredData.leadForUser(e.username) ?? e.username;
};
const activityTime = d => d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });

// The networks (IP addresses) each account signed in from. Owners can add
// one to LineUp's allowed networks from here; which are allowed already is
// asked of the lineupNetwork function (it knows the list, ranges included).
let lnAllowedIps = new Set();
const lnCheckedIps = new Set();
// Networks allowed for a while: address -> end (ms).
let lnTempUntil = new Map();
let lnChecking = false;
const isOwnerHere = () => !localOnly && role === "owner";

async function checkActivityNetworks() {
  if (!isOwnerHere() || lnChecking) return;
  const ips = [...new Set(activityEntries.map(e => e.ip).filter(Boolean))];
  if (ips.every(ip => lnCheckedIps.has(ip))) return;
  lnChecking = true;
  try {
    const r = await CloudSync.callFunction("lineupNetwork", { action: "status", checkIps: ips });
    // A function from before Allow existed doesn't answer this: no buttons.
    if (!Array.isArray(r.allowedIps)) return;
    lnAllowedIps = new Set(r.allowedIps);
    lnTempUntil = new Map((r.temporary ?? []).map(t => [t.ip, t.until]));
    lnDays = r.days ?? lnDays;
    ips.forEach(ip => lnCheckedIps.add(ip));
    renderActivity();
  } catch (err) {
    console.warn("Couldn't check the networks.", err);
  } finally {
    lnChecking = false;
  }
}

function activityNetworksHtml(g) {
  const nets = new Map();
  g.entries.forEach(e => {
    if (!e.ip) return;
    if (!nets.has(e.ip)) nets.set(e.ip, { ip: e.ip, count: 0, last: e.at });
    nets.get(e.ip).count++;
  });
  if (!nets.size) return "";
  const owner = isOwnerHere();
  return `<div class="activity-nets"><span class="activity-nets-label">${nets.size === 1 ? "Network" : `${nets.size} networks`}</span>
    ${[...nets.values()].map(n => `<span class="activity-net">
      <span class="activity-net-ip">${escapeHtml(n.ip)}</span>
      <span class="activity-net-meta">${n.count} sign-in${n.count === 1 ? "" : "s"} · last ${escapeHtml(activityTime(n.last))}</span>
      ${!owner ? "" : lnAllowedIps.has(n.ip) ? `<span class="activity-net-ok">✓ Allowed${lnTempUntil.has(n.ip) ? ` until ${escapeHtml(lnDate(lnTempUntil.get(n.ip)))}` : ""}</span>`
        : lnCheckedIps.has(n.ip) ? `<button type="button" class="activity-net-allow" data-allow-ip="${escapeHtml(n.ip)}" data-allow-for="${escapeHtml(g.name)}">Allow</button>` : ""}
    </span>`).join("")}</div>`;
}

function filteredActivity() {
  const days = el("activityRange").value;
  const from = days === "1" ? new Date(new Date().setHours(0, 0, 0, 0))
    : days ? new Date(Date.now() - Number(days) * ACTIVITY_DAY_MS) : null;
  const query = el("activitySearch").value.trim().toLowerCase();
  const app = el("activityApp").value;
  return activityEntries.filter(e => (!from || e.at >= from) && (!app || e.app === app)
    && (!query || `${activityName(e)} ${e.username} ${e.app} ${e.action} ${e.detail} ${e.ip}`.toLowerCase().includes(query)));
}

// [[name, entries], ...] sorted by name; entries stay newest first.
function activityGroups() {
  const groups = new Map();
  filteredActivity().forEach(e => {
    const key = e.uid || e.username;
    if (!groups.has(key)) groups.set(key, { key, name: activityName(e), entry: e, entries: [] });
    groups.get(key).entries.push(e);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// `keepOpen` (the default) first notes which groups are open on screen, so a
// live update never closes one that was just opened.
function renderActivity({ keepOpen = true } = {}) {
  if (keepOpen && !activityDrawnSearching) {
    el("activityGroups").querySelectorAll("details[data-key]").forEach(d =>
      (d.open ? activityOpen.add(d.dataset.key) : activityOpen.delete(d.dataset.key)));
  }
  if (localOnly) {
    el("activityMsg").textContent = "The activity log needs the database, which isn't connected on this computer.";
    el("activityGroups").innerHTML = "";
    return;
  }
  const groups = activityGroups();
  const searching = el("activitySearch").value.trim() !== "";
  activityDrawnSearching = searching;
  const count = groups.reduce((n, g) => n + g.entries.length, 0);
  el("activityMsg").textContent = !activityLoaded ? "Loading…"
    : !activityEntries.length ? "No activity yet."
    : !count ? "No activity matches."
    : `${count} ${count === 1 ? "activity" : "activities"} by ${groups.length} ${groups.length === 1 ? "account" : "accounts"}`
      + (activityTruncated ? " (the newest 1,000 entries)." : ".");
  el("activityGroups").innerHTML = groups.map(g => {
    const account = isHubEntry(g.entry) ? activityAccount(g.entry) : null;
    const who = isHubEntry(g.entry) ? [g.entry.username, account && ROLE_LABELS[account.role]].filter(Boolean).join(" · ")
      : "shared account";
    const open = searching || activityOpen.has(g.key);
    return `<details class="activity-person" data-key="${escapeHtml(g.key)}"${open ? " open" : ""}>
      <summary><strong>${escapeHtml(g.name)}</strong><span class="activity-who">${escapeHtml(who)}</span>
        <span class="activity-count">${g.entries.length} ${g.entries.length === 1 ? "activity" : "activities"} · last ${escapeHtml(activityTime(g.entries[0].at))}</span></summary>
      ${activityNetworksHtml(g)}
      <div class="table-scroll"><table class="activity-table">
        <colgroup><col class="col-time"><col class="col-action"><col><col class="col-ip"></colgroup><tbody>${g.entries.map(e => `
        <tr><td>${escapeHtml(activityTime(e.at))}</td><td>${escapeHtml(e.action)}</td><td>${escapeHtml(e.detail)}</td><td class="activity-ip">${escapeHtml(e.ip)}</td></tr>`).join("")}
      </tbody></table></div></details>`;
  }).join("");
  el("activityExpandBtn").textContent = activityAllOpen() ? "Collapse All" : "Expand All";
}

onViewShown("activityTab", () => {
  renderActivity();
  checkActivityNetworks();
  CloudSync.watchActivity((entries, truncated) => {
    activityEntries = entries;
    activityTruncated = truncated;
    activityLoaded = true;
    renderActivity();
    checkActivityNetworks();
  });
});
// The Allow window: the network's name, and until removed or for lnDays days.
// Resolves to { label, days } (days 0 = until removed), or null if cancelled.
function askAllowNetwork(ip, name) {
  const dialog = el("netAllowDialog");
  el("netAllowTitle").textContent = `Allow LineUp from ${ip}`;
  el("netAllowName").value = name || "";
  el("netAllowDaysText").textContent = `For ${lnDays} days`;
  dialog.querySelector('input[name="netAllowHow"][value="permanent"]').checked = true;
  dialog.returnValue = "";
  dialog.showModal();
  el("netAllowName").select();
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      if (dialog.returnValue !== "allow") return resolve(null);
      const temporary = dialog.querySelector('input[name="netAllowHow"]:checked')?.value === "temporary";
      resolve({ label: el("netAllowName").value.trim(), days: temporary ? lnDays : 0 });
    }, { once: true });
  });
}

// Allow beside a network: add it to LineUp's allowed networks, with a name.
el("activityGroups").addEventListener("click", async e => {
  const button = e.target.closest("[data-allow-ip]");
  if (!button) return;
  const ip = button.dataset.allowIp;
  const choice = await askAllowNetwork(ip, button.dataset.allowFor);
  if (!choice) return;
  const { label, days } = choice;
  button.disabled = true;
  try {
    const r = await CloudSync.callFunction("lineupNetwork", { action: "allowIp", ip, label, ...(days ? { days } : {}) });
    const until = r.temporary?.find(t => t.ip === ip && t.listed)?.until;
    if (days ? !until : !r.permanentList?.some(p => p.ip === ip)) {
      throw new Error("the server's lineupNetwork function needs updating (deploy the functions again)");
    }
    lnAllowedIps.add(ip);
    if (days) lnTempUntil.set(ip, until); else lnTempUntil.delete(ip);
    const how = days ? `until ${lnDate(until)}` : "until removed";
    logActivity("Allowed LineUp from a network", `${ip} (${label || "no name"}), ${how}`);
    showMsg("activityNetMsg", `${ip} is on LineUp's allowed networks ${how}.`);
    renderActivity();
  } catch (err) {
    button.disabled = false;
    showMsg("activityNetMsg", `Couldn't allow ${ip}: ${err.message}`, false);
  }
});
el("activitySearch").addEventListener("input", renderActivity);
el("activityRange").addEventListener("change", renderActivity);
el("activityApp").addEventListener("change", renderActivity);
// "toggle" doesn't bubble, so it's caught on the way down.
const activityAllOpen = () => {
  const shown = [...el("activityGroups").querySelectorAll("details[data-key]")];
  return shown.length > 0 && shown.every(d => d.open);
};
el("activityGroups").addEventListener("toggle", () => {
  el("activityExpandBtn").textContent = activityAllOpen() ? "Collapse All" : "Expand All";
}, true);
el("activityExpandBtn").addEventListener("click", () => {
  const expand = !activityAllOpen();
  if (activityDrawnSearching) {
    // Search results only: open or close what's shown, keep what's remembered.
    el("activityGroups").querySelectorAll("details[data-key]").forEach(d => { d.open = expand; });
    return;
  }
  activityGroups().forEach(g => (expand ? activityOpen.add(g.key) : activityOpen.delete(g.key)));
  renderActivity({ keepOpen: false });
});
el("activityExportBtn").addEventListener("click", () => {
  const rows = activityGroups().flatMap(g => g.entries.map(e => {
    const account = isHubEntry(e) ? activityAccount(e) : null;
    return [g.name, e.username, account ? ROLE_LABELS[account.role] : "", e.app, activityTime(e.at), e.action, e.detail, e.ip];
  }));
  if (!rows.length) {
    alert("No activity to export.");
    return;
  }
  downloadCsv([["Name", "Username", "Account type", "App", "Date/time", "Activity", "Details", "IP address"], ...rows],
    `pk030-activity-${todayISO()}.csv`);
});

function showSignedInName() {
  if (!currentUser) return;
  const lead = StoredData.leadForUser(currentUser);
  el("userName").textContent = lead ?? (accountName || currentUser);
  el("userName").title = `Username: ${currentUser}`;
  el("userRole").textContent = role ? ROLE_LABELS[role] : "";
  const words = el("userName").textContent.trim().split(/\s+/);
  el("userAvatar").textContent = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
  el("userAvatar").title = el("userName").textContent;
}

// A new sheet's Created By starts as the signed-in user's lead, unless someone
// already picked in the dropdown (saved sheets keep their own).
el("createdBy").addEventListener("change", () => { createdByPicked = true; });

function applyDefaultCreatedBy() {
  if (!currentUser || editingId || createdByPicked || getCreatedBy()) return;
  const lead = StoredData.leadForUser(currentUser);
  if (lead) setCreatedBy(lead);
}

StoredData.onChange = CloudSync.saveStored;
CloudSync.start({
  // Signed in; the app shows once the account type is known (onRole).
  onSignedIn(username) {
    currentUser = username;
    document.body.dataset.auth = "pending";
  },
  onRole(newRole, { name }) {
    role = newRole;
    accountName = name;
    // Below Lead there's no access to the shared data, so none stays here.
    if (!hasDatabaseAccess()) {
      saveRecords([]);
      clearForm();
      clearDraft();
      StoredData.replaceAll({ leads: [], bulkItems: [], fgItems: [] });
      renderRecordsTable();
    }
    if (!canManageLeads()) accounts = [];
    document.body.dataset.auth = "signed-in";
    document.body.dataset.role = newRole;
    renderAccess();
    // Redraws what depends on the account type (item buttons, accounts,
    // header name).
    renderStoredData();
  },
  onSignedOut() {
    currentUser = null;
    role = null;
    accounts = [];
    document.body.dataset.auth = "signed-out";
    el("signInUser").focus();
  },
  // The database library couldn't load (e.g. index.html opened from disk),
  // so there is nothing to sign in to; the app runs on this computer's copy.
  onLocalOnly(text) {
    localOnly = true;
    renderAccess();
    renderAccounts();
    document.body.dataset.auth = "local";
    showSyncStatus({ state: "error", text });
  },
  localSheets: loadRecords,
  localStored: () => ({
    leads: StoredData.leads(),
    leadUsers: StoredData.leadUsers(),
    bulkItems: StoredData.bulkItems.all(),
    fgItems: StoredData.fgItems.all(),
    lineRates: StoredData.lineRates.all(),
    cotton: StoredData.cotton.all(),
    desiccant: StoredData.desiccant.all(),
    allergen: StoredData.allergen.all()
  }),
  onSheets(records) {
    saveRecords(records);
    renderRecordsTable();
  },
  onStoredData(data) {
    StoredData.replaceAll(data);
    renderStoredData();
    fillFromStoredData();
  },
  onAccounts(list) {
    accounts = list;
    renderAccounts();
    if (!el("activityTab").classList.contains("hidden")) renderActivity();
  },
  onStatus: showSyncStatus
});
