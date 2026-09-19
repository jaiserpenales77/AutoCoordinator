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
  "createdBy", "packagingReviewBy", "qualityReviewBy", "qualityReleaseBy",
  "videoJetBy", "partialPalletConfig"
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

  el("summaryLine1").textContent =
    `Total Bottles Produced = ${fmt(r.totalPackaged, 0)}   Bulk Piece Weight = ${fmt(r.pieceWt, 0)}   ` +
    `Fill Rate = ${fmt(r.fillRate, 0)}   Bulk Rejected/Returned = ${fmt(r.bulkRejected, 0)}TH   Bulk Issued = ${fmt(r.bulkIssued, 0)}TH`;
  el("summaryLine2").textContent =
    `Packaging Scrap #1 = ${fmt(r.scrapInputs[0].gross)} KG    Packaging Scrap #2 = ${fmt(r.scrapInputs[1].gross)} KG    ` +
    `Packaging Scrap #3 = ${fmt(r.scrapInputs[2].gross)} KG    Manufacturing Scrap = ${fmt(r.scrapInputs[3].gross)} KG    ` +
    `Container Tare Weight = ${fmt(r.tareWeight, 0)}KG`;
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
        <td>${rec.woNumber || ""}</td>
        <td>${rec.fgItem || ""}</td>
        <td>${rec.bulkItem || ""}</td>
        <td class="${statusClass}">${fmt(results.finalYieldRatio * 100)}%</td>
        <td class="${statusClass}">${results.statusLabel}</td>
        <td>${rec.dateCreated || ""}</td>
        <td class="row-actions">
          <button type="button" data-action="load" data-id="${rec.id}">Load</button>
          <button type="button" data-action="delete" data-id="${rec.id}">Delete</button>
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

const PHARMAVITE_LOGO_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50,8 A42,42 0 1,1 8,50" fill="none" stroke="#f39c12" stroke-width="9" stroke-linecap="round"/>
  <path d="M50,20 A30,30 0 1,1 20,50" fill="none" stroke="#f7c948" stroke-width="7" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="7" fill="#f39c12"/>
</svg>`;

function fmt3(n) {
  return Number.isFinite(n) ? n.toFixed(3) : "0.000";
}

function fmtPct0(ratio) {
  return Number.isFinite(ratio) ? Math.round(ratio * 100) + "%" : "0%";
}

function formatDateMMDDYY(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y.slice(2)}`;
}

function buildSummaryLines(r) {
  const line1 =
    `Total Bottles Produced =${fmt(r.totalPackaged, 0)}   Bulk Piece Weight =${fmt(r.pieceWt, 0)}` +
    `   Fill Rate =${fmt(r.fillRate, 0)}   Bulk Rejected/Returned =${fmt(r.bulkRejected, 0)}TH` +
    `   Bulk Issued=${fmt(r.bulkIssued, 0)}TH`;
  const line2 =
    `Packaging Scrap #1 =${fmt(r.scrapInputs[0].gross)} KG    Packaging Scrap #2 =${fmt(r.scrapInputs[1].gross)} KG` +
    `    Packaging Scrap #3 =${fmt(r.scrapInputs[2].gross)} KG    Manufacturing Scrap =${fmt(r.scrapInputs[3].gross)} KG` +
    `     Container Tare Weight= ${fmt(r.tareWeight, 0)}KG`;
  return { line1, line2 };
}

