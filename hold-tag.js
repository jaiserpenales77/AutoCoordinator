// HOLD TAG tab: the QA263C [ALL] QA Hold Tag, drawn to the same measurements
// as the tag's PDF (Letter landscape, in pt from the top-left of the page; a
// red page with a Word table in Calibri). On screen the value cells are
// fillable; printing gives the tag with the entries written in.
// Uses el, escapeHtml, showMsg, todayISO and formatDateMMDDYY from app.js.
const HoldTag = (() => {
  const CALIBRI = `Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  const RED = "#ff0000";

  // The tag's text: [text, x, baseline, size, B = Calibri Bold / A = Calibri, end x].
  // Each run is stretched to its width on the original.
  const TEXT = [
    ["HOLD", 284.28, 130.56, 100.02, "B", 520.28],
    ["Item #:", 41.64, 178.92, 22.02, "B", 106.09],
    ["NCCAPA #:______________", 425.4, 178.92, 22.02, "B", 677.04],
    ["Work Order/Lot #:", 41.64, 219.72, 22.02, "A", 206.49],
    ["Tote/Pallet #:", 425.4, 219.72, 22.02, "A", 546.77],
    ["Reason/Comment:", 41.64, 341.04, 22.02, "A", 209.68],
    ["Date:", 41.64, 467.88, 22.02, "A", 89.98],
    ["Shift:", 222.16, 467.88, 22.02, "A", 268.92],
    ["Held By:", 392.48, 467.88, 22.02, "A", 466.54],
    ["DL Init:", 573.56, 467.88, 22.02, "A", 636.76],
    ["QA263C", 36, 572.76, 12, "A", 75.64],
    ["For Pharmavite internal use, only.", 283.98, 572.76, 12, "A", 448.7],
    ["QAGN-0193", 612, 572.76, 12, "A", 670.28]
  ];
  const WEIGHT = { B: 700, A: 400 };

  // Table borders, 0.48 pt: horizontal [x from, x to, y] and vertical [x, y from, y to].
  const H_LINES = [
    [36, 760.44, 34.92], [36, 760.44, 157.44], [36, 760.44, 198.24],
    [36, 760.44, 319.62], [36, 760.44, 440.94], [36, 760.44, 492.72]
  ];
  const V_LINES = [
    [36, 34.92, 493.2], [759.96, 34.92, 493.2],
    [216.54, 157.44, 440.94], [419.76, 157.44, 319.62], [553.26, 198.24, 319.62],
    [95.1, 440.94, 493.2], [216.54, 440.94, 493.2], [274.26, 440.94, 493.2], [386.88, 440.94, 493.2],
    [472.26, 440.94, 493.2], [567.96, 440.94, 493.2], [643.26, 440.94, 493.2]
  ];

  // Fill-in areas: id -> [x from, x to, top, bottom, first baseline, lines, label].
  // One-line fields sit on their label's baseline; the tall cells take
  // several lines.
  const FIELDS = {
    item: [219.5, 417.5, 158.4, 197.8, 178.92, 1, "Item #"],
    nccapa: [524, 677.04, 160, 182, 176.4, 1, "NCCAPA #"],
    workOrder: [219.5, 417.5, 199.2, 319.1, 219.72, 4, "Work Order/Lot #"],
    tote: [556, 757.5, 199.2, 319.1, 219.72, 4, "Tote/Pallet #"],
    reason: [219.5, 757.5, 320.6, 440.4, 341.04, 4, "Reason/Comment"],
    date: [97.5, 214, 441.9, 492.2, 467.88, 1, "Date"],
    shift: [276.5, 384.5, 441.9, 492.2, 467.88, 1, "Shift"],
    heldBy: [474.5, 565.5, 441.9, 492.2, 467.88, 1, "Held By"],
    dlInit: [645.5, 757.5, 441.9, 492.2, 467.88, 1, "DL Init"]
  };
  const VALUE_SIZE = 20;
  // Work Order/Lot #, Tote/Pallet # and Reason/Comment: large text, centred
  // in the box, shrinking only as much as needed to fit.
  const BIG_SIZE = 34;
  const BIG_LEADING = 1.15;
  const PAD = 3; // pt each side, as on the screen boxes

  const state = { values: {} };

  function svgText([text, x, base, size, font, end]) {
    return `<text x="${x}" y="${base}" font-size="${size}" font-weight="${WEIGHT[font]}"`
      + ` textLength="${(end - x).toFixed(2)}" lengthAdjust="spacingAndGlyphs">${escapeHtml(text)}</text>`;
  }

  function tagSvg() {
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="792" height="612" fill="${RED}"/>
      <image href="assets/pharmavite-logo-qa263c.png" x="59.65" y="41.66" width="88.95" height="88.95"/>
      <g fill="#000" font-family='${CALIBRI}'>${TEXT.map(svgText).join("")}</g>
      <g fill="#000">
        ${H_LINES.map(([x0, x1, y]) => `<rect x="${x0}" y="${y}" width="${(x1 - x0).toFixed(2)}" height="0.48"/>`).join("")}
        ${V_LINES.map(([x, y0, y1]) => `<rect x="${x}" y="${y0}" width="0.48" height="${(y1 - y0).toFixed(2)}"/>`).join("")}
      </g>
      <g class="hold-values" fill="#000" font-family='${CALIBRI}' font-weight="700"></g>
    </svg>`;
  }

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `700 ${size}pt ${CALIBRI}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };

  // Word-wraps an entry to the field's width, shrinking it until it fits the
  // field's lines.
  function wrap(text, size, room) {
    const lines = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && widthPt(next, size) > room) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  // A one-line entry, shrunk if it's wider than its box.
  function layoutLine(text, room) {
    for (let size = VALUE_SIZE; ; size -= 1) {
      if (widthPt(text, size) <= room || size <= 8) return size;
    }
  }

  // A multi-line entry: the largest size whose wrapped lines fit the box.
  function layoutBig(text, room, height) {
    for (let size = BIG_SIZE; ; size -= 1) {
      const lines = wrap(text, size, room);
      const gap = size * BIG_LEADING;
      const fits = lines.length * gap <= height && lines.every(l => widthPt(l, size) <= room);
      if (fits || size <= 8) return { size, gap, lines };
    }
  }

  const isBig = id => FIELDS[id][5] > 1;
  const bigBox = id => {
    const [x0, x1, top, bottom] = FIELDS[id];
    return { room: x1 - x0 - 2 * PAD, height: bottom - top - 4 };
  };

  // The entries, written onto the tag (printout only; on screen they're inputs).
  function valuesSvg() {
    return Object.entries(FIELDS).map(([id, [x0, x1, top, bottom, base]]) => {
      const text = String(state.values[id] ?? "").trim();
      if (!text) return "";
      if (!isBig(id)) {
        const size = layoutLine(text, x1 - x0 - PAD);
        return `<text x="${x0 + PAD}" y="${base}" font-size="${size}">${escapeHtml(text)}</text>`;
      }
      // Centred: each line's middle on its slot, the block in the middle of the box.
      const { room, height } = bigBox(id);
      const { size, gap, lines } = layoutBig(text, room, height);
      const cx = (x0 + x1) / 2;
      const first = (top + bottom) / 2 - (lines.length * gap) / 2;
      return lines.map((line, i) => line
        ? `<text x="${cx.toFixed(2)}" y="${(first + gap * (i + 0.5) + size * 0.32).toFixed(2)}" font-size="${size}" text-anchor="middle">${escapeHtml(line)}</text>`
        : "").join("");
    }).join("");
  }

  // The fillable layer on screen: one-line inputs and multi-line boxes.
  function inputsHtml() {
    return Object.entries(FIELDS).map(([id, [x0, x1, top, bottom, base, maxLines, label]]) => {
      // A one-line box sits on its label's baseline; a multi-line one fills its cell.
      const [boxTop, boxBottom] = maxLines > 1 ? [top, bottom] : [Math.max(top, base - 21), Math.min(bottom, base + 6)];
      const style = `left:${x0}pt;width:${(x1 - x0).toFixed(2)}pt;top:${boxTop.toFixed(2)}pt;height:${(boxBottom - boxTop).toFixed(2)}pt`;
      const attrs = `class="br-input hold-input${maxLines > 1 ? " hold-multi" : ""}" data-field="${id}" autocomplete="off" spellcheck="false" style="${style}" aria-label="${escapeHtml(label)}"`;
      return maxLines > 1
        ? `<textarea ${attrs} rows="${maxLines}"></textarea>`
        : `<input type="text" ${attrs}${id === "date" ? ' placeholder="MM/DD/YY"' : ""}>`;
    }).join("");
  }

  const tab = el("holdTab");
  const sheet = el("holdSheet");
  const copy = el("holdPrintPage");

  // The printed copy is kept up to date as the tag is filled in, so it's ready
  // (logo loaded) whenever printing starts.
  // On screen the multi-line boxes use the printout's size, line spacing and
  // centring, so what's typed looks as it will print.
  function fitBigInput(input) {
    const id = input.dataset.field;
    const text = input.value.trim();
    const { height } = bigBox(id);
    const { size, gap, lines } = text ? layoutBig(text, bigBox(id).room, height) : { size: BIG_SIZE, gap: BIG_SIZE * BIG_LEADING, lines: [""] };
    input.style.fontSize = `${size}pt`;
    input.style.lineHeight = `${gap.toFixed(2)}pt`;
    input.style.paddingTop = `${Math.max(0, (height + 4 - lines.length * gap) / 2).toFixed(2)}pt`;
  }

  function renderValues() {
    tab.querySelectorAll(".hold-multi").forEach(fitBigInput);
    copy.querySelector(".hold-values").innerHTML = valuesSvg();
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = tab.querySelector(`[data-field="${id}"]`);
    if (input) input.value = value;
  }

  // The tag keeps the paper's proportions and shrinks to fit the panel.
  function fitSheet() {
    const wrap = el("holdSheetWrap");
    if (!wrap.clientWidth) return;
    sheet.style.zoom = String(Math.max(0.55, Math.min(1, wrap.clientWidth / (792 * 96 / 72))));
  }

  sheet.innerHTML = tagSvg() + inputsHtml();
  copy.innerHTML = tagSvg();
  new ResizeObserver(fitSheet).observe(el("holdSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    renderValues();
  });
  // An empty Date starts with today's date.
  tab.addEventListener("focusin", e => {
    if (e.target.dataset.field === "date" && !e.target.value) {
      setValue("date", formatDateMMDDYY(todayISO()));
      renderValues();
      e.target.select();
    }
  });

  el("holdFillBtn").addEventListener("click", () => {
    const fg = el("fgItem").value.trim();
    const wo = el("woNumber").value.trim();
    if (!fg && !wo) {
      showMsg("holdMsg", "The Yield Sheet has no FG Item or W.O. # yet.", false);
      return;
    }
    if (fg) setValue("item", fg);
    if (wo) setValue("workOrder", wo);
    renderValues();
    showMsg("holdMsg", `Filled from the Yield Sheet: ${[fg && `Item # ${fg}`, wo && `Work Order/Lot # ${wo}`].filter(Boolean).join(", ")}.`);
  });

  el("holdClearBtn").addEventListener("click", () => {
    tab.querySelectorAll("[data-field]").forEach(i => { i.value = ""; });
    state.values = {};
    renderValues();
    el("holdMsg").textContent = "";
  });

  el("holdPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the tag instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "hold";
  });
  document.querySelector('[data-tab="holdTab"]').addEventListener("click", () => requestAnimationFrame(fitSheet));

  renderValues();
  return { state, FIELDS };
})();
