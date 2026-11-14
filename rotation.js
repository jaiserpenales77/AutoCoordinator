// Rotation tab: the Rotation Schedule posted on the MDI board. Drawn from a
// scan of the paper form on a Letter landscape page (in pt from the top-left
// of the page), straightened, and a little narrower than the original so its
// right edge stays inside what a printer can print. On screen every blank is
// fillable and the "mark all that apply" boxes tick by clicking; printing
// gives the form with the entries written in, or the blank form.
//
// Auto rotation (the panel beside the sheet): from the positions and the 1st
// rotation's names on the sheet, it fills every rotation's time (a start time
// and the same interval each time) and names, skill-based: the Skills grid
// under the sheet says who's trained on which position (remembered on this
// computer), and each rotation puts only trained people on a position,
// moves everyone off their last position when someone else trained is free,
// and shares the positions and the time off out evenly. Positions marked
// "stays" keep their person; extra people take turns coming in.
// Uses el, escapeHtml, showMsg, todayISO, formatDateMMDDYY and onViewShown
// from app.js.
const Rotation = (() => {
  const ARIAL = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const CALIBRI = `Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  const GOTHIC = `"Century Gothic", "URW Gothic", "TeX Gyre Adventor", "Avant Garde", Futura, ${ARIAL}`;
  const ROWS = 7;
  const COLS = 8;
  const POS_X = 24; // the position column, from here to the first rotation
  const COL_X = 170;
  const COL_W = 74.75; // 8 columns, to 768
  const RIGHT = COL_X + COLS * COL_W;
  const TOP = 207;
  const ROW_H = 49.43;
  const rowY = r => TOP + r * ROW_H;
  const colX = c => COL_X + c * COL_W;
  const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

  // "Mark all that apply": id -> [label, box x0, top].
  const CHECKS = {
    dumping: ["DUMPING", 134.7, 80.5],
    leadTwoLines: ["LEAD RUNNING 2X LINES", 134.7, 95],
    desiccant: ["DESICCANT BY HAND", 362.4, 80.5],
    stretch: ["STRETCH - LINE 6", 362.4, 95],
    heavyBottles: ["HEAVY BOTTLES", 590.6, 80.5],
    shortSkillset: ["SHORT SKILLSET / 1 PLT", 590.6, 95]
  };
  const BOX_W = 37;
  const BOX_H = 14.5;

  // Fill-in areas: id -> { box: [x0, y0, x1, y1], size, label, kind }. Cells
  // are centred in their box; "line" entries sit on their line (y1 is the
  // baseline).
  const FIELDS = {};
  const field = (id, box, size, label, kind = "cell") => { FIELDS[id] = { box, size, label, kind }; };
  field("line", [170, 63, 324, 78], 12, "Line", "line");
  field("shift", [396, 63, 550, 78], 12, "Shift", "line");
  field("date", [626, 63, 760, 78], 12, "Date", "line");
  for (let c = 0; c < COLS; c++) field(`time${c + 1}`, [colX(c) + 2, 158, colX(c + 1) - 2, 171], 10, `${ORDINALS[c]} rotation time`, "line");
  for (let r = 0; r < ROWS; r++) {
    field(`pos${r + 1}`, [POS_X, rowY(r), COL_X, rowY(r + 1)], 11, `Position ${r + 1}`);
    for (let c = 0; c < COLS; c++) field(`r${r + 1}c${c + 1}`, [colX(c), rowY(r), colX(c + 1), rowY(r + 1)], 11, `Position ${r + 1}, ${ORDINALS[c]} rotation`);
  }

  const MIN_SIZE = 6;
  const PAD = 3;
  const INSET = 1.5;

  const state = { values: {}, checks: new Set() };

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `400 ${size}pt ${ARIAL}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  const room = id => FIELDS[id].box[2] - FIELDS[id].box[0] - 2 * INSET - 2 * PAD;
  function fitSize(id, s) {
    const { size } = FIELDS[id];
    const width = s ? widthPt(s, size) : 0;
    return width > room(id) ? Math.max(MIN_SIZE, Math.floor((size * room(id) / width) * 4) / 4) : size;
  }

  const fmt = n => +n.toFixed(2);
  const text = (s, x, y, size, family = CALIBRI, extra = "") =>
    `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${size}" font-family='${family}'${extra}>${escapeHtml(s)}</text>`;
  const line = (x0, y0, x1, y1, w = 0.75) => `<line x1="${fmt(x0)}" y1="${fmt(y0)}" x2="${fmt(x1)}" y2="${fmt(y1)}" stroke="#000" stroke-width="${w}"/>`;
  const middle = ' text-anchor="middle"';

  function pageSvg() {
    const checks = Object.values(CHECKS).map(([label, x, y]) =>
      `<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" fill="none" stroke="#000" stroke-width="0.75"/>`
      + text(label, x + BOX_W + 5, y + BOX_H - 3.8, 9, GOTHIC, ' letter-spacing="0.2"')).join("");
    return `<svg class="br-svg" viewBox="0 0 792 612" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000">
        ${text("ROTATION SCHEDULE", 92, 44, 40, GOTHIC, ' fill="#222" textLength="628" lengthAdjust="spacing"')}
        ${text("Line:", 137, 74, 11.5, GOTHIC)}${text("Shift:", 362, 74, 11.5, GOTHIC)}${text("Date:", 592, 74, 11.5, GOTHIC)}
        ${line(134.7, 80.5, 324.5, 80.5)}${line(362.4, 80.5, 550.6, 80.5)}
        ${text("MARK ALL", 61, 88, 6.5, GOTHIC, ' font-style="italic" fill="#777" letter-spacing="1"')}
        ${text("THAT APPLY", 59, 100, 6.5, GOTHIC, ' font-style="italic" fill="#777" letter-spacing="1"')}
        ${checks}
        ${text("Must Rotate Every 1 Hour for Dumping / Desiccant By Hand / Heavy Bottles / Stretch Line", 52, 129.6, 9.2, CALIBRI, ' font-weight="700" textLength="405" lengthAdjust="spacing"')}
        ${text("Keep the Rotation Time the Same for Every Hour.", 515, 129.6, 9.2, CALIBRI, ' font-weight="600" textLength="242" lengthAdjust="spacing"')}
        ${text("! POST This Rotation Schedule on Your MDI BOARD !", 399.4, 143, 9.2, CALIBRI, ` font-weight="700"${middle}`)}
        <text x="54.7" y="167" font-size="12" font-family='${CALIBRI}'>Write In <tspan font-weight="700">Time</tspan></text>
        <text x="54.7" y="200.5" font-size="12" font-family='${CALIBRI}'>Write In <tspan font-weight="700">Position</tspan></text>
        ${line(COL_X, 173.3, RIGHT, 173.3)}
        ${ORDINALS.map((o, c) => text(`${o} Rotation`, colX(c) + COL_W / 2, 180.6, 6.5, CALIBRI, ` font-weight="700"${middle}`)
          + text("Name", colX(c) + COL_W / 2, 202.7, 13, CALIBRI, ` font-weight="700"${middle}`)).join("")}
        ${line(COL_X, TOP, RIGHT, TOP)}
        ${Array.from({ length: ROWS }, (_, r) => line(POS_X, rowY(r + 1), RIGHT, rowY(r + 1))).join("")}
        ${Array.from({ length: COLS + 1 }, (_, c) => line(colX(c), TOP, colX(c), rowY(ROWS))).join("")}
      </g>
      <g class="rot-marks"></g>
      <g class="rot-values" fill="#000"></g>
    </svg>`;
  }

  // The ticks in the "mark all that apply" boxes, on screen and printed.
  const marksSvg = () => [...state.checks].map(id => {
    const [, x, y] = CHECKS[id];
    const cx = x + BOX_W / 2, cy = y + BOX_H / 2;
    return `<path d="M${fmt(cx - 4.5)} ${fmt(cy - 4.5)}L${fmt(cx + 4.5)} ${fmt(cy + 4.5)}M${fmt(cx + 4.5)} ${fmt(cy - 4.5)}L${fmt(cx - 4.5)} ${fmt(cy + 4.5)}" stroke="#000" stroke-width="1.4" stroke-linecap="round"/>`;
  }).join("");

  // The entries, written onto the form (printout only; on screen they're inputs).
  function valuesSvg() {
    let out = "";
    for (const [id, { box: [x0, y0, x1, y1], kind }] of Object.entries(FIELDS)) {
      const s = String(state.values[id] ?? "").trim();
      if (!s) continue;
      const size = fitSize(id, s);
      const squeeze = widthPt(s, size) > room(id) ? ` textLength="${fmt(room(id))}" lengthAdjust="spacingAndGlyphs"` : "";
      const base = kind === "line" ? y1 : (y0 + y1) / 2 + size * 0.36;
      out += text(s, (x0 + x1) / 2, base, size, ARIAL, middle + squeeze);
    }
    return out;
  }

  function inputsHtml() {
    return Object.entries(FIELDS).map(([id, { box: [x0, y0, x1, y1], size, label, kind }]) => {
      const top = kind === "line" ? y1 - size - 3 : y0 + INSET;
      const bottom = kind === "line" ? y1 + 2.5 : y1 - INSET;
      const style = `left:${fmt(x0 + INSET)}pt;width:${fmt(x1 - x0 - 2 * INSET)}pt;top:${fmt(top)}pt;height:${fmt(bottom - top)}pt;font-size:${size}pt`;
      const hint = id === "date" ? ' placeholder="MM/DD/YY"' : "";
      return `<input type="text" class="br-input rot-input" data-field="${id}" autocomplete="off" spellcheck="false" style="${style}" aria-label="${escapeHtml(label)}"${hint}>`;
    }).join("") + Object.entries(CHECKS).map(([id, [label, x, y]]) =>
      `<button type="button" class="br-choice rot-check" data-check="${id}" aria-pressed="false" aria-label="${escapeHtml(label)}"
        style="left:${x}pt;top:${y}pt;width:${fmt(BOX_W + 6 + widthPt(label, 9) * 1.15)}pt;height:${BOX_H}pt"></button>`).join("");
  }

  const tab = el("rotTab");
  const sheet = el("rotSheet");
  const copy = el("rotPrintPage");
  const inputOf = id => sheet.querySelector(`[data-field="${id}"]`);
  const value = id => String(state.values[id] ?? "").trim();

  function sizeInputs() {
    sheet.querySelectorAll(".rot-input").forEach(input => {
      input.style.fontSize = `${fitSize(input.dataset.field, input.value.trim())}pt`;
    });
  }

  function render() {
    sizeInputs();
    const marks = marksSvg();
    sheet.querySelector(".rot-marks").innerHTML = marks;
    copy.querySelector(".rot-marks").innerHTML = marks;
    copy.querySelector(".rot-values").innerHTML = valuesSvg();
    sheet.querySelectorAll("[data-check]").forEach(b => b.setAttribute("aria-pressed", String(state.checks.has(b.dataset.check))));
  }

  function setValue(id, v) {
    state.values[id] = v;
    const input = inputOf(id);
    if (input) input.value = v;
  }

  function fitSheet() {
    const wrap = el("rotSheetWrap");
    if (!wrap.clientWidth) return;
    sheet.style.zoom = String(Math.max(0.45, Math.min(1, wrap.clientWidth / (792 * 96 / 72))));
  }

  // ---- Auto rotation.

  // "06:00" (the time box) plus minutes -> "6:00 AM".
  function timeLabel(start, minutes) {
    const [h, m] = start.split(":").map(Number);
    const t = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
    return `${Math.floor(t / 60) % 12 || 12}:${String(t % 60).padStart(2, "0")} ${t < 720 ? "AM" : "PM"}`;
  }

  // ---- Skills: who's trained on which position. Kept on this computer as
  // the exceptions (everyone is trained on everything until unticked):
  // { "<person, lowercase>": ["<position, lowercase>", ...] }.
  const SKILLS_KEY = "pk030_rotation_skills";
  let notTrained = {};
  try { notTrained = JSON.parse(localStorage.getItem(SKILLS_KEY)) || {}; } catch { /* starts empty */ }
  const saveSkills = () => { try { localStorage.setItem(SKILLS_KEY, JSON.stringify(notTrained)); } catch { /* this visit only */ } };
  const lower = t => t.trim().toLowerCase();
  const posName = r => value(`pos${r}`) || `Position ${r}`;
  const trained = (person, r) => !(notTrained[lower(person)] ?? []).includes(lower(posName(r)));
  function setTrained(person, r, yes) {
    const key = lower(person), pos = lower(posName(r));
    const list = (notTrained[key] ?? []).filter(p => p !== pos);
    if (!yes) list.push(pos);
    if (list.length) notTrained[key] = list; else delete notTrained[key];
    saveSkills();
  }

  // The rows in use (a position or a 1st-rotation name), those that rotate,
  // and the people who rotate: the 1st rotation's (not those staying put),
  // then the extra people, each once.
  function setup(stays, extras) {
    const used = [];
    for (let r = 1; r <= ROWS; r++) if (value(`pos${r}`) || value(`r${r}c1`)) used.push(r);
    const rotating = used.filter(r => !stays.has(r));
    const staying = new Set(used.filter(r => stays.has(r)).map(r => lower(value(`r${r}c1`))).filter(Boolean));
    const seen = new Set(), people = [];
    for (const name of [...rotating.map(r => value(`r${r}c1`)), ...extras]) {
      if (!name || seen.has(lower(name)) || staying.has(lower(name))) continue;
      seen.add(lower(name));
      people.push(name);
    }
    return { used, rotating, people };
  }

  // The cheapest way to pair rows with columns (Hungarian method, square
  // matrix): returns the column for each row.
  function assign(cost) {
    const n = cost.length;
    const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(Infinity), done = new Array(n + 1).fill(false);
      do {
        done[j0] = true;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (done[j]) continue;
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (done[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const col = new Array(n);
    for (let j = 1; j <= n; j++) if (p[j]) col[p[j] - 1] = j - 1;
    return col;
  }

  // Who's on each position in each rotation, from the positions and the 1st
  // rotation on the sheet. Each later rotation is the best fit: only people
  // trained on a position go there; nobody stays on the same position two
  // rotations running unless nobody else trained is free; people go to the
  // positions they've had least and take turns being off (when there are more
  // people than positions); with everyone trained on everything, everyone
  // simply moves down one position. Returns names[row][rotation] and warnings.
  const UNTRAINED = 1e6, EMPTY = 1000, SAME = 100;
  function plan(count, stays, extras) {
    const { used, rotating, people } = setup(stays, extras);
    const R = rotating.length, P = people.length;
    const names = {}, warnings = [];
    for (const r of used) names[r] = [value(`r${r}c1`)];
    for (const r of used) {
      const who = value(`r${r}c1`);
      if (who && !stays.has(r) && !trained(who, r)) warnings.push(`1st rotation: ${who} isn't trained on ${posName(r)}.`);
    }
    // Where each person was last (index in `rotating`, or -1 off), what
    // they've had, and how often they've been off.
    const index = new Map(people.map((name, i) => [lower(name), i]));
    const prev = people.map(() => -1);
    const worked = people.map(() => new Array(R).fill(0));
    const off = people.map(() => 1);
    rotating.forEach((r, j) => {
      const i = index.get(lower(value(`r${r}c1`)));
      if (i !== undefined && prev[i] === -1) { prev[i] = j; worked[i][j] = 1; off[i] = 0; }
    });
    for (let k = 1; k < count; k++) {
      // People and "nobody" (a position left empty) down the side; the
      // positions and "off" across the top.
      const N = P + R;
      const cost = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
        if (i >= P) return j < R ? EMPTY : 0;
        if (j >= R) return 30 + 20 * off[i] + (prev[i] === -1 ? 50 : 0);
        if (!trained(people[i], rotating[j])) return UNTRAINED;
        const step = prev[i] >= 0 ? (((j - prev[i] - 1) % R) + R) % R : j;
        return (prev[i] === j ? SAME : 0) + 10 * worked[i][j] + 0.1 * step;
      }));
      const col = assign(cost);
      const filled = new Array(R).fill(null);
      people.forEach((name, i) => {
        const j = col[i];
        if (j < R && cost[i][j] < UNTRAINED) {
          filled[j] = name;
          if (prev[i] === j) warnings.push(`${ORDINALS[k]} rotation: ${name} stays on ${posName(rotating[j])} (nobody else trained is free).`);
          prev[i] = j;
          worked[i][j]++;
        } else {
          prev[i] = -1;
          off[i]++;
        }
      });
      rotating.forEach((r, j) => {
        names[r].push(filled[j] ?? "");
        if (!filled[j]) warnings.push(`${ORDINALS[k]} rotation: nobody trained on ${posName(r)} is free.`);
      });
      for (const r of used) if (stays.has(r)) names[r].push(value(`r${r}c1`));
    }
    return { used, names, warnings };
  }

  // Each line's positions, top to bottom, filled into the position column
  // when the line is typed on the sheet (and the column is empty) or chosen
  // in the panel.
  const LINE_POSITIONS = {
    5: ["Packing", "Shippers", "Pallet", "Labeler/Cremer", "Inside Utility", "Outside Utility"],
    7: ["Labeler", "Filler", "Hand Packing 1", "Hand Packing 2", "Shipper/Casepacker", "Inside Utility", "Outside Utility"],
    8: ["Filler", "Labeler", "Inside Utility", "Outside Utility", "Case Packer"],
    9: ["Labeler/Cremer", "Inside Utility", "Outside Utility", "Case Packer"],
    10: ["Labeler", "Cremer", "Utility", "Case Packer"],
    12: ["Labeler", "Cremer", "Utility", "Case Packer"]
  };
  // "5", "Line 5", "L05", "VPKL05" -> "5".
  const lineKey = t => { const m = String(t).match(/(\d+)/); return m ? String(Number(m[1])) : ""; };

  function fillPositions(line, { ask = true } = {}) {
    const list = LINE_POSITIONS[line];
    if (!list) return false;
    const typed = Array.from({ length: ROWS }, (_, i) => value(`pos${i + 1}`));
    const same = typed.every((t, i) => t === (list[i] ?? ""));
    if (ask && !same && typed.some(Boolean) && !confirm(`Replace the positions on the sheet with Line ${line}'s?`)) return false;
    typed.forEach((_, i) => setValue(`pos${i + 1}`, list[i] ?? ""));
    el("rotPreset").value = line;
    render();
    renderStays();
    renderSkills();
    return true;
  }

  // The "stays put" list follows the position names on the sheet.
  const stays = new Set();
  function renderStays() {
    el("rotStays").innerHTML = Array.from({ length: ROWS }, (_, i) => {
      const r = i + 1;
      const name = value(`pos${r}`);
      return `<label class="check-inline rot-stay"><input type="checkbox" data-stay="${r}"${stays.has(r) ? " checked" : ""}>
        <span>${r}. ${name ? escapeHtml(name) : `<span class="muted">Position ${r}</span>`}</span></label>`;
    }).join("");
  }

  // The skills grid under the sheet: the people who rotate down the side,
  // the positions that rotate across the top.
  function renderSkills() {
    const extras = el("rotExtras").value.split(/\n|,/).map(t => t.trim()).filter(Boolean);
    const { rotating, people } = setup(stays, extras);
    const shown = people.length > 0 && rotating.length > 0;
    el("rotSkillsNone").classList.toggle("hidden", shown);
    el("rotSkills").classList.toggle("hidden", !shown);
    if (!shown) { el("rotSkills").innerHTML = ""; return; }
    el("rotSkills").innerHTML = `<thead><tr><th>Name</th>${rotating.map(r => `<th>${escapeHtml(posName(r))}</th>`).join("")}</tr></thead>
      <tbody>${people.map(name => `<tr><th>${escapeHtml(name)}</th>${rotating.map(r => `<td><input type="checkbox"
        data-skill-person="${escapeHtml(name)}" data-skill-row="${r}" aria-label="${escapeHtml(`${name} trained on ${posName(r)}`)}"${trained(name, r) ? " checked" : ""}></td>`).join("")}</tr>`).join("")}</tbody>`;
  }

  function autoRotate() {
    const count = Number(el("rotCount").value);
    const every = Number(el("rotEvery").value);
    const start = el("rotStart").value;
    const extras = el("rotExtras").value.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    const { used, names, warnings } = plan(count, stays, extras);
    if (!used.length || !used.some(r => value(`r${r}c1`))) {
      showMsg("rotAutoMsg", "Type the positions and the 1st rotation's names on the sheet first.", false);
      return;
    }
    // Names typed in the later rotations would be replaced: ask first.
    const typed = used.some(r => Array.from({ length: COLS - 1 }, (_, c) => value(`r${r}c${c + 2}`)).some(Boolean));
    if (typed && !confirm("Replace the names already in the 2nd to 8th rotations?")) return;
    for (let c = 1; c <= COLS; c++) {
      setValue(`time${c}`, start && c <= count ? timeLabel(start, (c - 1) * every) : (c <= count ? value(`time${c}`) : ""));
      for (let r = 1; r <= ROWS; r++) {
        if (c === 1) continue;
        setValue(`r${r}c${c}`, c <= count && names[r] ? names[r][c - 1] : "");
      }
    }
    render();
    showMsg("rotAutoMsg", `Filled ${count} rotation${count === 1 ? "" : "s"}${start ? `, from ${timeLabel(start, 0)} every ${every < 60 ? `${every} minutes` : every === 60 ? "hour" : `${every / 60} hours`}` : ""}.`);
    el("rotWarnings").innerHTML = warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("");
  }

  sheet.innerHTML = pageSvg() + inputsHtml();
  copy.innerHTML = pageSvg();
  new ResizeObserver(fitSheet).observe(el("rotSheetWrap"));
  renderStays();
  renderSkills();

  tab.addEventListener("input", e => {
    if (e.target.id === "rotExtras") { renderSkills(); return; }
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    render();
    if (/^pos\d$/.test(id)) renderStays();
    if (/^pos\d$|^r\dc1$/.test(id)) renderSkills();
    // Typing a line with preset positions fills an empty position column.
    if (id === "line" && LINE_POSITIONS[lineKey(e.target.value)]
      && Array.from({ length: ROWS }, (_, i) => value(`pos${i + 1}`)).every(t => !t)) {
      fillPositions(lineKey(e.target.value), { ask: false });
      showMsg("rotAutoMsg", `Filled in Line ${lineKey(e.target.value)}'s positions.`);
    }
  });
  el("rotPreset").innerHTML = Object.keys(LINE_POSITIONS).map(l => `<option value="${l}">Line ${l}</option>`).join("");
  el("rotPresetBtn").addEventListener("click", () => {
    if (fillPositions(el("rotPreset").value)) showMsg("rotAutoMsg", `Filled in Line ${el("rotPreset").value}'s positions.`);
  });
  sheet.addEventListener("click", e => {
    const box = e.target.closest("[data-check]");
    if (!box) return;
    const id = box.dataset.check;
    if (state.checks.has(id)) state.checks.delete(id); else state.checks.add(id);
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
  el("rotStays").addEventListener("change", e => {
    const r = Number(e.target.dataset.stay);
    if (!r) return;
    if (e.target.checked) stays.add(r); else stays.delete(r);
    renderSkills();
  });
  el("rotSkills").addEventListener("change", e => {
    const box = e.target.closest("[data-skill-person]");
    if (box) setTrained(box.dataset.skillPerson, Number(box.dataset.skillRow), box.checked);
  });
  el("rotAutoBtn").addEventListener("click", autoRotate);

  el("rotClearBtn").addEventListener("click", () => {
    sheet.querySelectorAll(".rot-input").forEach(i => { i.value = ""; });
    state.values = {};
    state.checks.clear();
    stays.clear();
    el("rotExtras").value = "";
    renderStays();
    renderSkills();
    render();
    el("rotAutoMsg").textContent = "";
    el("rotWarnings").innerHTML = "";
  });

  el("rotPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the schedule instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "rotation";
  });
  onViewShown("rotTab", () => requestAnimationFrame(fitSheet));

  // For the Activity Log, e.g. "Line 10, 3rd shift, 11/14/26".
  function summary() {
    return [value("line") && `Line ${value("line").replace(/^line\s*/i, "")}`, value("shift") && `${value("shift")} shift`.replace(/shift shift$/i, "shift"), value("date")]
      .filter(Boolean).join(", ");
  }

  render();
  return { state, FIELDS, plan, summary };
})();