function buildPrintSheet() {
  const data = collectFormData();
  const r = computeResults();
  const { line1, line2 } = buildSummaryLines(r);

  const flagText = r.highYield ? "High Yield NCCAPA___________"
    : r.lowYield ? "Low Yield NCCAPA____________" : "";

  const videoJetLine = r.videoJetCount
    ? `VideoJet Count: VideoJet Count &nbsp;&nbsp;&nbsp;&nbsp; By: ${data.videoJetBy || "___________"} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date: _________________`
    : "";
  const partialPalletLine = r.videoJetCount
    ? `Partial Pallet Configuration: ${data.partialPalletConfig || "_________________________________________________"} By: ___________ &nbsp; Date: _________________`
    : "";

  const logoBlock = `
    <div class="ps-logo">
      ${PHARMAVITE_LOGO_SVG}
      <div class="ps-logo-text">PHARMAVITE</div>
    </div>`;

  const reconRow = (label, value, pct) => `
    <div class="ps-recon-row">
      <div class="ps-recon-cell label">${label}</div>
      <div class="ps-recon-cell value">${value}</div>
      <div class="ps-recon-cell pct">${pct}</div>
      <div class="ps-recon-cell note"></div>
    </div>`;

  el("printSheet").innerHTML = `
    <div class="ps-page">
      <div class="ps-pagenum">Page 1 of 2</div>
      <div class="ps-header">
        ${logoBlock}
        <div class="ps-header-main">
          <div class="ps-title">PK030M [ALL] Final Packaging Yield Sheet</div>
          <div class="ps-wo-row"><span class="ps-label">FG Item:</span> <span class="ps-value">${data.fgItem}</span><span class="ps-label">Work Order:</span> <span class="ps-value">${data.woNumber}</span></div>
          <div class="ps-wo-row"><span class="ps-label">Bulk Item:</span> <span class="ps-value">${data.bulkItem}</span></div>
        </div>
      </div>

      <div class="ps-section-title">Bulk Reconciliation:</div>
      <div class="ps-recon-grid">
        ${reconRow("Bulk Issued (TH)", fmt3(r.bulkIssuedNet), "")}
        ${reconRow("Bulk Packaged (TH)", fmt3(r.bulkPackagedTH), fmtPct0(r.bulkIssuedNet !== 0 ? r.bulkPackagedTH / r.bulkIssuedNet : 0))}
        ${reconRow("Bulk Scrapped (TH)", fmt3(r.bulkScrappedTH), fmtPct0(r.bulkIssued !== 0 ? r.scrapPiecesSum / r.bulkIssued : 0))}
        <div class="ps-recon-row ps-recon-row-final">
          <div class="ps-recon-cell label">Final Yield</div>
          <div class="ps-recon-cell value"></div>
          <div class="ps-recon-cell pct">${fmtPct0(r.finalYieldRatio)}</div>
          <div class="ps-recon-cell note">Range 95% to 102%(In-House)<br>Range 95% to 110%(PIM)</div>
        </div>
      </div>

      <div class="ps-summary">
        <div>${line1}</div>
        <div>${line2}</div>
      </div>

      <div class="ps-flagline">${flagText}</div>

      <div class="ps-sig-block">
        <div class="ps-sig-row">
          <span class="ps-sig-label">Yield Sheet Created By:</span>
          <span class="ps-sig-fill">${data.createdBy || ""}</span>
          <span class="ps-sig-date-label">Date:</span>
          <span class="ps-sig-date-fill">${formatDateMMDDYY(data.dateCreated)}</span>
        </div>
        <div class="ps-sig-row">
          <span class="ps-sig-label">Packaging Review By:</span>
          <span class="ps-sig-fill">${data.packagingReviewBy || ""}</span>
          <span class="ps-sig-date-label">Date:</span>
          <span class="ps-sig-date-fill"></span>
        </div>
        <div class="ps-sig-row">
          <span class="ps-sig-label">Quality Review By:</span>
          <span class="ps-sig-fill">${data.qualityReviewBy || ""}</span>
          <span class="ps-sig-date-label">Date:</span>
          <span class="ps-sig-date-fill"></span>
        </div>
        <div class="ps-sig-row">
          <span class="ps-sig-label">Quality Release By:</span>
          <span class="ps-sig-fill">${data.qualityReleaseBy || ""}</span>
          <span class="ps-sig-date-label">Date:</span>
          <span class="ps-sig-date-fill"></span>
        </div>
      </div>

      ${r.videoJetCount ? `<div class="ps-line">${videoJetLine}</div>` : ""}
      ${r.videoJetCount ? `<div class="ps-line">${partialPalletLine}</div>` : ""}

      <div class="ps-footer">
        <span>QS017B</span>
        <span>For Pharmavite internal use, only.</span>
        <span>PKGN-0140, PKGN-0154</span>
      </div>
    </div>

    <div class="ps-page">
      <div class="ps-pagenum">Page 2 of 2</div>
      <div class="ps-header">
        ${logoBlock}
        <div class="ps-header-main">
          <div class="ps-title">PK030M [ALL] Final Packaging Yield Sheet</div>
        </div>
      </div>
      <div class="ps-list-grid">
        <div class="ps-recon-cell label">List #</div><div class="ps-recon-cell">${data.fgItem}</div>
        <div class="ps-recon-cell label">Lot #</div><div class="ps-recon-cell">${data.woNumber}</div>
        <div class="ps-recon-cell label">CC #</div><div class="ps-recon-cell">${data.bulkItem}</div>
      </div>
      <div class="ps-footer">
        <span>QS017B</span>
        <span>For Pharmavite internal use, only.</span>
        <span>PKGN-0140, PKGN-0154</span>
      </div>
    </div>
  `;
}

el("printBtn").addEventListener("click", () => {
  buildPrintSheet();
  window.print();
});

clearForm();
renderRecordsTable();
