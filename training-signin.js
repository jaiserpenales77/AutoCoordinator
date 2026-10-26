// Training Sign-In tab: the TR002B [CA] Training Sign-In Sheet (Employee
// Training Program, QS016A), two Letter portrait pages drawn from the paper
// form's own measurements (in pt from the top-left of the page). On screen
// the cells are fillable, a Delivery Method is circled and a Training Type
// ticked by clicking it; printing gives the sheet with the entries written in,
// or the blank form when nothing is filled in. Long entries shrink to fit
// their box, the same on screen and printed.
// Uses el, escapeHtml, todayISO, formatDateMMDDYY and onViewShown from app.js.
const TrainingSignIn = (() => {
  const ARIAL = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const CALIBRI = `Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  const FONTS = {
    AB: [ARIAL, 700], A: [ARIAL, 400], CB: [CALIBRI, 700], C: [CALIBRI, 400]
  };
  const GRAY = "#f2f2f2";
  const LINE = 0.48;
  const [LEFT, RIGHT] = [23.76, 598.78];
  // Column lines of the name tables: Job Number | Last | First | ID # | Signature.
  const [JOB, LAST, FIRST, ID] = [69.14, 187.27, 302.76, 392.78];
  // Row lines of the employee tables (page 1: 18 rows, page 2: 31 rows).
  const P1_ROWS = [372.34, 393.0, 413.64, 434.28, 454.92, 475.58, 496.22, 516.86, 537.5, 558.41,
    579.05, 599.69, 620.33, 640.99, 661.63, 682.27, 702.91, 723.58, 749.5];
  const P2_ROWS = [112.58, 133.25, 153.89, 174.53, 195.17, 215.83, 236.47, 257.11, 277.75, 298.42,
    319.06, 339.7, 360.34, 381.0, 401.64, 422.28, 442.92, 463.58, 484.22, 504.86, 525.5, 546.17,
    566.81, 587.45, 608.09, 628.75, 649.39, 670.03, 690.67, 711.34, 731.97];
  const P1_PEOPLE = P1_ROWS.length - 1;

  // Fill-in areas: id -> { page, box: [x0, y0, x1, y1], size, label, kind }.
  // Cells are centred in their box; "line" entries sit on the Other (Describe)
  // underlines (y1 is the baseline); "multi" wraps (Course Number).
  const FIELDS = {};
  const field = (id, page, box, size, label, kind = "cell") => { FIELDS[id] = { page, box, size, label, kind }; };
  field("department", 1, [LAST, 72.26, 379.34, 112.82], 17, "Department(s)");
  field("contract", 1, [432.17, 72.26, RIGHT, 112.82], 14, "Contract Number");
  field("course", 1, [LAST, 112.82, 379.34, 149.81], 12, "Course Number (JI/SOP)", "multi");
  field("date", 1, [504.19, 149.81, RIGHT, 180.05], 15, "Date (MM/DD/YY)");
  field("start", 1, [504.19, 180.05, RIGHT, 213.91], 16, "Start Time");
  field("end", 1, [504.19, 213.91, RIGHT, 243.19], 15, "End Time");
  field("total", 1, [504.19, 243.19, RIGHT, 280.63], 17, "Total Time (Hours/Minutes)");
  field("other1", 1, [276.58, 220, 424.63, 234.6], 9, "Other (Describe), line 1", "line");
  field("other2", 1, [276.58, 247, 424.63, 261.5], 9, "Other (Describe), line 2", "line");
  [[306.34, 326.98], [326.98, 347.62]].forEach(([y0, y1], i) => {
    field(`i${i + 1}_last`, 1, [LEFT, y0, LAST, y1], 15, `Instructor ${i + 1} Last Name`);
    field(`i${i + 1}_first`, 1, [LAST, y0, FIRST, y1], 15, `Instructor ${i + 1} First Name`);
    field(`i${i + 1}_id`, 1, [FIRST, y0, ID, y1], 13, `Instructor ${i + 1} ID #`);
  });
  field("course2", 2, [LAST, 72.26, ID, 90.26], 11, "Page 2 Course #");
  field("date2", 2, [432.17, 72.26, RIGHT, 90.26], 11, "Page 2 Date");
  // Employees are numbered across both pages: 1–18 on page 1, 19–49 on page 2.
  const employeeRows = (page, rows, first) => rows.slice(1).forEach((y1, i) => {
    const y0 = rows[i];
    const n = first + i;
    field(`e${n}_job`, page, [LEFT, y0, JOB, y1], 11, `Employee ${n} Job Number`);
    field(`e${n}_last`, page, [JOB, y0, LAST, y1], 14, `Employee ${n} Last Name`);
    field(`e${n}_first`, page, [LAST, y0, FIRST, y1], 14, `Employee ${n} First Name`);
    field(`e${n}_id`, page, [FIRST, y0, ID, y1], 13, `Employee ${n} ID #`);
  });
  employeeRows(1, P1_ROWS, 1);
  employeeRows(2, P2_ROWS, P1_PEOPLE + 1);

  // Page 2's Course # and Date follow page 1's unless typed over.
  const MIRRORS = { course2: "course", date2: "date" };

  // Delivery Method (circle one): id -> [cell x0, y0, x1, y1, text x, text width, text].
  const DELIVERY = {
    handout: [432.17, 112.82, 504.19, 130.85, 450.41, 35.55, "Handout"],
    presenter: [504.19, 112.82, RIGHT, 130.85, 531.55, 39.5, "Presenter"],
    handsOn: [432.17, 130.85, 504.19, 149.81, 448.49, 39.13, "Hands-on"],
    online: [504.19, 130.85, RIGHT, 149.81, 538.03, 26.85, "Online"]
  };
  // Training Type (check one): id -> [box x, baseline, label x, label width, label].
  const TRAINING = {
    advancedTechnology: [110.93, 161.81, 123.17, 107.4, "Advanced Technology"],
    businessSkills: [110.93, 187.01, 123.17, 73.14, "Business Skills"],
    computerSkills: [110.93, 212.47, 123.17, 77.19, "Computer Skills"],
    commercialSkills: [110.93, 237.67, 123.17, 87.28, "Commercial Skills"],
    continuousImprovement: [110.93, 263.11, 123.17, 122.69, "Continuous Improvement"],
    literacySkills: [276.58, 160.37, 291.0, 67.12, "Literacy Skills"],
    managementSkills: [276.58, 185.57, 288.82, 92.77, "Management Skills"],
    other: [276.58, 210.79, 286.42, 81.35, "Other (Describe)"]
  };

  const MIN_SIZE = 6;
  const PAD = 3; // pt each side inside a cell
  const INSET = 1.5; // the screen boxes sit this far inside the cell lines

  const state = { values: {}, delivery: "", training: "" };
  const typed = new Set(); // mirrored fields typed over

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `400 ${size}pt ${ARIAL}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  const room = id => FIELDS[id].box[2] - FIELDS[id].box[0] - 2 * INSET - 2 * PAD;
  // A one-line entry: its size, shrunk to fit its box down to MIN_SIZE.
  function fitSize(id, s) {
    const { size } = FIELDS[id];
    const width = s ? widthPt(s, size) : 0;
    return width > room(id) ? Math.max(MIN_SIZE, Math.floor((size * room(id) / width) * 4) / 4) : size;
  }
  // Course Number: word-wrapped to the box, shrinking until its lines fit.
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
      if (lines.length * size * 1.15 <= y1 - y0 - 2 * INSET - 2 || size <= MIN_SIZE) return { size, lines };
    }
  }

  const fmt = n => +n.toFixed(2);
  const text = (s, x, y, size, font = "A", extra = "") => {
    const [family, weight] = FONTS[font];
    return `<text x="${x}" y="${y}" font-size="${size}" font-family='${family}' font-weight="${weight}"${extra}>${escapeHtml(s)}</text>`;
  };
  const fill = (x0, y0, x1, y1) => `<rect x="${x0}" y="${y0}" width="${fmt(x1 - x0)}" height="${fmt(y1 - y0)}" fill="${GRAY}"/>`;
  // The form's rules are thin filled bars, as in the original.
  const hline = (y, x0 = LEFT - LINE / 2, x1 = RIGHT + LINE / 2, w = LINE) =>
    `<rect x="${fmt(x0)}" y="${fmt(y - w / 2)}" width="${fmt(x1 - x0)}" height="${w}"/>`;
  const vline = (x, y0, y1, w = LINE) =>
    `<rect x="${fmt(x - w / 2)}" y="${fmt(y0)}" width="${w}" height="${fmt(y1 - y0)}"/>`;
  const checkbox = (x, base) => `<rect x="${fmt(x + 1.27)}" y="${fmt(base - 7.6)}" width="7" height="7.2" fill="none" stroke="#000" stroke-width="0.8"/>`;

  // The heading, logo and footer, the same on both pages.
  const frame = page => `
    <image href="assets/pharmavite-logo-qs016a.png" x="34.06" y="15.83" width="46.31" height="53.91"/>
    ${text("TR002B", 185.11, 33.12, 11.04, "AB")}${text("[CA] TRAINING SIGN-IN SHEET", 232.33, 33.12, 11.04, "AB")}
    ${text("Page", 471.05, 33.12, 12, "AB")}${text(`${page} of 2`, 503.23, 33.12, 12, "CB")}
    ${text("Employee Training Program", 216.07, 47.06, 11.04, "C")}
    ${text("QS016A", 72.02, 774.94, 11.04, "C")}${text("For Pharmavite internal use, only", 241.78, 774.94, 11.04, "C")}${text("TRGN-0100", 468.17, 774.94, 11.04, "C")}`;

  // The employee table: its heading row from y0 to the first row line. The
  // heading's text is placed as on page 1, except where page 2 has its own
  // baselines for Job Number and Employee Signature ([job, number, signature]).
  function employeeTable(y0, rows, own = [356.02, 366.58, 363.7]) {
    const top = rows[0];
    const bottom = rows[rows.length - 1];
    const dy = top - 372.34;
    const [job, number, signature] = own;
    return `
      ${fill(LEFT, y0, RIGHT, top)}
      ${rows.slice(1).map((y1, i) => fill(LEFT, rows[i], JOB, y1)).join("")}
      ${text("Job", 38.18, job, 9.12, "AB")}${text("Number", 29.28, number, 9.12, "AB")}
      ${text("Employee Last Name", 77.54, fmt(360.58 + dy), 10.08, "AB")}${text("Please Print", 106.37, fmt(370.42 + dy), 7.92)}
      ${text("Employee First Name", 193.99, fmt(359.38 + dy), 10.08, "AB")}${text("Please Print", 220.63, fmt(369.94 + dy), 9.12)}
      ${text("Employee ID #", 313.56, fmt(359.38 + dy), 10.08, "AB")}${text("See Badge", 325.56, fmt(369.94 + dy), 9.12)}
      ${text("Employee Signature", 442.97, signature, 11.04, "AB")}
      <g fill="#000">
        ${[y0, ...rows].map(y => hline(y)).join("")}
        ${[JOB, LAST, FIRST, ID].map(x => vline(x, y0, bottom + LINE / 2)).join("")}
      </g>`;
  }

  function page1Svg() {
    return `<svg class="br-svg" viewBox="0 0 612 792" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000">
        ${frame(1)}
        ${fill(LEFT, 72.26, LAST, 149.81)}${fill(379.34, 72.26, RIGHT, 112.82)}${fill(379.34, 112.82, 432.17, 149.81)}
        ${fill(LEFT, 149.81, 105.41, 280.63)}${fill(432.17, 149.81, 504.19, 280.63)}
        ${fill(LEFT, 283.51, RIGHT, 306.34)}
        ${text("Department(s)", 71.78, 96.26, 11.04, "CB")}
        ${text("Contract", 386.06, 89.54, 11.04, "CB")}${text("Number", 386.78, 102.98, 11.04, "CB")}
        ${text("Course Number", 69.62, 128.45, 11.04, "CB")}${text("(JI/SOP)", 86.9, 141.89, 11.04, "CB")}
        ${text("Delivery", 386.78, 123.65, 11.04, "CB")}${text("Method", 387.26, 137.09, 11.04, "CB")}${text("(Circle One)", 386.06, 147.41, 7.92, "CB")}
        ${Object.values(DELIVERY).map(([, , , , x, , s], i) => text(s, x, i < 2 ? 125.33 : 143.81, 10.08, "C")).join("")}
        ${text("Training Type", 34.1, 192.05, 11.04, "CB")}${text("(Check one", 40.58, 218.71, 11.04, "CB")}
        ${text("based on the", 34.82, 232.15, 11.04, "CB")}${text("Curriculum)", 37.7, 245.59, 11.04, "CB")}
        ${Object.values(TRAINING).map(([bx, base, lx, , s]) => checkbox(bx, base) + text(s, lx, base, 11.04)).join("")}
        ${text("_".repeat(27), 276.58, 236.71, 11.04, "C")}${text("_".repeat(27), 276.58, 263.59, 11.04, "C")}
        ${text("Date", 437.45, 162.29, 10.08, "CB")}${text("(MM/DD/YY)", 437.45, 174.53, 10.08, "CB")}
        ${text("Start Time", 437.45, 200.45, 10.08, "CB")}${text("End Time", 437.45, 231.91, 10.08, "CB")}
        ${text("Total Time", 437.45, 259.51, 10.08, "CB")}${text("Hours/Minutes", 437.45, 270.79, 9.12, "CB")}
        ${text("Instructor Last Name", 55.22, 294.58, 10.08, "AB")}${text("Please Print", 83.78, 304.42, 7.92)}
        ${text("Instructor First Name", 194.23, 293.38, 10.08, "AB")}${text("Please Print", 220.63, 303.94, 9.12)}
        ${text("Instructor ID #", 314.04, 293.38, 10.08, "AB")}${text("See Badge", 325.56, 303.94, 9.12)}
        ${text("Instructor Signature", 443.21, 298.9, 11.04, "AB")}
        ${hline(72.26)}${hline(112.82)}${hline(130.85, 432.17)}${hline(149.81)}
        ${[180.05, 213.91, 243.19].map(y => hline(y, 432.17)).join("")}
        ${hline(280.63, undefined, undefined, 1.44)}${hline(283.51, undefined, undefined, 1.44)}
        ${hline(306.34)}${hline(326.98)}
        ${vline(LEFT, 72.02, 749.74)}${vline(RIGHT, 72.02, 749.74)}
        ${vline(105.41, 149.81, 280.63)}${vline(LAST, 72.26, 149.81)}${vline(379.34, 72.26, 149.81)}
        ${vline(432.17, 72.26, 280.63)}${vline(504.19, 112.82, 280.63)}
        ${[LAST, FIRST, ID].map(x => vline(x, 283.51, 347.62)).join("")}
        ${employeeTable(347.62, P1_ROWS)}
      </g>
      <g class="tr-marks"></g>
      <g class="tr-values" fill="#000"></g>
    </svg>`;
  }

  function page2Svg() {
    return `<svg class="br-svg" viewBox="0 0 612 792" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000">
        ${frame(2)}
        ${fill(LEFT, 72.26, LAST, 90.26)}${fill(ID, 72.26, 432.17, 90.26)}
        ${text("Course #:", 84.26, 85.22, 11.04, "CB")}${text("Date:", 400.22, 85.22, 11.04, "CB")}
        ${hline(72.26)}
        ${vline(LEFT, 72.02, P2_ROWS.at(-1) + LINE / 2)}${vline(RIGHT, 72.02, P2_ROWS.at(-1) + LINE / 2)}
        ${[LAST, ID, 432.17].map(x => vline(x, 72.26, 90.26)).join("")}
        ${employeeTable(90.26, P2_ROWS, [98.66, 108.98, 105.14])}
      </g>
      <g class="tr-values" fill="#000"></g>
    </svg>`;
  }

  // The circle round the Delivery Method and the tick in the Training Type box,
  // drawn on the sheet on screen and printed.
  function marksSvg() {
    let out = "";
    const d = DELIVERY[state.delivery];
    if (d) {
      const [, y0, , y1, x, w] = d;
      out += `<ellipse cx="${fmt(x + w / 2)}" cy="${fmt((y0 + y1) / 2)}" rx="${fmt(w / 2 + 13.6)}" ry="9" fill="none" stroke="#000" stroke-width="1"/>`;
    }
    const t = TRAINING[state.training];
    if (t) {
      const [x, base] = t;
      out += `<path d="M${fmt(x + 2.6)} ${fmt(base - 3.9)}L${fmt(x + 4.5)} ${fmt(base - 1.8)}L${fmt(x + 7.6)} ${fmt(base - 6.9)}" fill="none" stroke="#000" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return out;
  }

  // The entries, written onto the pages (printout only; on screen they're inputs).
  function valuesSvg(page) {
    let out = "";
    for (const [id, { page: p, box: [x0, y0, x1, y1], kind }] of Object.entries(FIELDS)) {
      const s = String(state.values[id] ?? "").trim();
      if (p !== page || !s) continue;
      const cx = fmt((x0 + x1) / 2);
      const squeeze = (line, size) => (widthPt(line, size) > room(id) ? ` textLength="${fmt(room(id))}" lengthAdjust="spacingAndGlyphs"` : "");
      if (kind === "multi") {
        const { size, lines } = wrapLines(id, s);
        const gap = size * 1.15;
        const first = (y0 + y1) / 2 - (lines.length * gap) / 2;
        lines.forEach((l, i) => {
          if (l) out += text(l, cx, fmt(first + gap * (i + 0.5) + size * 0.36), size, "A", ` text-anchor="middle"${squeeze(l, size)}`);
        });
        continue;
      }
      const size = fitSize(id, s);
      const base = kind === "line" ? y1 : (y0 + y1) / 2 + size * 0.36;
      out += text(s, cx, fmt(base), size, "A", ` text-anchor="middle"${squeeze(s, size)}`);
    }
    return out;
  }

  // The fillable layer of a page on screen.
  function inputsHtml(page) {
    let html = Object.entries(FIELDS).filter(([, f]) => f.page === page).map(([id, { box: [x0, y0, x1, y1], size, label, kind }]) => {
      const top = kind === "line" ? y1 - size - 5 : y0 + INSET;
      const bottom = kind === "line" ? y1 + 1.5 : y1 - INSET;
      const style = `left:${fmt(x0 + INSET)}pt;width:${fmt(x1 - x0 - 2 * INSET)}pt;top:${fmt(top)}pt;height:${fmt(bottom - top)}pt;font-size:${size}pt`;
      const attrs = `class="br-input tr-input${kind === "multi" ? " tr-multi" : ""}" data-field="${id}" autocomplete="off"`
        + ` spellcheck="false" style="${style}" aria-label="${escapeHtml(label)}"`;
      const hint = id === "date" || id === "date2" ? ' placeholder="MM/DD/YY"' : "";
      return kind === "multi" ? `<textarea ${attrs}></textarea>` : `<input type="text" ${attrs}${hint}>`;
    }).join("");
    if (page === 1) {
      html += Object.entries(DELIVERY).map(([id, [x0, y0, x1, y1, , , s]]) =>
        `<button type="button" class="br-choice tr-choice" data-delivery="${id}" aria-pressed="false" aria-label="Delivery Method: ${s}"
          style="left:${fmt(x0 + 1)}pt;top:${fmt(y0 + 0.5)}pt;width:${fmt(x1 - x0 - 2)}pt;height:${fmt(y1 - y0 - 1)}pt"></button>`).join("");
      html += Object.entries(TRAINING).map(([id, [x, base, lx, w, s]]) =>
        `<button type="button" class="br-choice tr-choice" data-training="${id}" aria-pressed="false" aria-label="Training Type: ${s}"
          style="left:${fmt(x)}pt;top:${fmt(base - 11)}pt;width:${fmt(lx + w + 2 - x)}pt;height:14pt"></button>`).join("");
    }
    return html;
  }

  const tab = el("trainingTab");
  const sheets = [el("trSheet1"), el("trSheet2")];
  const copies = [el("trPrintPage1"), el("trPrintPage2")];
  const inputOf = id => tab.querySelector(`[data-field="${id}"]`);

  // On screen, long entries shrink the same way as on the printout.
  function sizeInputs() {
    tab.querySelectorAll(".tr-input").forEach(input => {
      const id = input.dataset.field;
      const s = input.value.trim();
      if (FIELDS[id].kind === "multi") {
        const { size, lines } = s ? wrapLines(id, s) : { size: FIELDS[id].size, lines: [""] };
        const height = FIELDS[id].box[3] - FIELDS[id].box[1] - 2 * INSET;
        input.style.fontSize = `${size}pt`;
        input.style.paddingTop = `${fmt(Math.max(1, (height - lines.length * size * 1.15) / 2))}pt`;
        return;
      }
      input.style.fontSize = `${fitSize(id, s)}pt`;
    });
  }

  function setValue(id, value) {
    state.values[id] = value;
    const input = inputOf(id);
    if (input) input.value = value;
  }

  // Page 2's Course # and Date show page 1's (on one line) until typed over.
  function syncMirrors() {
    for (const [copy, source] of Object.entries(MIRRORS)) {
      if (!typed.has(copy)) setValue(copy, String(state.values[source] ?? "").replace(/\s*\n\s*/g, " ").trim());
    }
  }

  // The printed copy is kept up to date as the sheet is filled in, so it's
  // ready (logo loaded) whenever printing starts.
  function render() {
    syncMirrors();
    sizeInputs();
    const marks = marksSvg();
    sheets[0].querySelector(".tr-marks").innerHTML = marks;
    copies[0].querySelector(".tr-marks").innerHTML = marks;
    copies.forEach((copy, i) => { copy.querySelector(".tr-values").innerHTML = valuesSvg(i + 1); });
    tab.querySelectorAll("[data-delivery]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.delivery === state.delivery)));
    tab.querySelectorAll("[data-training]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.training === state.training)));
    copies[1].classList.toggle("hidden", !el("trPage2").checked);
  }

  // The pages keep their proportions and shrink to fit the panel.
  function fitSheets() {
    const wrap = el("trSheetWrap");
    if (!wrap.clientWidth) return;
    const zoom = String(Math.max(0.45, Math.min(1, wrap.clientWidth / (612 * 96 / 72))));
    sheets.forEach(s => { s.style.zoom = zoom; });
  }

  sheets[0].innerHTML = page1Svg() + inputsHtml(1);
  sheets[1].innerHTML = page2Svg() + inputsHtml(2);
  copies[0].innerHTML = page1Svg();
  copies[1].innerHTML = page2Svg();
  new ResizeObserver(fitSheets).observe(el("trSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    if (MIRRORS[id]) {
      if (e.target.value.trim()) typed.add(id); else typed.delete(id);
    }
    // Describing an Other training ticks Other when nothing else is ticked.
    if ((id === "other1" || id === "other2") && e.target.value.trim() && !state.training) state.training = "other";
    render();
  });
  tab.addEventListener("click", e => {
    const choice = e.target.closest("[data-delivery], [data-training]");
    if (!choice) return;
    // One of each; clicking the chosen one again clears it.
    const key = choice.dataset.delivery ? "delivery" : "training";
    const value = choice.dataset[key];
    state[key] = state[key] === value ? "" : value;
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
  el("trPage2").addEventListener("change", render);

  el("trClearBtn").addEventListener("click", () => {
    tab.querySelectorAll(".tr-input").forEach(i => { i.value = ""; });
    state.values = {};
    state.delivery = "";
    state.training = "";
    typed.clear();
    render();
  });

  el("trPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the sign-in sheet instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "training";
  });
  onViewShown("trainingTab", () => requestAnimationFrame(fitSheets));

  // For the Activity Log, e.g. "PKJI-0324, 11/07/25, 3 employees".
  function summary() {
    const v = id => String(state.values[id] ?? "").replace(/\s+/g, " ").trim();
    const people = Object.keys(FIELDS).filter(id => /^e\d+_(last|first|id)$/.test(id) && v(id))
      .map(id => id.split("_")[0]);
    const count = new Set(people).size;
    return [v("course"), v("date"), count && `${count} employee${count === 1 ? "" : "s"}`].filter(Boolean).join(", ");
  }

  render();
  return { state, FIELDS, summary };
})();
