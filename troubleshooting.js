// Trouble Shooting tab: the Trouble Shooting Template, started when there's
// an equipment failure. There's no file of the original, only a photo of the
// printed page, so it's drawn from the photo's proportions on a Letter
// portrait page (in pt from the top-left of the page). On screen the blanks
// and cells are fillable and a row's check can be circled as the cause;
// printing gives the form with the entries written in, or the blank form.
// Long entries shrink to fit their box, the same on screen and printed.
// Uses el, escapeHtml, todayISO, formatDateMMDDYY, onViewShown and
// StoredData from app.js.
const Troubleshooting = (() => {
  const ARIAL = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const CALIBRI = `Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  const SEGOE = `"Segoe UI", "Open Sans", "Noto Sans", "DejaVu Sans", Arial, sans-serif`;
  const [LEFT, RIGHT] = [66, 546];
  // The table columns: Lead / MLL / MLT / PLT | Line / Area | Equipment |
  // Downtime, and SME / Mechanic Checked | Did This Correct The Issue.
  const COLS1 = [LEFT, 226, 337, 473, RIGHT];
  const SPLIT2 = 285;
  // The 13 rows of checks, under the mechanic table's heading rows.
  const ROWS = Array.from({ length: 14 }, (_, i) => +(322 + i * 20.80).toFixed(2));
  const CHECK_BOTTOM = ROWS[ROWS.length - 1];

  // Fill-in areas: id -> { box: [x0, y0, x1, y1], size, label, kind }.
  // Cells are centred in their box; "line" entries sit on their underline
  // (y1 is the baseline); "multi" entries wrap, their lines centred across
  // the box and the block of lines centred top to bottom.
  const FIELDS = {};
  const field = (id, box, size, label, kind = "cell") => { FIELDS[id] = { box, size, label, kind }; };
  field("date", [383, 77, 467, 91], 11, "Date", "line");
  field("time", [387, 95, 480, 109], 11, "Time", "line");
  field("problem", [LEFT, 156, RIGHT, 198], 11, "Brief description of the Problem", "multi");
  field("names", [LEFT, 237, COLS1[1], 267], 10, "Lead / MLL / MLT / PLT Name(s)", "multi");
  field("line", [COLS1[1], 222, COLS1[2], 267], 12, "Line / Area");
  field("equipment", [COLS1[2], 222, COLS1[3], 267], 12, "Equipment");
  field("downtime", [COLS1[3], 222, COLS1[4], 267], 12, "Downtime");
  ROWS.slice(1).forEach((y1, i) => {
    field(`r${i + 1}_checked`, [LEFT, ROWS[i], SPLIT2, y1], 10, `Row ${i + 1}: SME / Mechanic Checked`);
    field(`r${i + 1}_corrected`, [SPLIT2, ROWS[i], RIGHT, y1], 10, `Row ${i + 1}: Did this correct the issue`);
  });
  field("action", [LEFT, 608, RIGHT, 638], 10, "Corrective Action", "multi");

  const MIN_SIZE = 6;
  const PAD = 3; // pt each side inside a box
  const INSET = 1.5; // the screen boxes sit this far inside the lines

  // values: the entries; cause: the row circled as the cause (0 = none).
  const state = { values: {}, cause: 0 };

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `400 ${size}pt ${ARIAL}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  // The circled row's check leaves room for the circle round it.
  const CIRCLE_ROOM = 24;
  const room = id => FIELDS[id].box[2] - FIELDS[id].box[0] - 2 * INSET - 2 * PAD
    - (state.cause && id === `r${state.cause}_checked` ? CIRCLE_ROOM : 0);
  // A one-line entry: its size, shrunk to fit its box down to MIN_SIZE.
  function fitSize(id, s) {
    const { size } = FIELDS[id];
    const width = s ? widthPt(s, size) : 0;
    return width > room(id) ? Math.max(MIN_SIZE, Math.floor((size * room(id) / width) * 4) / 4) : size;
  }
  // A wrapping entry: its lines, shrinking until they fit the box.
  function wrapLines(id, s) {
    const { box: [, y0, , y1], size: start } = FIELDS[id];
    for (let size = start; ; size -= 0.5) {
      const lines = [];
      for (const para of s.split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (line && widthPt(next, size) > room(id)) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }
      if (lines.length * size * 1.2 <= y1 - y0 - 2 * INSET - 2 || size <= MIN_SIZE) return { size, lines };
    }
  }

  const fmt = n => +n.toFixed(2);
  const text = (s, x, y, size, family = CALIBRI, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family='${family}'${extra}>${escapeHtml(s)}</text>`;
  const bold = ' font-weight="700"';
  const middle = ' text-anchor="middle"';
  const hline = (y, x0 = LEFT, x1 = RIGHT, w = 0.6, dash = "") =>
    `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#000" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const vline = (x, y0, y1, w = 0.6) => `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#000" stroke-width="${w}"/>`;

  function pageSvg() {
    const centre = (a, b) => (a + b) / 2;
    return `<svg class="br-svg" viewBox="0 0 612 792" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000">
        ${text("Trouble Shooting Template", 77, 91, 17, SEGOE, ` font-style="italic" font-weight="600" fill="#fff" stroke="#000" stroke-width="0.7" paint-order="stroke" textLength="227" lengthAdjust="spacingAndGlyphs"`)}
        ${text("DATE:", 347, 91, 11, SEGOE, ' letter-spacing="0.4"')}${hline(92, 383, 467, 0.8)}
        ${text("TIME:", 347, 109, 11, SEGOE, ' letter-spacing="0.4"')}${hline(110, 387, 480, 0.8, "4.2 1.8")}
        ${text("Start this form when there is an equipment failure. If lead, MLL, MLT,", 74, 113, 8)}
        ${text("PLT or Mechanic is trouble shooting the cause someone else on the", 74, 124, 8)}
        ${text("line can start filling out the form.", 74, 135, 8)}
        <rect x="${LEFT}" y="60" width="${RIGHT - LEFT}" height="138" fill="none" stroke="#000" stroke-width="1.2"/>
        ${hline(142.4, LEFT, RIGHT, 1.1)}
        ${text("Brief description of the Problem:", 69, 153, 10.5, SEGOE, ' letter-spacing="0.5"')}

        ${["LEAD / MLL / MLT / PLT", "LINE / AREA", "EQUIPMENT", "DOWNTIME"].map((s, i) =>
          text(s, centre(COLS1[i], COLS1[i + 1]), 214, 8.5, CALIBRI, ` letter-spacing="0.3"${middle}`)).join("")}
        ${text("Name(s):", 78.5, 235, 8, CALIBRI, bold)}
        ${hline(222)}${hline(267)}
        ${COLS1.map(x => vline(x, 198, 267)).join("")}

        ${text("After 15 minutes of downtime call for a mechanic", centre(LEFT, RIGHT), 295, 10, CALIBRI, bold + middle)}
        ${text("SME / MECHANIC CHECKED", centre(LEFT, SPLIT2), 316, 8.5, CALIBRI, ` letter-spacing="0.3"${middle}`)}
        ${text("DID THIS CORRECT THE ISSUE", centre(SPLIT2, RIGHT), 316, 8.5, CALIBRI, ` letter-spacing="0.3"${middle}`)}
        ${hline(280.4)}${hline(302.6)}${ROWS.map(y => hline(y)).join("")}
        ${vline(LEFT, 280.4, 638.2)}${vline(RIGHT, 280.4, 638.2)}${vline(SPLIT2, 302.6, CHECK_BOTTOM)}
        ${text("CORRECTIVE ACTION:", 76, 605.5, 8, CALIBRI, bold)}
        ${hline(638.2)}

        ${text("If the issue that caused the downtime was found circle the “cause”. Turn the completed form into the lean coordinator, or into the", 63, 659, 8.8, CALIBRI, ' textLength="483" lengthAdjust="spacing"')}
        ${text("designated collection center.", 63, 672, 8.8)}
        ${text("If issue is unresolved complete a Basic Rapid Problem-Solving Job aid to find the root cause.", 61, 699, 8.8)}
      </g>
      <g class="ts-marks"></g>
      <g class="ts-values" fill="#000"></g>
    </svg>`;
  }

  // The circle round the row found to be the cause, on screen and printed.
  function marksSvg() {
    if (!state.cause) return "";
    const [x0, y0, x1, y1] = FIELDS[`r${state.cause}_checked`].box;
    const s = String(state.values[`r${state.cause}_checked`] ?? "").trim();
    const half = (x1 - x0) / 2 - 3;
    const rx = s ? Math.min(half, widthPt(s, fitSize(`r${state.cause}_checked`, s)) / 2 + 12) : half;
    return `<ellipse cx="${fmt((x0 + x1) / 2)}" cy="${fmt((y0 + y1) / 2)}" rx="${fmt(rx)}" ry="${fmt((y1 - y0) / 2 - 1)}" fill="none" stroke="#000" stroke-width="1"/>`;
  }

  // The entries, written onto the form (printout only; on screen they're inputs).
  function valuesSvg() {
    let out = "";
    for (const [id, { box: [x0, y0, x1, y1], kind }] of Object.entries(FIELDS)) {
      const s = String(state.values[id] ?? "").trim();
      if (!s) continue;
      const squeeze = (line, size) => (widthPt(line, size) > room(id) ? ` textLength="${fmt(room(id))}" lengthAdjust="spacingAndGlyphs"` : "");
      if (kind === "multi") {
        const { size, lines } = wrapLines(id, s);
        const gap = size * 1.2;
        const first = (y0 + y1) / 2 - (lines.length * gap) / 2;
        lines.forEach((l, i) => {
          if (l) out += text(l, fmt((x0 + x1) / 2), fmt(first + gap * (i + 0.5) + size * 0.36), size, ARIAL, middle + squeeze(l, size));
        });
        continue;
      }
      const size = fitSize(id, s);
      const base = kind === "line" ? y1 - 1.5 : (y0 + y1) / 2 + size * 0.36;
      out += text(s, fmt((x0 + x1) / 2), fmt(base), size, ARIAL, middle + squeeze(s, size));
    }
    return out;
  }

  // The fillable layer on screen, and a button beside each check row to
  // circle it as the cause.
  function inputsHtml() {
    return Object.entries(FIELDS).map(([id, { box: [x0, y0, x1, y1], size, label, kind }]) => {
      const top = kind === "line" ? y1 - size - 4 : y0 + INSET;
      const bottom = kind === "line" ? y1 + 2 : y1 - INSET;
      const style = `left:${fmt(x0 + INSET)}pt;width:${fmt(x1 - x0 - 2 * INSET)}pt;top:${fmt(top)}pt;height:${fmt(bottom - top)}pt;font-size:${size}pt`;
      const attrs = `class="br-input ts-input${kind === "multi" ? " ts-multi" : ""}" data-field="${id}" autocomplete="off"`
        + ` spellcheck="${kind === "multi"}" style="${style}" aria-label="${escapeHtml(label)}"`;
      const extra = id === "date" ? ' placeholder="MM/DD/YY"' : id === "line" ? ' list="tsLineList"' : "";
      return kind === "multi" ? `<textarea ${attrs}></textarea>` : `<input type="text" ${attrs}${extra}>`;
    }).join("") + ROWS.slice(1).map((y1, i) =>
      `<button type="button" class="ts-cause" data-cause="${i + 1}" aria-pressed="false" title="Circle as the cause"
        aria-label="Row ${i + 1}: circle as the cause" style="left:48pt;top:${fmt(ROWS[i] + 3)}pt"></button>`).join("")
      + '<datalist id="tsLineList"></datalist>';
  }

  const tab = el("tsTab");
  const sheet = el("tsSheet");
  const copy = el("tsPrintPage");
  const inputOf = id => sheet.querySelector(`[data-field="${id}"]`);

  // On screen, long entries shrink the same way as on the printout.
  function sizeInputs() {
    sheet.querySelectorAll(".ts-input").forEach(input => {
      const id = input.dataset.field;
      const s = input.value.trim();
      if (FIELDS[id].kind === "multi") {
        // Centred like the printout: the lines' block in the middle of the box.
        const { size, lines } = s ? wrapLines(id, s) : { size: FIELDS[id].size, lines: [""] };
        const height = FIELDS[id].box[3] - FIELDS[id].box[1] - 2 * INSET;
        input.style.fontSize = `${size}pt`;
        input.style.paddingTop = `${fmt(Math.max(1, (height - lines.length * size * 1.2) / 2))}pt`;
        return;
      }
      input.style.fontSize = `${fitSize(id, s)}pt`;
    });
  }

  // The printed copy is kept up to date as the form is filled in, so it's
  // ready whenever printing starts.
  function render() {
    sizeInputs();
    const marks = marksSvg();
    sheet.querySelector(".ts-marks").innerHTML = marks;
    copy.querySelector(".ts-marks").innerHTML = marks;
    copy.querySelector(".ts-values").innerHTML = valuesSvg();
    sheet.querySelectorAll("[data-cause]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.cause) === state.cause)));
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = inputOf(id);
    if (input) input.value = value;
  }

  // Line / Area suggests the lines in Stored Data's line rates.
  function refreshLines() {
    el("tsLineList").innerHTML = [...new Set(StoredData.lineRates.all().map(r => r.line))]
      .map(l => `<option value="${escapeHtml(l)}">`).join("");
  }

  // The form keeps the page's proportions and shrinks to fit the panel.
  function fitSheet() {
    const wrap = el("tsSheetWrap");
    if (!wrap.clientWidth) return;
    sheet.style.zoom = String(Math.max(0.45, Math.min(1, wrap.clientWidth / (612 * 96 / 72))));
  }

  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours() % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "AM" : "PM"}`;
  };

  sheet.innerHTML = pageSvg() + inputsHtml();
  copy.innerHTML = pageSvg();
  new ResizeObserver(fitSheet).observe(el("tsSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    render();
  });
  // One row is circled as the cause; clicking it again clears the circle.
  sheet.addEventListener("click", e => {
    const button = e.target.closest("[data-cause]");
    if (!button) return;
    const row = Number(button.dataset.cause);
    state.cause = state.cause === row ? 0 : row;
    render();
  });
  // An empty Date starts with today's date and an empty Time with the time now.
  tab.addEventListener("focusin", e => {
    const id = e.target.dataset.field;
    if ((id === "date" || id === "time") && !e.target.value) {
      setValue(id, id === "date" ? formatDateMMDDYY(todayISO()) : nowTime());
      render();
      e.target.select();
    }
  });

  el("tsClearBtn").addEventListener("click", () => {
    sheet.querySelectorAll(".ts-input").forEach(i => { i.value = ""; });
    state.values = {};
    state.cause = 0;
    render();
  });

  el("tsPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the form instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "troubleshooting";
  });
  onViewShown("tsTab", () => {
    refreshLines();
    requestAnimationFrame(fitSheet);
  });

  // For the Activity Log, e.g. "Line 10, Capper: Caps not torquing".
  function summary() {
    const v = id => String(state.values[id] ?? "").replace(/\s+/g, " ").trim();
    const where = [v("line") && `Line ${v("line")}`, v("equipment")].filter(Boolean).join(", ");
    return [where, v("problem")].filter(Boolean).join(": ").slice(0, 200);
  }

  render();
  return { state, FIELDS, summary };
})();
