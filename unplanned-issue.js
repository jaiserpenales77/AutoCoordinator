// Unplanned Issue tab: the [VALA] Unplanned Issue Request Form (PK007B), drawn
// to the same measurements as the form's PDF (an Excel sheet printed on Letter
// landscape, in pt from the top-left of the page), fitted onto one page: the
// PDF's page 2 holds the rest of its Comments box, which is joined back on.
// On screen the blanks and table cells are fillable; printing gives the page
// with the entries filled in.
// Uses el, escapeHtml, showMsg, todayISO and formatDateMMDDYY from app.js.
const UnplannedIssue = (() => {
  const SANS = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const FONTS = { B: 700, A: 400 };

  // The form's text: [text, x, baseline, size, B = Arial Bold / A = Arial, end x].
  // Each run is stretched to its width on the original.
  const PAGE1_TEXT = [
    ["Date:_________________________________", 56.64, 181.92, 10.1, "B", 263.78],
    ["Pulled By:__________________________", 285.12, 181.92, 10.1, "B", 478.06],
    ["Unplanned Issue", 573.36, 181.92, 10.1, "B", 654.23],
    ["Originated By:______________________", 56.64, 200.64, 10.1, "B", 247.66],
    ["Time Pulled:________________________", 285.12, 200.64, 10.1, "B", 478.04],
    ["Received By:_______________________", 56.64, 221.04, 10.1, "B", 246.48],
    ["Input By:___________________________", 285.12, 221.04, 10.1, "B", 478.08],
    ["Unplanned Issue to Work Order", 573.36, 221.04, 10.1, "B", 724.71],
    ["Part No.", 73.68, 255.12, 10.1, "B", 112.23],
    ["Short Description", 136.56, 255.12, 10.1, "B", 221.14],
    ["Total Qty.", 231.84, 248.64, 10.1, "B", 278.75],
    ["Required", 233.52, 261.6, 10.1, "B", 277.09],
    ["Qty per", 295.2, 248.88, 9.14, "B", 327.04],
    ["Container", 289.92, 260.88, 9.14, "B", 332.34],
    ["Total No. of", 342, 248.88, 9.14, "B", 392.27],
    ["Containers", 343.44, 260.88, 9.14, "B", 390.97],
    ["Partial", 407.76, 248.64, 10.1, "B", 438.39],
    ["Qty.", 413.28, 261.6, 10.1, "B", 432.87],
    ["Actual", 463.68, 248.64, 10.1, "B", 494.08],
    ["Qty.", 469.2, 261.6, 10.1, "B", 488.79],
    ["Lot #", 527.04, 255.12, 10.1, "B", 551.35],
    ["Location", 582.72, 248.64, 10.1, "B", 624.85],
    ["From", 591.36, 261.6, 10.1, "B", 616.64],
    ["Work Order #", 651.6, 255.12, 10.1, "B", 715.23],
    ["Comments:", 67.68, 535.44, 9.14, "B", 118.19],
    ["[VALA] Unplanned Issue Request Form", 243.84, 124.56, 16.11, "B", 542.18],
    ["Page 1", 379.92, 572.16, 10.1, "A", 411.68]
  ];
  const PAGE2_TEXT = [
    ["(Line #)", 75.6, 85.2, 10.08, "A", 109.66],
    ["PK007B", 56.16, 124.32, 7.92, "B", 85.62],
    ["Page 2", 379.68, 571.92, 10.08, "A", 411.43]
  ];
  // Borders: [x, y, width, height] filled black (the PDF draws every line as a thin box).
  const PAGE1_LINES = [
    [54.24, 165.36, 0.96, 66.24],
    [282.72, 166.32, 0.96, 65.28],
    [506.4, 166.32, 0.96, 65.28],
    [730.08, 166.32, 0.96, 65.28],
    [55.2, 520.08, 74.64, 0.96],
    [129.84, 237.36, 0.96, 282.24],
    [730.08, 237.36, 0.96, 282.24],
    [54.24, 236.4, 0.96, 302.88],
    [282.72, 237.36, 0.96, 282.24],
    [506.4, 237.36, 0.96, 282.24],
    [730.08, 521.52, 0.96, 18],
    [129.84, 521.52, 0.96, 18],
    [226.8, 237.36, 0.96, 282.24],
    [338.64, 237.36, 0.96, 282.24],
    [394.56, 237.36, 0.96, 282.24],
    [450.48, 237.36, 0.96, 282.24],
    [570.96, 237.36, 0.96, 282.24],
    [635.52, 237.36, 0.96, 282.24],
    [55.2, 165.36, 675.84, 0.96],
    [507.36, 184.32, 64.32, 0.96],
    [507.36, 223.44, 64.32, 0.96],
    [55.2, 230.64, 675.84, 0.96],
    [55.2, 236.4, 675.84, 0.96],
    [55.2, 265.68, 675.84, 0.96],
    [55.2, 291.12, 675.84, 0.96],
    [55.2, 316.56, 675.84, 0.96],
    [55.2, 342, 675.84, 0.96],
    [55.2, 367.44, 675.84, 0.96],
    [55.2, 392.88, 675.84, 0.96],
    [55.2, 418.32, 675.84, 0.96],
    [55.2, 443.76, 675.84, 0.96],
    [55.2, 469.2, 675.84, 0.96],
    [55.2, 494.64, 675.84, 0.96],
    [129.84, 519.6, 601.2, 1.92]
  ];
  const PAGE2_LINES = [
    [54, 72.48, 0.96, 37.44],
    [129.6, 72, 0.96, 37.92],
    [729.84, 72, 0.96, 37.92],
    [54.96, 108.96, 675.84, 0.96]
  ];
  // Dashed comment lines: [x from, x to, y]; 2.88 pt dashes every 3.84 pt.
  const PAGE1_DASHES = [[131.28, 730.56, 538.56]];
  const PAGE2_DASHES = [[131.04, 730.32, 72], [131.04, 730.32, 90.48]];

  // One page: the PDF's page 2 joins page 1 where the Comments box continues
  // (page 2's top dashed line is page 1's last one, and its x positions run
  // 0.24 pt left), and everything but the "Page 1" footer moves up 36 pt into
  // the top margin to make room. Sizes are unchanged.
  const UP = 36;
  const P2_DOWN = 538.56 - 72, P2_RIGHT = 0.24;
  const up = y => +(y - UP).toFixed(2);
  const p2 = y => up(y + P2_DOWN);
  const TEXT = [
    ...PAGE1_TEXT.map(([s, x, b, ...rest]) => [s, x, s === "Page 1" ? b : up(b), ...rest]),
    ...PAGE2_TEXT.filter(t => t[0] !== "Page 2").map(([s, x, b, size, font, end]) => [s, x + P2_RIGHT, p2(b), size, font, end + P2_RIGHT])
  ];
  const LINES = [
    ...PAGE1_LINES.map(([x, y, w, h]) => [x, up(y), w, h]),
    ...PAGE2_LINES.map(([x, y, w, h]) => [+(x + P2_RIGHT).toFixed(2), p2(y), w, h])
  ];
  const DASHES = [
    ...PAGE1_DASHES.map(([x0, x1, y]) => [x0, x1, up(y)]),
    ...PAGE2_DASHES.slice(1).map(([x0, x1, y]) => [x0 + P2_RIGHT, x1 + P2_RIGHT, p2(y)])
  ];

  // Header blanks: id -> [x from, x to, baseline] of their underscores.
  const BLANKS = {
    date: [81.48, 263.78, 181.92],
    originatedBy: [125.47, 247.66, 200.64],
    receivedBy: [119.16, 246.48, 221.04],
    pulledBy: [333.89, 478.06, 181.92],
    timePulled: [344.59, 478.04, 200.64],
    inputBy: [328.34, 478.08, 221.04]
  };
  Object.values(BLANKS).forEach(b => { b[2] = up(b[2]); });
  const BLANK_LABELS = {
    date: "Date", originatedBy: "Originated By", receivedBy: "Received By",
    pulledBy: "Pulled By", timePulled: "Time Pulled", inputBy: "Input By"
  };
  // The two issue types, marked with an X on their line: [label, line from, line to, label end, baseline].
  const TYPES = [
    ["Unplanned Issue", 507.36, 571.68, 654.23, 181.92],
    ["Unplanned Issue to Work Order", 507.36, 571.68, 724.71, 221.04]
  ];
  TYPES.forEach(t => { t[4] = up(t[4]); });

  // The table: 10 columns between these lines, 10 rows of 25.44 pt.
  const COLS = [
    ["part", "Part No."], ["description", "Short Description"], ["totalQty", "Total Qty. Required"],
    ["qtyPerContainer", "Qty per Container"], ["containers", "Total No. of Containers"],
    ["partialQty", "Partial Qty."], ["actualQty", "Actual Qty."], ["lot", "Lot #"],
    ["location", "Location From"], ["workOrder", "Work Order #"]
  ];
  const COL_X = [54.24, 129.84, 226.8, 282.72, 338.64, 394.56, 450.48, 506.4, 570.96, 635.52, 730.08];
  const ROW_Y = [265.68, 291.12, 316.56, 342, 367.44, 392.88, 418.32, 443.76, 469.2, 494.64, 519.6].map(up);
  const ROWS = ROW_Y.length - 1;
  const WORK_ORDER_COL = 9;

  // Comment lines: [x from, x to, top, bottom]; the last two from the PDF's page 2.
  const COMMENTS = [
    [131.28, 729.6, up(521.52), up(538.56)],
    [131.28, 729.6, p2(72.96), p2(90.48)],
    [131.28, 729.6, p2(91.44), p2(108.96)]
  ];

  const state = { values: {}, type: "" };
  const cellId = (row, col) => `r${row}_${COLS[col][0]}`;

  function svgText([text, x, base, size, font, end]) {
    return `<text x="${x}" y="${base}" font-size="${size}" font-weight="${FONTS[font]}"`
      + ` textLength="${(end - x).toFixed(2)}" lengthAdjust="spacingAndGlyphs">${escapeHtml(text)}</text>`;
  }

  function pageSvg() {
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <image href="assets/pharmavite-logo-pk007b.jpg" x="54" y="${up(79.44)}" width="133.92" height="68.88" preserveAspectRatio="none"/>
      <g fill="#000" font-family='${SANS}'>${TEXT.map(svgText).join("")}</g>
      <g fill="#000">${LINES.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join("")}</g>
      <g stroke="#000" stroke-width="0.96" stroke-dasharray="2.88 0.96">${DASHES.map(([x0, x1, y]) =>
        `<line x1="${x0}" y1="${y + 0.48}" x2="${x1}" y2="${y + 0.48}"/>`).join("")}</g>
      <g class="up-values" fill="#000" font-family='${SANS}' font-weight="700"></g>
    </svg>`;
  }

  // Shrinks an entry that's wider than its space.
  const measureCtx = document.createElement("canvas").getContext("2d");
  function fitSize(text, size, room) {
    measureCtx.font = `700 ${size}pt Arial, "Liberation Sans", Helvetica, sans-serif`;
    const width = measureCtx.measureText(text).width * 0.75; // px to pt
    return width > room ? Math.max(5, size * room / width) : size;
  }

  function textAt(s, x, base, size, anchor, room) {
    if (!s) return "";
    const fit = fitSize(s, size, room);
    return `<text x="${x.toFixed(2)}" y="${base.toFixed(2)}" font-size="${fit.toFixed(2)}" text-anchor="${anchor}">${escapeHtml(s)}</text>`;
  }

  // A table entry, centred in its cell; one too long for a readable single line
  // wraps onto two.
  function cellText(s, cx, top, bottom, room) {
    if (!s) return "";
    const mid = (top + bottom) / 2;
    const size = 9.5;
    if (fitSize(s, size, room) >= 7.5 || !s.includes(" ")) return textAt(s, cx, mid + 3.4, size, "middle", room);
    const words = s.split(/\s+/);
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const fit = Math.min(...lines.map(l => fitSize(l, size, room)));
      if (!best || fit > best.fit) best = { lines, fit };
    }
    const lineH = best.fit * 1.12;
    const first = mid - lineH / 2 + best.fit * 0.3;
    return best.lines.map((line, i) =>
      `<text x="${cx.toFixed(2)}" y="${(first + i * lineH).toFixed(2)}" font-size="${best.fit.toFixed(2)}" text-anchor="middle">${escapeHtml(line)}</text>`).join("");
  }

  const typeMark = () => TYPES.filter(t => t[0] === state.type)
    .map(([, x0, x1, , base]) => textAt("X", (x0 + x1) / 2, base, 11, "middle", 60)).join("");

  // The entries, written onto the form (printout only; on screen they're inputs).
  function valuesSvg() {
    const v = id => String(state.values[id] ?? "").trim();
    let out = Object.entries(BLANKS).map(([id, [x0, x1, base]]) => textAt(v(id), x0 + 4, base - 1.5, 10, "start", x1 - x0 - 6)).join("");
    out += typeMark();
    for (let row = 0; row < ROWS; row++) {
      COLS.forEach((c, col) => {
        const x0 = COL_X[col] + 0.96, x1 = COL_X[col + 1];
        out += cellText(v(cellId(row, col)), (x0 + x1) / 2, ROW_Y[row] + 0.96, ROW_Y[row + 1], x1 - x0 - 4);
      });
    }
    out += COMMENTS.map(([x0, x1, , bottom], i) => textAt(v(`comment${i}`), x0 + 3, bottom - 4, 10, "start", x1 - x0 - 6)).join("");
    return out;
  }

  // The fillable layer on screen.
  function inputsHtml() {
    const box = (id, label, x0, x1, top, height, cls) =>
      `<input type="text" class="br-input ${cls}" data-field="${id}" autocomplete="off" spellcheck="false"
        style="left:${x0.toFixed(2)}pt;width:${(x1 - x0).toFixed(2)}pt;top:${top.toFixed(2)}pt;height:${height.toFixed(2)}pt"
        aria-label="${escapeHtml(label)}"${id === "date" ? ' placeholder="MM/DD/YY"' : ""}>`;
    let out = Object.entries(BLANKS).map(([id, [x0, x1, base]]) => box(id, BLANK_LABELS[id], x0, x1, base - 12.5, 14, "up-left")).join("");
    out += TYPES.map(([label, x0, , end, base]) =>
      `<button type="button" class="br-choice up-type" data-type="${escapeHtml(label)}"
        style="left:${(x0 - 2).toFixed(2)}pt;width:${(end - x0 + 6).toFixed(2)}pt;top:${(base - 13).toFixed(2)}pt;height:17pt"
        title="Mark ${escapeHtml(label)}" aria-pressed="false"></button>`).join("");
    for (let row = 0; row < ROWS; row++) {
      const top = ROW_Y[row] + 3, height = ROW_Y[row + 1] - ROW_Y[row] - 5;
      out += `<span class="up-rownum" style="top:${(top + 5).toFixed(2)}pt">${row + 1}</span>`;
      COLS.forEach(([, label], col) => {
        out += box(cellId(row, col), `Line ${row + 1} ${label}`, COL_X[col] + 3, COL_X[col + 1] - 2, top, height, "up-cell");
      });
    }
    out += COMMENTS.map(([x0, x1, top, bottom], i) =>
      box(`comment${i}`, `Comments line ${i + 1}`, x0, x1, top + 1, bottom - top - 2, "up-left")).join("");
    return out;
  }

  const tab = el("unplannedTab");
  const sheet = el("upSheet");
  const copy = el("upPrintPage");

  // The printed copy is kept up to date as the form is filled in (not built
  // when printing starts), so its logo has already loaded by then.
  function renderValues() {
    copy.querySelector(".up-values").innerHTML = valuesSvg();
    sheet.querySelector(".up-values").innerHTML = typeMark();
    sheet.querySelectorAll(".up-type").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.type === state.type)));
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = tab.querySelector(`[data-field="${id}"]`);
    if (input) input.value = value;
  }

  // The sheet keeps the paper form's proportions and shrinks to fit the panel.
  function fitSheets() {
    const wrap = el("upSheetWrap");
    if (!wrap.clientWidth) return;
    const zoom = String(Math.max(0.55, Math.min(1, wrap.clientWidth / (792 * 96 / 72))));
    sheet.style.zoom = zoom;
  }

  sheet.innerHTML = pageSvg() + inputsHtml();
  copy.innerHTML = pageSvg();
  new ResizeObserver(fitSheets).observe(el("upSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    renderValues();
  });
  // An empty Date blank starts with today's date.
  tab.addEventListener("focusin", e => {
    if (e.target.dataset.field === "date" && !e.target.value) {
      setValue("date", formatDateMMDDYY(todayISO()));
      renderValues();
      e.target.select();
    }
  });
  tab.addEventListener("click", e => {
    const btn = e.target.closest(".up-type");
    if (!btn) return;
    state.type = state.type === btn.dataset.type ? "" : btn.dataset.type;
    renderValues();
  });

  el("upFillBtn").addEventListener("click", () => {
    const wo = el("woNumber").value.trim();
    if (!wo) {
      showMsg("upMsg", "The Yield Sheet has no W.O. # yet.", false);
      return;
    }
    // The Work Order # goes on every line with a Part No., or line 1 if none has one.
    const used = [...Array(ROWS).keys()].filter(r => String(state.values[cellId(r, 0)] ?? "").trim());
    const lines = used.length ? used : [0];
    lines.forEach(r => setValue(cellId(r, WORK_ORDER_COL), wo));
    renderValues();
    showMsg("upMsg", `Filled Work Order # ${wo} on line${lines.length > 1 ? "s" : ""} ${lines.map(r => r + 1).join(", ")}.`);
  });

  el("upClearBtn").addEventListener("click", () => {
    tab.querySelectorAll("[data-field]").forEach(i => { i.value = ""; });
    state.values = {};
    state.type = "";
    renderValues();
    el("upMsg").textContent = "";
  });

  el("upPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the form instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "unplanned";
  });
  document.querySelector('[data-tab="unplannedTab"]').addEventListener("click", () => requestAnimationFrame(fitSheets));

  renderValues();
  return { state, cellId, COLS, ROWS };
})();
