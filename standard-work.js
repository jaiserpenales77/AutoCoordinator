// Standard Work tab: the two-sided "Team Lead Standard Work" sheet (front) and
// "Steady State Tasks & Habits" (back). Each side is the original scan,
// straightened and cleaned up (assets/standard-work-*.png), on a Letter
// landscape page; positions below are in pt from the page's top-left,
// measured on those scans. On screen the blanks are inputs and the boxes tick
// when clicked; printing gives both sides with the entries written in.
// Uses el, escapeHtml, showMsg, todayISO, formatDateMMDDYY, getCreatedBy and
// currentUser/StoredData from app.js.
const StandardWork = (() => {
  const SANS = `Calibri, Carlito, Arial, "Liberation Sans", sans-serif`;

  // Written-in blanks: id -> [side, x from, x to, baseline, size, label].
  const TEXT_FIELDS = {
    leadName: ["front", 140, 414, 75, 13, "Lead Name"],
    line: ["front", 446, 515, 75, 13, "Line"],
    shift: ["front", 548, 616, 75, 13, "Shift"],
    date: ["front", 649, 742, 75, 13, "Date"],
    initials1: ["front", 106.3, 162.7, 162, 13, "Initials: I followed the shift startup timeline"],
    initials2: ["front", 106.3, 162.7, 220.5, 13, "Initials: I informed my team of our rotation & stretching schedule"],
    wo1: ["back", 497, 600, 314.5, 12, "Video Jet WO1 (first)"],
    count1: ["back", 650, 722, 314.5, 12, "Video Jet count (first)"],
    wo2: ["back", 497, 600, 331, 12, "Video Jet WO1 (second)"],
    count2: ["back", 650, 722, 331, 12, "Video Jet count (second)"],
    untilYes: ["back", 202, 215, 520.4, 9, "Yes: remain on line until ## : 25"],
    untilNo: ["back", 657.5, 670.5, 520.4, 9, "No: remain on line until ## : 25"]
  };
  // The printed "##" an entry replaces (whited out under it): id -> [x0, y0, x1, y1].
  const COVERS = {
    untilYes: [203.4, 510.5, 213.4, 522],
    untilNo: [659.1, 510.5, 669.1, 522]
  };
  const DATE_FIELDS = ["date"];

  // Boxes written in (the 4X / 8X rotation times): id -> [side, x0, y0, x1, y1, label].
  const BOX_FIELDS = {
    rot4_1: ["front", 162.96, 284.88, 219.84, 321.12, "4X ROT box 1"],
    rot4_2: ["front", 220.08, 284.88, 276.96, 321.12, "4X ROT box 2"],
    rot4_3: ["front", 276.96, 284.88, 333.36, 321.12, "4X ROT box 3"],
    rot4_4: ["front", 333.6, 284.88, 389.76, 321.12, "4X ROT box 4"],
    rot8_1: ["front", 503.04, 284.88, 559.68, 320.88, "8X ROT box 1"],
    rot8_2: ["front", 559.92, 284.88, 617.52, 320.88, "8X ROT box 2"],
    rot8_3: ["front", 617.76, 284.88, 674.88, 320.88, "8X ROT box 3"],
    rot8_4: ["front", 675.12, 284.88, 731.52, 320.88, "8X ROT box 4"]
  };

  // Boxes ticked by clicking: id -> [side, x0, y0, x1, y1, label]. Each click
  // cycles tick -> N/A -> empty.
  const CHECKS = {
    rotStandard: ["front", 49.68, 237.6, 105.84, 273.84, "Standard 4x ROT - 2 HRs"],
    rotDumping: ["front", 219.84, 237.6, 276.72, 273.84, "Dumping 8x ROT - 1 HR"],
    rotDesByHand: ["front", 390, 237.6, 445.92, 273.84, "Des by Hand 8x ROT - 1 HR"],
    rotHeavy: ["front", 559.68, 237.6, 617.52, 273.84, "Heavy Bottles 8x ROT - 1 HR"],
    stretchStart: ["front", 106.32, 331.68, 162.72, 367.2, "Stretch: start up"],
    stretch1: ["front", 277.2, 331.68, 333.6, 366.96, "Stretch: 1st break"],
    stretchLunch: ["front", 446.4, 331.44, 502.8, 366.96, "Stretch: lunch"],
    stretch2: ["front", 617.76, 331.2, 675.36, 366.96, "Stretch: 2nd break"],
    pdQuality: ["front", 106.32, 436.8, 162.96, 465.6, "Passdown: quality issues"],
    pdMaint: ["front", 106.32, 480.24, 162.72, 504.72, "Passdown: maintenance issues"],
    mdiHourly: ["front", 390.24, 436.8, 446.16, 465.6, "MDI board: hourly comments"],
    mdiBtls: ["front", 390, 480.24, 446.16, 504.72, "MDI board: total BTLs"],
    mdiDowntime: ["front", 560.16, 436.8, 618, 465.6, "MDI board: total downtime"],
    mdiRco: ["front", 559.92, 480, 618, 504.72, "MDI board: RCO stickers added"],
    pit: ["back", 108.72, 69.6, 165.6, 94.56, "P.I.T. preinspections done"],
    capper: ["back", 108.72, 109.92, 165.36, 135.36, "5-S: capper cabinet"],
    trouble: ["back", 108.48, 150.72, 165.36, 176.16, "Troubleshooting sheet (check or N/A)"],
    washroom: ["back", 108.24, 191.52, 165.12, 216, "Washroom cart checklist"],
    merrill: ["back", 108.48, 231.12, 165.12, 255.84, "Check Merrill filler alignment"],
    hoist: ["back", 449.28, 69.36, 505.68, 94.08, "Hoist inspection done"],
    casePacker: ["back", 449.28, 109.68, 505.44, 135.12, "5-S: case packer cabinet"],
    nextWo: ["back", 449.04, 150.48, 505.44, 175.68, "Check next work order"],
    labelCage: ["back", 449.04, 191.28, 505.2, 215.76, "Check for next label cage"],
    nutsBolts: ["back", 449.04, 230.88, 505.2, 255.84, "Check for loose nuts & bolts"]
  };
  const YES_ROWS = ["In person info share", "Basic cleaning of line", "Discuss C/O prep", "Shift MDI board review mtg", "Remain on line until ##:25"];
  const NO_A_ROWS = ["Bulk bag not hanging", "No vitamins in hopper", "Plastic covering over filler", "Bottles have caps, labels & packed", "Line & utility are cleaned"];
  const NO_B_ROWS = ["Batch record review", "Label cage locked", "Written notes for next shift", "Shift MDI board review mtg", "Remain on line until ##:25"];
  const ROW_Y = [396, 422.64, 449.52, 476.4, 503.28, 529.8];
  ROW_Y.slice(0, 5).forEach((y, i) => {
    CHECKS[`yes${i}`] = ["back", 52.2, y, 108.3, ROW_Y[i + 1], `Yes: ${YES_ROWS[i]}`];
    CHECKS[`noA${i}`] = ["back", 280, y, 336.2, ROW_Y[i + 1], `No: ${NO_A_ROWS[i]}`];
    CHECKS[`noB${i}`] = ["back", 505.1, y, 562, ROW_Y[i + 1], `No: ${NO_B_ROWS[i]}`];
  });

  // The comments box on the back: [x0, y0, x1, y1].
  const COMMENTS = [88, 298, 444, 341];
  const COMMENT_SIZE = 11;

  const IMAGES = { front: "assets/standard-work-front.png", back: "assets/standard-work-back.png" };
  const state = { values: {}, checks: {} };

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `700 ${size}pt ${SANS}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  const fitSize = (s, size, room) => Math.max(6, Math.min(size, size * room / Math.max(1, widthPt(s, size))));
  const text = (s, x, base, size, anchor) =>
    `<text x="${x.toFixed(2)}" y="${base.toFixed(2)}" font-size="${size.toFixed(2)}" text-anchor="${anchor}">${escapeHtml(s)}</text>`;

  // A tick drawn as a path (no font needed), or "N/A", inside a box.
  function checkMark(id) {
    const [, x0, y0, x1, y1] = CHECKS[id];
    const v = state.checks[id];
    if (!v) return "";
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = Math.min(x1 - x0, y1 - y0) * 0.36;
    if (v === "na") return text("N/A", cx, cy + 5, 14, "middle");
    return `<path d="M${(cx - s).toFixed(2)} ${(cy + s * 0.05).toFixed(2)} L${(cx - s * 0.3).toFixed(2)} ${(cy + s * 0.7).toFixed(2)} L${(cx + s * 1.05).toFixed(2)} ${(cy - s * 0.8).toFixed(2)}"`
      + ` fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  // Comments wrap within the box, shrinking if they don't fit its lines.
  function commentLines(s) {
    const [x0, , x1, ] = COMMENTS;
    const room = x1 - x0 - 4;
    for (let size = COMMENT_SIZE; ; size -= 0.5) {
      const lines = [];
      for (const para of s.split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (line && widthPt(next, size) > room) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }
      if (lines.length * size * 1.2 <= COMMENTS[3] - COMMENTS[1] || size <= 6) return { size, lines };
    }
  }

  // Everything written onto one side (the printout; on screen only the ticks,
  // since the rest are inputs).
  function valuesSvg(side, printed) {
    const v = id => String(state.values[id] ?? "").trim();
    let out = Object.keys(CHECKS).filter(id => CHECKS[id][0] === side).map(checkMark).join("");
    if (!printed) return out;
    for (const [id, [s, x0, x1, base, size]] of Object.entries(TEXT_FIELDS)) {
      if (s !== side || !v(id)) continue;
      if (COVERS[id]) {
        const [cx0, cy0, cx1, cy1] = COVERS[id];
        out += `<rect x="${cx0}" y="${cy0}" width="${(cx1 - cx0).toFixed(2)}" height="${(cy1 - cy0).toFixed(2)}" fill="#fff"/>`;
      }
      out += text(v(id), (x0 + x1) / 2, base - 1.5, fitSize(v(id), size, x1 - x0), "middle");
    }
    for (const [id, [s, x0, y0, x1, y1]] of Object.entries(BOX_FIELDS)) {
      if (s !== side || !v(id)) continue;
      out += text(v(id), (x0 + x1) / 2, (y0 + y1) / 2 + 5, fitSize(v(id), 14, x1 - x0 - 6), "middle");
    }
    if (side === "back" && v("comments")) {
      const { size, lines } = commentLines(v("comments"));
      lines.forEach((line, i) => { if (line) out += text(line, COMMENTS[0] + 2, COMMENTS[1] + size * (1.2 * i + 1), size, "start"); });
    }
    return out;
  }

  function sideSvg(side) {
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <image href="${IMAGES[side]}" x="0" y="0" width="792" height="612" preserveAspectRatio="none"/>
      <g class="sw-values" fill="#000" font-family='${SANS}' font-weight="700"></g>
    </svg>`;
  }

  function inputsHtml(side) {
    const at = (x0, y0, x1, y1) => `left:${x0.toFixed(2)}pt;top:${y0.toFixed(2)}pt;width:${(x1 - x0).toFixed(2)}pt;height:${(y1 - y0).toFixed(2)}pt`;
    let out = "";
    for (const [id, [s, x0, x1, base, size, label]] of Object.entries(TEXT_FIELDS)) {
      if (s !== side) continue;
      out += `<input type="text" class="br-input sw-input" data-field="${id}" autocomplete="off" spellcheck="false"
        style="${at(x0, base - size - 3, x1, base + 2)};font-size:${size}pt" aria-label="${escapeHtml(label)}"${DATE_FIELDS.includes(id) ? ' placeholder="MM/DD/YY"' : COVERS[id] ? ' placeholder="##"' : ""}>`;
    }
    for (const [id, [s, x0, y0, x1, y1, label]] of Object.entries(BOX_FIELDS)) {
      if (s !== side) continue;
      out += `<input type="text" class="br-input sw-input" data-field="${id}" autocomplete="off" spellcheck="false"
        style="${at(x0 + 2, y0 + 2, x1 - 2, y1 - 2)};font-size:14pt" aria-label="${escapeHtml(label)}">`;
    }
    for (const [id, [s, x0, y0, x1, y1, label]] of Object.entries(CHECKS)) {
      if (s !== side) continue;
      out += `<button type="button" class="br-choice sw-check" data-check="${id}" style="${at(x0, y0, x1, y1)}"
        title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="false"></button>`;
    }
    if (side === "back") {
      const [x0, y0, x1, y1] = COMMENTS;
      out += `<textarea class="br-input sw-input sw-comments" data-field="comments" spellcheck="true"
        style="${at(x0, y0, x1, y1)};font-size:${COMMENT_SIZE}pt" aria-label="Comments from you that you think are important"></textarea>`;
    }
    return out;
  }

  const tab = el("swTab");
  const sheets = { front: el("swFront"), back: el("swBack") };
  const copies = { front: el("swPrintFront"), back: el("swPrintBack") };

  // The printed copies are kept up to date as the sheet is filled in, so
  // they're ready (images loaded) whenever printing starts.
  function render() {
    for (const side of ["front", "back"]) {
      copies[side].querySelector(".sw-values").innerHTML = valuesSvg(side, true);
      sheets[side].querySelector(".sw-values").innerHTML = valuesSvg(side, false);
    }
    tab.querySelectorAll(".sw-check").forEach(b => b.setAttribute("aria-pressed", String(!!state.checks[b.dataset.check])));
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = tab.querySelector(`[data-field="${id}"]`);
    if (input) input.value = value;
  }

  function fitSheets() {
    const wrap = el("swSheetWrap");
    if (!wrap.clientWidth) return;
    const zoom = String(Math.max(0.55, Math.min(1, wrap.clientWidth / (792 * 96 / 72))));
    Object.values(sheets).forEach(s => { s.style.zoom = zoom; });
  }

  for (const side of ["front", "back"]) {
    sheets[side].innerHTML = sideSvg(side) + inputsHtml(side);
    copies[side].innerHTML = sideSvg(side);
  }
  new ResizeObserver(fitSheets).observe(el("swSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    render();
  });
  // An empty Date starts with today's date.
  tab.addEventListener("focusin", e => {
    const id = e.target.dataset.field;
    if (DATE_FIELDS.includes(id) && !e.target.value) {
      setValue(id, formatDateMMDDYY(todayISO()));
      render();
      e.target.select();
    }
  });
  tab.addEventListener("click", e => {
    const btn = e.target.closest(".sw-check");
    if (!btn) return;
    const id = btn.dataset.check;
    const now = state.checks[id];
    state.checks[id] = now === "check" ? "na" : now === "na" ? "" : "check";
    render();
  });

  el("swFillBtn").addEventListener("click", () => {
    const lead = getCreatedBy() || (currentUser && StoredData.leadForUser(currentUser)) || "";
    const wo = el("woNumber").value.trim();
    const vj = String(el("videoJetCount").value ?? "").trim();
    const filled = [];
    if (lead) { setValue("leadName", lead); filled.push(`Lead Name ${lead}`); }
    if (!state.values.date) { setValue("date", formatDateMMDDYY(todayISO())); filled.push("today's date"); }
    if (wo) { setValue("wo1", wo); filled.push(`WO1 ${wo}`); }
    if (wo && vj) { setValue("count1", vj); filled.push(`Video Jet count ${vj}`); }
    render();
    showMsg("swMsg", filled.length ? `Filled ${filled.join(", ")}.` : "Nothing to fill from the Yield Sheet yet.", filled.length > 0);
  });

  el("swClearBtn").addEventListener("click", () => {
    tab.querySelectorAll("[data-field]").forEach(i => { i.value = ""; });
    state.values = {};
    state.checks = {};
    render();
    el("swMsg").textContent = "";
  });

  el("swPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // both sides instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "standardWork";
  });
  document.querySelector('[data-tab="swTab"]').addEventListener("click", () => requestAnimationFrame(fitSheets));

  render();
  return { state, CHECKS, TEXT_FIELDS, BOX_FIELDS };
})();
