// Component Transfer tab: a Component Transfer Notice for components moved
// from one work order and line to another. There's no paper original; the page
// is drawn in the same style as the other forms (Letter landscape, in pt from
// the top-left of the page). On screen the boxes are fillable; printing gives
// the notice with the entries written in. Long entries shrink to fit their box
// (the Reason wraps), the same on screen and printed.
// Uses el, escapeHtml, showMsg, todayISO, formatDateMMDDYY, onViewShown,
// getCreatedBy, currentUser and StoredData from app.js.
const ComponentTransfer = (() => {
  const SANS = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const TITLE = "Component Transfer Notice";

  // Fill-in areas: id -> [x0, y0, x1, y1, entry size, label]. Underlined
  // blanks (date, names) have their line at y1; the rest are table cells.
  const FIELDS = {
    date: [600, 98, 756, 118, 12, "Date"],
    component: [36, 162, 432, 206, 14, "Component"],
    item: [432, 162, 612, 206, 14, "Item Number"],
    amount: [612, 162, 756, 206, 14, "Amount"],
    fromWo: [168, 254, 462, 294, 14, "From Work Order #"],
    toWo: [462, 254, 756, 294, 14, "To Work Order #"],
    fromLine: [168, 294, 462, 334, 14, "From Line"],
    toLine: [462, 294, 756, 334, 14, "To Line"],
    reason: [36, 380, 756, 486, 13, "Reason for Transfer"],
    lead: [118, 512, 384, 532, 13, "Lead Name"],
    supervisor: [520, 512, 756, 532, 13, "Supervisor Name"]
  };
  const BLANKS = ["date", "lead", "supervisor"];
  // "Did you create an Unplanned Issue Request?": a Yes/No dropdown on screen,
  // the answer written on its line when printed. [x0, y0, x1, y1] of the line.
  const UIR = { id: "unplannedIssue", box: [300, 98, 380, 118], question: "Did you create an Unplanned Issue Request?",
    options: ["Yes", "No"] };
  const MULTI = "reason";
  const MIN_SIZE = 6;
  const PAD = 4; // pt each side inside a box

  const state = { values: {} };

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `700 ${size}pt ${SANS}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  // Table cells' boxes sit 2pt inside the cell (see inputsHtml).
  const inset = id => (BLANKS.includes(id) ? 0 : 2);
  const room = id => FIELDS[id][2] - FIELDS[id][0] - 2 * inset(id) - 2 * PAD;
  // A one-line entry: its size, shrunk to fit its box down to MIN_SIZE.
  function fitSize(id, s) {
    const size = FIELDS[id][4];
    const width = s ? widthPt(s, size) : 0;
    return width > room(id) ? Math.max(MIN_SIZE, Math.floor((size * room(id) / width) * 4) / 4) : size;
  }
  // The Reason: word-wrapped to the box, shrinking until its lines fit.
  function reasonLines(s) {
    const [, y0, , y1, start] = FIELDS[MULTI];
    for (let size = start; ; size -= 0.5) {
      const lines = [];
      for (const para of s.split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (line && widthPt(next, size) > room(MULTI)) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }
      if (lines.length * size * 1.25 <= y1 - y0 - 2 * inset(MULTI) - 2 * PAD || size <= MIN_SIZE) return { size, lines };
    }
  }

  const label = (s, x, y, size = 12, anchor = "start") =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="${anchor}">${escapeHtml(s)}</text>`;
  const rect = (x0, y0, x1, y1, fill = "none", w = 1) =>
    `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${fill}" stroke="#000" stroke-width="${w}"/>`;
  const line = (x0, x1, y) => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#000" stroke-width="1"/>`;
  const SHADE = "#e6e6e6";

  // The notice itself; `.ct-values` is filled in as it's used.
  function pageSvg() {
    const F = FIELDS;
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000" font-family='${SANS}'>
        ${label(TITLE, 396, 74, 22, "middle")}
        ${label(UIR.question, UIR.box[0] - 6, UIR.box[3] - 3, 12, "end")}${line(UIR.box[0], UIR.box[2], UIR.box[3])}
        ${label("Date:", F.date[0] - 6, F.date[3] - 3, 12, "end")}${line(F.date[0], F.date[2], F.date[3])}

        ${rect(36, 142, 756, 162, SHADE)}
        ${label("Component", 234, 156, 10, "middle")}${label("Item Number", 522, 156, 10, "middle")}${label("Amount", 684, 156, 10, "middle")}
        ${rect(36, 162, 756, 206, "none", 1.5)}
        ${[432, 612].map(x => `<line x1="${x}" y1="142" x2="${x}" y2="206" stroke="#000" stroke-width="1"/>`).join("")}

        ${rect(36, 234, 756, 254, SHADE)}
        ${label("Transfer", 102, 248, 10, "middle")}${label("From", 315, 248, 10, "middle")}${label("To", 609, 248, 10, "middle")}
        ${rect(36, 254, 168, 334, SHADE, 1)}
        ${rect(36, 254, 756, 334, "none", 1.5)}
        ${line(36, 756, 294)}
        ${[168, 462].map(x => `<line x1="${x}" y1="234" x2="${x}" y2="334" stroke="#000" stroke-width="1"/>`).join("")}
        ${label("Work Order #", 102, 278, 12, "middle")}${label("Line", 102, 318, 12, "middle")}

        ${label("Reason for Transfer", 36, 372, 13)}
        ${rect(F.reason[0], F.reason[1], F.reason[2], F.reason[3], "none", 1.5)}

        ${label("Lead Name:", F.lead[0] - 6, F.lead[3] - 3, 12, "end")}${line(F.lead[0], F.lead[2], F.lead[3])}
        ${label("Supervisor Name:", F.supervisor[0] - 6, F.supervisor[3] - 3, 12, "end")}${line(F.supervisor[0], F.supervisor[2], F.supervisor[3])}
      </g>
      <g class="ct-values" fill="#000" font-family='${SANS}' font-weight="700"></g>
    </svg>`;
  }

  // The entries, written onto the notice (printout only; on screen they're inputs).
  function valuesSvg() {
    const v = id => String(state.values[id] ?? "").trim();
    let out = "";
    if (v(UIR.id)) {
      const [x0, , x1, y1] = UIR.box;
      out += `<text x="${(x0 + x1) / 2}" y="${y1 - 3}" font-size="12" text-anchor="middle">${escapeHtml(v(UIR.id))}</text>`;
    }
    for (const [id, [x0, y0, x1, y1]] of Object.entries(FIELDS)) {
      const s = v(id);
      if (!s) continue;
      if (id === MULTI) {
        const { size, lines } = reasonLines(s);
        lines.forEach((l, i) => {
          if (!l) return;
          const squeeze = widthPt(l, size) > room(id) ? ` textLength="${room(id).toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : "";
          out += `<text x="${x0 + inset(id) + PAD}" y="${(y0 + inset(id) + PAD + size * (1.25 * i + 1)).toFixed(2)}" font-size="${size}"${squeeze}>${escapeHtml(l)}</text>`;
        });
        continue;
      }
      const size = fitSize(id, s);
      const squeeze = widthPt(s, size) > room(id) ? ` textLength="${room(id).toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : "";
      // Blanks sit on their line; cells are centred in the box.
      const base = BLANKS.includes(id) ? y1 - 3 : (y0 + y1) / 2 + size * 0.36;
      out += `<text x="${((x0 + x1) / 2).toFixed(2)}" y="${base.toFixed(2)}" font-size="${size}" text-anchor="middle"${squeeze}>${escapeHtml(s)}</text>`;
    }
    return out;
  }

  // The fillable layer on screen.
  function inputsHtml() {
    return Object.entries(FIELDS).map(([id, [x0, y0, x1, y1, size, labelText]]) => {
      const blank = BLANKS.includes(id);
      const top = blank ? y1 - size - 7 : y0 + inset(id);
      const bottom = blank ? y1 + 1 : y1 - inset(id);
      const left = x0 + inset(id);
      const right = x1 - inset(id);
      const style = `left:${left}pt;width:${right - left}pt;top:${top}pt;height:${(bottom - top).toFixed(2)}pt;font-size:${size}pt`;
      const list = id === "lead" ? ' list="ctLeadList"' : id === "fromLine" || id === "toLine" ? ' list="ctLineList"' : "";
      const attrs = `class="br-input ct-input${id === MULTI ? " ct-reason" : ""}" data-field="${id}" autocomplete="off"`
        + ` spellcheck="${id === MULTI}" style="${style}" aria-label="${escapeHtml(labelText)}"${list}`;
      return id === MULTI
        ? `<textarea ${attrs}></textarea>`
        : `<input type="text" ${attrs}${id === "date" ? ' placeholder="MM/DD/YY"' : id === "amount" ? ' placeholder="e.g. 2 rolls"' : ""}>`;
    }).join("") + (() => {
      const [x0, , x1, y1] = UIR.box;
      return `<select class="br-input ct-input ct-select" data-field="${UIR.id}" aria-label="${escapeHtml(UIR.question)}"
        style="left:${x0}pt;width:${x1 - x0}pt;top:${y1 - 19}pt;height:${20}pt">
        <option value=""></option>${UIR.options.map(o => `<option>${o}</option>`).join("")}</select>`;
    })() + '<datalist id="ctLeadList"></datalist><datalist id="ctLineList"></datalist>';
  }

  const tab = el("ctTab");
  const sheet = el("ctSheet");
  const copy = el("ctPrintPage");

  // On screen, long entries shrink the same way as on the printout.
  function sizeInputs() {
    sheet.querySelectorAll("[data-field]").forEach(input => {
      const id = input.dataset.field;
      if (!FIELDS[id]) return; // the Yes/No dropdown keeps its size
      const s = input.value.trim();
      input.style.fontSize = `${id === MULTI ? (s ? reasonLines(s).size : FIELDS[id][4]) : fitSize(id, s)}pt`;
    });
  }

  // The printed copy is kept up to date as the notice is filled in, so it's
  // ready whenever printing starts.
  function render() {
    sizeInputs();
    copy.querySelector(".ct-values").innerHTML = valuesSvg();
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = sheet.querySelector(`[data-field="${id}"]`);
    if (input) input.value = value;
  }

  // Suggestions: the leads, and the lines in Stored Data's line rates.
  function refreshLists() {
    el("ctLeadList").innerHTML = StoredData.leads().map(n => `<option value="${escapeHtml(n)}">`).join("");
    el("ctLineList").innerHTML = [...new Set(StoredData.lineRates.all().map(r => r.line))]
      .map(l => `<option value="${escapeHtml(l)}">`).join("");
  }

  const knownLead = () => (currentUser && StoredData.leadForUser(currentUser)) || getCreatedBy() || "";

  // The notice keeps the page's proportions and shrinks to fit the panel.
  function fitSheet() {
    const wrap = el("ctSheetWrap");
    if (!wrap.clientWidth) return;
    sheet.style.zoom = String(Math.max(0.55, Math.min(1, wrap.clientWidth / (792 * 96 / 72))));
  }

  sheet.innerHTML = pageSvg() + inputsHtml();
  copy.innerHTML = pageSvg();
  new ResizeObserver(fitSheet).observe(el("ctSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    render();
  });
  // An empty Date starts with today's date.
  tab.addEventListener("focusin", e => {
    if (e.target.dataset.field === "date" && !e.target.value) {
      setValue("date", formatDateMMDDYY(todayISO()));
      render();
      e.target.select();
    }
  });

  el("ctFillBtn").addEventListener("click", () => {
    const filled = [];
    const lead = knownLead();
    if (lead) { setValue("lead", lead); filled.push(`Lead Name ${lead}`); }
    if (!String(state.values.date ?? "").trim()) { setValue("date", formatDateMMDDYY(todayISO())); filled.push("today's date"); }
    const wo = el("woNumber").value.trim();
    if (wo && !String(state.values.fromWo ?? "").trim()) { setValue("fromWo", wo); filled.push(`From Work Order # ${wo}`); }
    render();
    showMsg("ctMsg", filled.length ? `Filled ${filled.join(", ")}.` : "Nothing to fill from the Yield Sheet yet.", filled.length > 0);
  });

  el("ctClearBtn").addEventListener("click", () => {
    sheet.querySelectorAll("[data-field]").forEach(i => { i.value = ""; });
    state.values = {};
    render();
    el("ctMsg").textContent = "";
  });

  el("ctPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the notice instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "componentTransfer";
  });
  onViewShown("ctTab", () => {
    refreshLists();
    // A blank notice starts with the lead filled in.
    if (!String(state.values.lead ?? "").trim() && knownLead()) {
      setValue("lead", knownLead());
      render();
    }
    requestAnimationFrame(fitSheet);
  });

  // For the Activity Log: what was transferred, e.g. "LBL1234 (2 rolls): WO 1 → WO 2".
  function summary() {
    const v = id => String(state.values[id] ?? "").trim();
    const what = [v("item") || v("component"), v("amount") && `(${v("amount")})`].filter(Boolean).join(" ");
    const from = [v("fromWo") && `WO ${v("fromWo")}`, v("fromLine") && `line ${v("fromLine")}`].filter(Boolean).join(", ");
    const to = [v("toWo") && `WO ${v("toWo")}`, v("toLine") && `line ${v("toLine")}`].filter(Boolean).join(", ");
    const uir = v(UIR.id) && `Unplanned Issue Request: ${v(UIR.id)}`;
    return [[what, (from || to) && `${from || "?"} → ${to || "?"}`].filter(Boolean).join(": "), uir].filter(Boolean).join("; ");
  }

  render();
  return { state, FIELDS, summary };
})();
