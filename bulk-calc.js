// Bulk Calculator tab: turns weighed bulk containers into thousand-piece units
// (TH), with the Bulk Weighing Calculator v2.5 formulas. For each bulk:
//   net kg      = bulk weight - container tare
//   total grams = net kg x 1000, rounded to a whole gram
//   total TH    = total grams / piece weight (mg)   (1000 pieces weigh
//                 "piece weight" grams, so grams / mg gives thousands)
//   rounded TH  = total TH rounded to a whole number
// Uses el, escapeHtml, StoredData and renderStoredData from app.js.
const BulkCalc = (() => {
  const TARES = [
    { name: "Big Blue Pallet", kg: 23.9 },
    { name: "Small Blue Pallet", kg: 18.5 },
    { name: "Grey Tote", kg: 17.5 },
    { name: "Blue Tote", kg: 16.9 }
  ];
  const DEFAULT_TARE = 2; // Grey Tote

  // Weights as the original prints them: one decimal, and thousands separators
  // for grams.
  const kg = n => `${n.toFixed(1)} kg`;
  const pieces = n => (n % 1 === 0 ? String(n) : n.toFixed(3));

  // The tare line's label, e.g. "Grey Tote Weight" / "Big Blue Pallet Tare Weight".
  const tareLabel = tare => tare.name + (tare.name.includes("Tote") ? " Weight" : " Tare Weight");

  // Pure calculation for one bulk; `error` explains why it can't be finished.
  function calculate(bagWeightText, tare, pieceWt) {
    const bag = parseFloat(bagWeightText);
    if (String(bagWeightText).trim() === "") return { error: "Enter the bulk weight." };
    if (!(bag > 0)) return { error: "Bulk weight must be a positive number." };
    const net = bag - tare.kg;
    if (net < 0) return { error: `Bulk weight is less than the ${tare.name} tare (${tare.kg} kg).` };
    const grams = Math.round(net * 1000);
    const result = { bag, tare, net, grams };
    if (!(pieceWt > 0)) return { ...result, needsPieceWt: true };
    const th = grams / pieceWt;
    return { ...result, pieceWt, th, rounded: Math.round(th) };
  }

  const bulksBox = el("calcBulks");
  let nextId = 1;

  function addBulk() {
    const id = nextId++;
    const div = document.createElement("fieldset");
    div.className = "calc-bulk";
    div.dataset.id = id;
    div.innerHTML = `
      <legend class="calc-bulk-title"></legend>
      <button type="button" class="calc-remove" title="Remove this bulk" aria-label="Remove this bulk">✕</button>
      <div class="field-grid">
        <label>Bulk Weight (kg)
          <input type="number" class="calc-bag" step="any" min="0">
        </label>
        <label>Pallet / Tote Tare
          <select class="calc-tare">${TARES.map((t, i) =>
            `<option value="${i}"${i === DEFAULT_TARE ? " selected" : ""}>${escapeHtml(t.name)} - ${t.kg} kg</option>`).join("")}</select>
        </label>
      </div>`;
    bulksBox.appendChild(div);
    render();
    return div;
  }

  function bulkRows() {
    return [...bulksBox.querySelectorAll(".calc-bulk")];
  }

  function readAll() {
    const pieceWt = parseFloat(el("calcPieceWt").value);
    return bulkRows().map(row => calculate(row.querySelector(".calc-bag").value,
      TARES[row.querySelector(".calc-tare").value], pieceWt));
  }

  // The worked steps for one bulk, as [label, value, style] rows.
  function steps(r) {
    const rows = [
      ["Bulk Weight", kg(r.bag)],
      [tareLabel(r.tare), `-${kg(r.tare.kg)}`],
      ["Net Weight", kg(r.net), "strong"],
      ["Multiply by 1000", "X 1000"],
      ["Total Grams", r.grams.toLocaleString("en-US"), "strong"]
    ];
    if (r.th === undefined) return rows;
    return [...rows,
      ["Divide Piece Weight", `/${r.pieceWt}`],
      ["Total Pieces", pieces(r.th), "strong"],
      ["Total TH Rounded", `${r.rounded} TH`, "final"]];
  }

  function render() {
    const rows = bulkRows();
    rows.forEach((row, i) => {
      row.querySelector(".calc-bulk-title").textContent = `Bulk #${i + 1}`;
      row.querySelector(".calc-remove").classList.toggle("hidden", rows.length === 1);
    });

    const results = readAll();
    const done = results.filter(r => r.rounded !== undefined);
    const total = done.reduce((sum, r) => sum + r.rounded, 0);
    const complete = results.length > 0 && done.length === results.length;
    el("calcTotal").textContent = complete ? `${total.toLocaleString("en-US")} TH` : "—";
    el("calcTotalLabel").textContent = results.length > 1 ? `Total TH, all ${results.length} bulks` : "Total TH";

    const needsPieceWt = results.some(r => r.needsPieceWt);
    el("calcMsg").textContent = needsPieceWt ? "Enter the piece weight (mg) to get TH." : "";
    el("calcMsg").classList.toggle("hidden", !needsPieceWt);

    el("calcResults").innerHTML = results.map((r, i) => `
      <div class="calc-result">
        <h3>Bulk #${i + 1}</h3>
        ${r.error ? `<p class="hint-err">${escapeHtml(r.error)}</p>` : `<table class="calc-steps"><tbody>${steps(r).map(([label, value, style]) =>
          `<tr class="${style ?? ""}"><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody></table>`}
      </div>`).join("");

    el("calcPrintBtn").disabled = !complete;
    updateSaveItemBtn();
  }

  // Bulk Item fills Piece Weight from Stored Data (Bulk Items & Piece Weights),
  // like on the yield sheet; a typed piece weight for an unstored item can be
  // saved there.
  function fillPieceWt() {
    const hit = StoredData.bulkItems.find(el("calcBulkItem").value);
    const input = el("calcPieceWt");
    if (hit) {
      input.value = String(hit.pieceWt);
      input.dataset.fromItem = hit.item;
      el("calcPieceWtHint").textContent = `From Stored Data (${hit.item}).`;
    } else if (input.dataset.fromItem !== undefined) {
      input.value = "";
      delete input.dataset.fromItem;
      el("calcPieceWtHint").textContent = "";
    }
    render();
  }

  function updateSaveItemBtn() {
    const item = el("calcBulkItem").value.trim().toUpperCase();
    const pw = parseFloat(el("calcPieceWt").value);
    const stored = item ? StoredData.bulkItems.find(item) : null;
    const show = item && pw > 0 && (!stored || stored.pieceWt !== pw);
    el("calcSaveItemBtn").classList.toggle("hidden", !show);
    if (show) el("calcSaveItemBtn").textContent = stored
      ? `Update ${item} in Stored Data to ${pw} mg (now ${stored.pieceWt} mg)`
      : `Save ${item} (${pw} mg) to Stored Data`;
  }

  function refreshItemList() {
    el("calcBulkItemList").innerHTML = StoredData.bulkItems.all()
      .map(i => `<option value="${escapeHtml(i.item)}">${i.pieceWt} mg</option>`).join("");
    updateSaveItemBtn();
  }

  // One portrait page per bulk, laid out like the original report.
  function buildPrint() {
    const results = readAll();
    const item = el("calcBulkItem").value.trim().toUpperCase();
    el("calcPrint").innerHTML = results.map((r, i) => `
      <div class="calc-print-page">
        <div class="calc-print-header">
          <h1>Bulk Weighing Calculation Report</h1>
          <p>Bulk #${i + 1} of ${results.length} — Standardized Thousand-Piece Units (TH)</p>
          ${item ? `<p>Bulk Item: ${escapeHtml(item)}</p>` : ""}
        </div>
        ${r.error ? `<p class="calc-print-note">${escapeHtml(r.error)}</p>` : steps(r).map(([label, value, style]) =>
          `<div class="calc-print-row ${style ?? ""}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join("")}
        ${r.needsPieceWt ? `<p class="calc-print-note">No piece weight entered, so no TH.</p>` : ""}
        <div class="calc-print-sign">
          <div>Initial</div>
          <div>Date</div>
        </div>
      </div>`).join("");
  }

  const onCalcTab = () => !el("bulkCalcTab").classList.contains("hidden");

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints the
  // calculator report instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (onCalcTab()) {
      buildPrint();
      document.body.dataset.print = "calc";
    }
  });

  el("calcPrintBtn").addEventListener("click", () => window.print());
  el("calcAddBulkBtn").addEventListener("click", () => addBulk().querySelector(".calc-bag").focus());
  bulksBox.addEventListener("input", render);
  bulksBox.addEventListener("change", render);
  bulksBox.addEventListener("click", e => {
    if (!e.target.closest(".calc-remove")) return;
    e.target.closest(".calc-bulk").remove();
    render();
  });
  el("calcBulkItem").addEventListener("input", fillPieceWt);
  el("calcPieceWt").addEventListener("input", () => {
    delete el("calcPieceWt").dataset.fromItem;
    el("calcPieceWtHint").textContent = "";
    render();
  });
  el("calcSaveItemBtn").addEventListener("click", () => {
    const item = el("calcBulkItem").value.trim();
    StoredData.bulkItems.save(item, parseFloat(el("calcPieceWt").value));
    renderStoredData();
    fillPieceWt();
  });
  el("calcClearBtn").addEventListener("click", () => {
    el("calcBulkItem").value = "";
    el("calcPieceWt").value = "";
    delete el("calcPieceWt").dataset.fromItem;
    el("calcPieceWtHint").textContent = "";
    bulksBox.innerHTML = "";
    addBulk();
  });
  addBulk();
  refreshItemList();
  return { calculate, TARES, refreshItemList };
})();
