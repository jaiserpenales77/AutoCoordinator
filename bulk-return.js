// Bulk Return tab: the PK120A [VALA] Packaging - Bulk Return form (QS106A),
// drawn to the same measurements as the paper form (Letter landscape, in pt
// from the top-left of the page). On screen the blanks are fillable and the
// "Circle One" choices are clickable; printing gives the form with the entries
// written on its lines and the chosen reasons circled.
// Uses el, escapeHtml, todayISO, formatDateMMDDYY and onViewShown from app.js.
const BulkReturn = (() => {
  const SERIF = `"Times New Roman", "Liberation Serif", Times, serif`;
  const SANS = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const FONTS = { T: [SERIF, 700], B: [SANS, 700], A: [SANS, 400] };

  // The form's text: [text, x, baseline, size, font, end x]; T = Times New
  // Roman Bold, B = Arial Bold, A = Arial. Each run is stretched to its width
  // on the original, so the blanks line up even with a substitute font.
  const TEXT = [
    ["PK120A [VALA] Packaging", 278.35, 60.53, 12, "B", 431.09],
    ["-", 434.4, 60.53, 12, "B", 438.4],
    ["Bulk Return", 441.65, 60.53, 12, "B", 509.68],
    ["W.O. # ____________________", 300.85, 144.3, 14, "T", 486.9],
    ["PKG", 36, 186.58, 14, "T", 66.38],
    ["Employee", 70.03, 186.58, 14, "T", 129.17],
    ["Returning", 132.8, 186.58, 14, "T", 194.06],
    ["(Initials):", 197.58, 186.58, 14, "T", 253.74],
    ["______________", 257.33, 186.58, 14, "T", 355.1],
    ["Date:", 365.63, 186.58, 14, "T", 398.24],
    ["____________ Shift: ______ Line: ______", 401.88, 186.58, 14, "T", 649.2],
    ["PKG Coordinator/Designee", 36, 228.85, 14, "T", 201.5],
    ["(Initials): ___________________", 205.08, 228.85, 14, "T", 397.35],
    ["Date:", 404.38, 228.85, 14, "T", 436.99],
    ["____________", 440.65, 228.85, 14, "T", 524.67],
    ["JDE", 528.17, 228.85, 14, "T", 554.5],
    ["Return Complete? ________", 557.92, 228.85, 14, "T", 728.33],
    ["Product", 107.77, 271.35, 14, "T", 155.93],
    ["Description", 97.28, 287.37, 14, "T", 166.75],
    ["Bulk Commodity", 247.33, 271.35, 14, "T", 350.5],
    ["Bulk Lot", 473.15, 271.35, 14, "T", 526.29],
    ["Number", 474.9, 287.37, 14, "T", 524.6],
    ["Qty.", 678.72, 271.35, 14, "T", 704.94],
    ["Per Container", 649.2, 287.37, 14, "T", 734.38],
    ["TH", 729.48, 344.65, 14, "T", 749.62],
    ["Reason for the Return", 36, 396.65, 14, "T", 169.48],
    ["(Circle One):", 173.05, 396.65, 14, "T", 251.99],
    ["Bulk", 262.57, 396.65, 14, "T", 291.34],
    ["Over-Issue", 294.6, 396.65, 14, "T", 360.08],
    ["Component Shortage", 384.63, 396.65, 14, "T", 511.79],
    ["Other: __________________", 536.17, 396.65, 14, "T", 706.43],
    ["Reason for the Rejection (Circle One):", 36, 453.92, 14, "T", 265.75],
    ["Clumpy", 276.32, 453.92, 14, "T", 324.34],
    ["Oily", 345.34, 453.92, 14, "T", 371.27],
    ["Foreign", 392.27, 453.92, 14, "T", 438.79],
    ["Other: __________________", 473.79, 453.92, 14, "T", 643.47],
    ["Lead", 36, 500.95, 14, "T", 66.25],
    ["Verification", 69.78, 500.95, 14, "T", 141.5],
    ["(Initials):", 145.05, 500.95, 14, "T", 200.99],
    ["_____________", 208.08, 500.95, 14, "T", 298.83],
    ["Date:", 305.85, 500.95, 14, "T", 338.46],
    ["________", 342.1, 500.95, 14, "T", 398.1],
    ["Shift: _______", 401.63, 500.95, 14, "T", 487.65],
    ["Line:", 491.15, 500.95, 14, "T", 523.06],
    ["_______", 530.17, 500.95, 14, "T", 578.92],
    ["QS106A", 36, 573.73, 12, "A", 81.48],
    ["For Pharmavite internal use, only.", 341.35, 573.73, 7, "A", 446.37],
    ["QSGN-0100", 685.72, 573.73, 12, "A", 751.65]
  ];

  // Fill-in blanks: id -> [x from, x to, baseline] of their underscores.
  const BLANKS = {
    wo: [346.84, 486.9, 144.3],
    empInitials: [257.33, 355.1, 186.58],
    empDate: [401.88, 485.88, 186.58],
    empShift: [526.33, 568.33, 186.58],
    empLine: [607.24, 649.2, 186.58],
    coordInitials: [264.49, 397.35, 228.85],
    coordDate: [440.65, 524.67, 228.85],
    jdeComplete: [672.33, 728.33, 228.85],
    returnOther: [580.38, 706.43, 396.65],
    rejectOther: [517.47, 643.47, 453.92],
    leadInitials: [208.08, 298.83, 500.95],
    leadDate: [342.1, 398.1, 500.95],
    leadShift: [438.65, 487.65, 500.95],
    leadLine: [530.17, 578.92, 500.95]
  };
  const DATE_BLANKS = ["empDate", "coordDate", "leadDate"];

  // The table's entry row: id -> [x from, x to]; the Qty. value sits before "TH".
  const ROW = { top: 314.4, bottom: 353.9, baseline: 339 };
  const CELLS = {
    product: [36.1, 227.5],
    commodity: [227.5, 370.75],
    lot: [370.75, 628.6],
    qty: [628.6, 725]
  };

  // "Circle One" choices: [label, x from, x to, baseline].
  const CHOICES = {
    returnReason: [
      ["Bulk Over-Issue", 262.57, 360.08, 396.65],
      ["Component Shortage", 384.63, 511.79, 396.65],
      ["Other", 536.17, 576.88, 396.65]
    ],
    rejectReason: [
      ["Clumpy", 276.32, 324.34, 453.92],
      ["Oily", 345.34, 371.27, 453.92],
      ["Foreign", 392.27, 438.79, 453.92],
      ["Other", 473.79, 514.5, 453.92]
    ]
  };

  const FIELDS = [...Object.keys(BLANKS), ...Object.keys(CELLS)];
  const state = { values: {}, choices: { returnReason: "", rejectReason: "" } };

  function svgText([text, x, base, size, font, end]) {
    const [family, weight] = FONTS[font];
    return `<text x="${x}" y="${base}" font-size="${size}" font-family='${family}' font-weight="${weight}"`
      + ` textLength="${(end - x).toFixed(2)}" lengthAdjust="spacingAndGlyphs">${escapeHtml(text)}</text>`;
  }

  // The table: thin header row, heavy-bordered entry row (as on the form).
  function tableSvg() {
    const cols = [36.1, 227.6, 370.9, 628.6, 755.2];
    return `<g stroke="#000" fill="none">
      <line x1="35.85" y1="258.1" x2="755.45" y2="258.1" stroke-width="0.5"/>
      ${cols.map(x => `<line x1="${x}" y1="258.1" x2="${x}" y2="${ROW.top}" stroke-width="0.5"/>`).join("")}
      <rect x="36.1" y="${ROW.top}" width="719" height="${(ROW.bottom - ROW.top).toFixed(2)}" stroke-width="2.25"/>
      ${[227.5, 370.75, 628.6].map(x => `<line x1="${x}" y1="${ROW.top}" x2="${x}" y2="${ROW.bottom}" stroke-width="2.25"/>`).join("")}
    </g>`;
  }

  function circlesSvg() {
    return Object.entries(CHOICES).map(([group, options]) => {
      const pick = options.find(o => o[0] === state.choices[group]);
      if (!pick) return "";
      const [, x0, x1, base] = pick;
      return `<ellipse cx="${((x0 + x1) / 2).toFixed(2)}" cy="${(base - 4.6).toFixed(2)}" rx="${((x1 - x0) / 2 + 7).toFixed(2)}" ry="11.5"`
        + ` fill="none" stroke="#000" stroke-width="1.5"/>`;
    }).join("");
  }

  // Entries written on the lines (printout only; on screen they're inputs).
  function valuesSvg() {
    const v = id => String(state.values[id] ?? "").trim();
    const text = (s, x, base, anchor = "middle") => s
      ? `<text x="${x.toFixed(2)}" y="${base}" font-size="12" font-family='${SANS}' font-weight="700" text-anchor="${anchor}">${escapeHtml(s)}</text>`
      : "";
    return Object.entries(BLANKS).map(([id, [x0, x1, base]]) => text(v(id), (x0 + x1) / 2, base - 1.5)).join("")
      + Object.entries(CELLS).map(([id, [x0, x1]]) => id === "qty"
        ? text(v(id), x1 - 2, 344.65, "end")
        : text(v(id), (x0 + x1) / 2, ROW.baseline)).join("");
  }

  // The form itself; `.br-circles` and `.br-values` are filled in as it's used.
  function sheetSvg() {
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <image href="assets/pharmavite-logo-qs106a.png" x="43.78" y="37.03" width="53.51" height="62.91"/>
      <g fill="#000">${TEXT.map(svgText).join("")}</g>
      ${tableSvg()}
      <g class="br-circles"></g>
      <g class="br-values"></g>
    </svg>`;
  }

  // The fillable layer on screen: inputs over the blanks and table cells,
  // buttons over the circle-one choices.
  function inputsHtml() {
    const box = (id, x0, x1, top, height, cls = "") =>
      `<input type="text" class="br-input ${cls}" data-field="${id}" autocomplete="off" spellcheck="false"
        style="left:${x0}pt;width:${(x1 - x0).toFixed(2)}pt;top:${top.toFixed(2)}pt;height:${height}pt"
        aria-label="${escapeHtml(LABELS[id])}"${DATE_BLANKS.includes(id) ? ' placeholder="MM/DD/YY"' : ""}>`;
    return Object.entries(BLANKS).map(([id, [x0, x1, base]]) => box(id, x0, x1, base - 14, 15.5)).join("")
      + Object.entries(CELLS).map(([id, [x0, x1]]) => box(id, x0 + 3, x1 - 3, ROW.top + 4, ROW.bottom - ROW.top - 8, id === "qty" ? "br-right" : "")).join("")
      + Object.entries(CHOICES).map(([group, options]) => options.map(([label, x0, x1, base]) =>
        `<button type="button" class="br-choice" data-group="${group}" data-choice="${escapeHtml(label)}"
          style="left:${(x0 - 4).toFixed(2)}pt;width:${(x1 - x0 + 8).toFixed(2)}pt;top:${(base - 15).toFixed(2)}pt;height:20pt"
          title="Circle ${escapeHtml(label)}" aria-pressed="false"></button>`).join("")).join("");
  }

  const LABELS = {
    wo: "W.O. #", empInitials: "PKG Employee Returning (Initials)", empDate: "PKG Employee Returning date",
    empShift: "PKG Employee Returning shift", empLine: "PKG Employee Returning line",
    coordInitials: "PKG Coordinator/Designee (Initials)", coordDate: "PKG Coordinator/Designee date",
    jdeComplete: "JDE Return Complete?", returnOther: "Other reason for the return",
    rejectOther: "Other reason for the rejection", leadInitials: "Lead Verification (Initials)",
    leadDate: "Lead Verification date", leadShift: "Lead Verification shift", leadLine: "Lead Verification line",
    product: "Product Description", commodity: "Bulk Commodity", lot: "Bulk Lot Number", qty: "Qty. Per Container (TH)"
  };

  const sheet = el("brSheet");

  // The printed copy is kept up to date as the form is filled in (not built
  // when printing starts), so its logo has already loaded by then.
  function renderPrintCopy() {
    const copy = el("brPrint");
    copy.querySelector(".br-circles").innerHTML = circlesSvg();
    copy.querySelector(".br-values").innerHTML = valuesSvg();
  }

  function renderCircles() {
    sheet.querySelector(".br-circles").innerHTML = circlesSvg();
    sheet.querySelectorAll(".br-choice").forEach(b =>
      b.setAttribute("aria-pressed", String(state.choices[b.dataset.group] === b.dataset.choice)));
    renderPrintCopy();
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = sheet.querySelector(`[data-field="${id}"]`);
    if (input) input.value = value;
    renderPrintCopy();
  }

  // The sheet keeps the paper form's proportions and shrinks to fit the panel.
  function fitSheet() {
    const wrap = el("brSheetWrap");
    if (!wrap.clientWidth) return;
    const full = 792 * 96 / 72; // 11in in CSS px
    sheet.style.zoom = String(Math.max(0.55, Math.min(1, wrap.clientWidth / full)));
  }

  sheet.innerHTML = sheetSvg() + inputsHtml();
  el("brPrint").innerHTML = `<div class="br-print-page">${sheetSvg()}</div>`;
  new ResizeObserver(fitSheet).observe(el("brSheetWrap"));

  sheet.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    renderPrintCopy();
    // Typing an "Other" reason circles Other.
    if (id === "returnOther" || id === "rejectOther") {
      const group = id === "returnOther" ? "returnReason" : "rejectReason";
      if (e.target.value.trim()) state.choices[group] = "Other";
      renderCircles();
    }
  });
  // An empty date blank starts with today's date.
  sheet.addEventListener("focusin", e => {
    const id = e.target.dataset.field;
    if (DATE_BLANKS.includes(id) && !e.target.value) {
      setValue(id, formatDateMMDDYY(todayISO()));
      e.target.select();
    }
  });
  sheet.addEventListener("click", e => {
    const btn = e.target.closest(".br-choice");
    if (!btn) return;
    const { group, choice } = btn.dataset;
    state.choices[group] = state.choices[group] === choice ? "" : choice;
    renderCircles();
    if (choice === "Other" && state.choices[group] === "Other") {
      sheet.querySelector(`[data-field="${group === "returnReason" ? "returnOther" : "rejectOther"}"]`).focus();
    }
  });

  el("brFillBtn").addEventListener("click", () => {
    const wo = el("woNumber").value.trim();
    const bulk = el("bulkItem").value.trim();
    const returned = el("bulkReturned").value.trim();
    if (!wo && !bulk) {
      showMsg("brMsg", "The Yield Sheet has no W.O. # or Bulk Item yet.", false);
      return;
    }
    if (wo) setValue("wo", wo);
    if (bulk) setValue("commodity", bulk.toUpperCase());
    if (Number(returned) > 0) setValue("qty", returned);
    showMsg("brMsg", `Filled from the Yield Sheet: ${[wo && `W.O. # ${wo}`, bulk && `Bulk Commodity ${bulk.toUpperCase()}`,
      Number(returned) > 0 && `Qty. ${returned} TH`].filter(Boolean).join(", ")}.`);
  });

  el("brClearBtn").addEventListener("click", () => {
    FIELDS.forEach(id => setValue(id, ""));
    state.choices.returnReason = "";
    state.choices.rejectReason = "";
    renderCircles();
    el("brMsg").textContent = "";
  });

  el("brPrintBtn").addEventListener("click", () => window.print());

  const onTab = () => !el("bulkReturnTab").classList.contains("hidden");
  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the Bulk Return form instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (onTab()) document.body.dataset.print = "bulkReturn";
  });
  onViewShown("bulkReturnTab", () => requestAnimationFrame(fitSheet));

  return { state, BLANKS, CELLS, CHOICES };
})();
