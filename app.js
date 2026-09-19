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

function buildPrintSheet() {
  const data = collectFormData();
  const r = computeResults();
  const flagText = r.highYield ? "High Yield NCCAPA___________"
    : r.lowYield ? "Low Yield NCCAPA____________" : "";
  const videoJetLine = r.videoJetCount
    ? `VideoJet Count: VideoJet Count       By: ${data.videoJetBy || "___________"}       Date: _________________`
    : "";
  const partialPalletLine = r.videoJetCount
    ? `Partial Pallet Configuration: ${data.partialPalletConfig || "_________________________________________________"} By: ___________  Date: _________________`
    : "";

  el("printSheet").innerHTML = `
    <div class="page">
      <h2>PK030M [ALL] Final Packaging Yield Sheet</h2>
      <p style="text-align:center">Page 1 of 2</p>
      <table>
        <tr><th>FG Item</th><td>${data.fgItem}</td><th>Work Order</th><td>${data.woNumber}</td></tr>
        <tr><th>Bulk Item</th><td colspan="3">${data.bulkItem}</td></tr>
      </table>
      <table>
        <tr><th>Bulk Issued (TH)</th><td>${fmt(r.bulkIssuedNet)}</td></tr>
        <tr><th>Bulk Packaged (TH)</th><td>${fmt(r.bulkPackagedTH)}</td></tr>
        <tr><th>Bulk Scrapped (TH)</th><td>${fmt(r.bulkScrappedTH)}</td></tr>
        <tr><th>Final Yield</th><td class="flag">${fmt(r.finalYieldRatio * 100)}%</td></tr>
      </table>
      <p>Range 95% to 102% (In-House) &nbsp; Range 95% to 110% (PIM)</p>
      <p>${el("summaryLine1").textContent}</p>
      <p>${el("summaryLine2").textContent}</p>
      <p class="flag">${flagText}</p>
      <p>Date: ${data.dateCreated}</p>
      <div class="sig-line">Yield Sheet Created By: ${data.createdBy || "_____________________________________________"}</div>
      <div class="sig-line">Packaging Review By: ${data.packagingReviewBy || "_______________________________________________"}</div>
      <div class="sig-line">Quality Review By: ${data.qualityReviewBy || "_________________________________________________"}</div>
      <div class="sig-line">Quality Release By: ${data.qualityReleaseBy || "________________________________________________"}</div>
      ${videoJetLine ? `<p class="flag">${flagText}</p><p>${videoJetLine}</p>` : ""}
      ${partialPalletLine ? `<p>${partialPalletLine}</p>` : ""}
      <p class="footer-note">QS017B &nbsp; For Pharmavite internal use, only. &nbsp; PKGN-0140, PKGN-0154</p>
    </div>
    <div class="page">
      <h2>PK030M [ALL] Final Packaging Yield Sheet</h2>
      <p style="text-align:center">Page 2 of 2</p>
      <table>
        <tr><th>List #</th><td>${data.fgItem}</td></tr>
        <tr><th>Lot #</th><td>${data.woNumber}</td></tr>
        <tr><th>CC #</th><td>${data.bulkItem}</td></tr>
      </table>
      <p class="footer-note">QS017B &nbsp; For Pharmavite internal use, only. &nbsp; PKGN-0140, PKGN-0154</p>
    </div>
  `;
}

el("printBtn").addEventListener("click", () => {
  buildPrintSheet();
  window.print();
});

clearForm();
renderRecordsTable();
