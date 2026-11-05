// Pulse Check tab: "Prepare for Your Pulse Check Conversation", the prep sheet
// to jot down before a pulse check with a manager. There's no file of the
// original, only a photo of the printed page, so it's drawn from the photo's
// proportions on a Letter portrait page (in pt from the top-left of the
// page). On screen each of the five answers is a box typed onto its ruled
// lines; printing gives the sheet with the answers written in, or the blank
// sheet. Long answers wrap and shrink to fit their box, the same on screen
// and printed.
// Uses el, escapeHtml and onViewShown from app.js.
const PulseCheck = (() => {
  const ARIAL = `Arial, "Liberation Sans", Helvetica, sans-serif`;
  const CALIBRI = `Calibri, Carlito, "Segoe UI", Arial, sans-serif`;
  const GRAY = "#7f7f7f";
  const [LEFT, RIGHT] = [40, 572];
  const RULE_GAP = 9.5; // pt between the ruled lines

  // The three coloured bands, each over one or two questions.
  const BANDS = [
    { label: "WHAT: results and goal progress", colour: "#1f5662", top: 111.5, bottom: 127 },
    { label: "HOW: skills and behaviors", colour: "#574a94", top: 316.5, bottom: 334.5 },
    { label: "SUPPORT: what would help", colour: "#a85f2e", top: 463.5, bottom: 482 }
  ];
  // The questions: [id, title, hint, prompt, title baseline, first rule,
  // bottom of its box, length of the first rule as a share of the width].
  const QUESTIONS = [
    ["accomplishment", "1. Accomplishment", "Pick one example from the last 2 months where your work helped the team.",
      "One thing I'm proud of is... / This helped the team by...", 136.3, 169.5, 210.3, 0.56],
    ["goalProgress", "2. Goal progress", "Provide an example of where you are on track and one area still in progress",
      "I'm making progress by... / One area I'm still working on is...", 220.4, 254.5, 293.5, 0.45],
    ["amplifyImpact", "3. Amplify impact", "Choose one skill, behavior, or habit you are building this year.",
      "I'm working on... / I've been trying to improve...", 344.4, 378.5, 440.2, 0.45],
    ["managerSupport", "4. Manager support", "Ask for coaching, clearer priorities, training, feedback, tools, or help removing blockers.",
      "It would help me if you...", 490.2, 524.5, 591.4, 0.45],
    ["communication", "5. Communication", "Share how updates are easiest to understand.",
      "It would help if we...", 600.7, 636.5, 704.7, 0.45]
  ];

  // Each answer box: from just above its first rule to the bottom of its box.
  const FIELDS = Object.fromEntries(QUESTIONS.map(([id, title, , , , rule, bottom]) =>
    [id, { box: [LEFT, rule - 8.8, RIGHT, bottom - 2], rule, label: title.replace(/^\d+\.\s*/, "") }]));
  const SIZE = 8.5;
  const MIN_SIZE = 5;
  const PAD = 3;

  const state = { values: {} };

  const measureCtx = document.createElement("canvas").getContext("2d");
  const widthPt = (s, size) => {
    measureCtx.font = `400 ${size}pt ${ARIAL}`;
    return measureCtx.measureText(s).width * 0.75; // px to pt
  };
  const room = id => FIELDS[id].box[2] - FIELDS[id].box[0] - 2 * PAD;
  // An answer's lines, on the rules at the normal size; shrinking (rules and
  // all) until they fit when there's more than the box holds.
  function wrapLines(id, s) {
    const { box: [, y0, , y1] } = FIELDS[id];
    for (let size = SIZE; ; size -= 0.25) {
      const lines = [];
      for (const para of s.split("\n")) {
        let line = "";
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (line && widthPt(next, size) > room(id)) { lines.push(line); line = word; } else line = next;
        }
        lines.push(line);
      }
      const gap = RULE_GAP * size / SIZE;
      if (lines.length * gap <= y1 - y0 + 0.5 || size <= MIN_SIZE) return { size, gap, lines };
    }
  }

  const fmt = n => +n.toFixed(2);
  const text = (s, x, y, size, extra = "") =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family='${CALIBRI}'${extra}>${escapeHtml(s)}</text>`;
  const rect = (x0, y0, x1, y1, fill = "none", stroke = "#000") =>
    `<rect x="${x0}" y="${y0}" width="${fmt(x1 - x0)}" height="${fmt(y1 - y0)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="0.75"` : ""}/>`;
  const rule = (y, x1) => `<line x1="${LEFT + 2}" y1="${y}" x2="${fmt(x1)}" y2="${y}" stroke="#bfbfbf" stroke-width="0.5"/>`;

  function pageSvg() {
    const width = RIGHT - LEFT;
    // Each band's box runs from the band to the bottom of its last question.
    const bandBottoms = [QUESTIONS[1][6], QUESTIONS[2][6], QUESTIONS[4][6]];
    return `<svg class="br-svg" viewBox="0 0 612 792" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#000">
        ${rect(LEFT, 36, RIGHT, 91)}
        <line x1="150" y1="36" x2="150" y2="91" stroke="#000" stroke-width="0.75"/>
        <image href="assets/pharmavite-logo-qs016a.png" x="74" y="39" width="42" height="49"/>
        ${text("Prepare for Your Pulse Check Conversation", 152.5, 52, 15, ' font-weight="700"')}
        ${text("Take 5–10 minutes to jot down a few words and bring this with you.", 152.5, 61.5, 8, ` fill="${GRAY}"`)}
        ${text("This is a short conversation about your progress, how you are growing, and what support you need. You do not need perfect", 152.5, 71.5, 8)}
        ${text("wording—just come ready with a real example and what would help.", 152.5, 80.5, 8)}
        ${BANDS.map((b, i) => `${rect(LEFT, b.top, RIGHT, b.bottom, b.colour, "")}
          ${text(b.label, LEFT + 3, fmt(b.bottom - (b.bottom - b.top) / 2 + 2.8), 8, ' font-weight="700" fill="#fff"')}
          ${rect(LEFT, b.bottom, RIGHT, bandBottoms[i])}`).join("")}
        ${QUESTIONS.map(([, title, hint, prompt, base, first, bottom, firstShare], i) => `
          ${text(title, LEFT + 3, base, 9.5, ' font-weight="700"')}
          ${text(hint, LEFT + 3, fmt(base + 11.6), 8.5, ` fill="${GRAY}"`)}
          ${text(prompt, LEFT + 3, fmt(base + 21.5), 8.5, ' font-style="italic"')}
          ${rule(first, LEFT + width * firstShare)}${rule(first + RULE_GAP, LEFT + width * 0.45)}${rule(first + 2 * RULE_GAP, LEFT + width * 0.45)}
          ${i === 0 || i === 3 ? `<line x1="${LEFT}" y1="${bottom}" x2="${RIGHT}" y2="${bottom}" stroke="#000" stroke-width="0.75"/>` : ""}`).join("")}
        ${text("Come ready with one example, one goal update, one growth action, and one request for support.", 306, 734, 8, ' font-weight="700" text-anchor="middle"')}
        ${text("Pharmavite | Pulse Check Conversation Prep", 306, 757.5, 7, ` fill="${GRAY}" text-anchor="middle"`)}
      </g>
      <g class="pc-values" fill="#000"></g>
    </svg>`;
  }

  // The answers, written onto their rules (printout only; on screen they're inputs).
  function valuesSvg() {
    let out = "";
    for (const [id, { box: [x0], rule: first }] of Object.entries(FIELDS)) {
      const s = String(state.values[id] ?? "").trim();
      if (!s) continue;
      const { size, gap, lines } = wrapLines(id, s);
      lines.forEach((l, i) => {
        if (!l) return;
        const squeeze = widthPt(l, size) > room(id) ? ` textLength="${fmt(room(id))}" lengthAdjust="spacingAndGlyphs"` : "";
        out += `<text x="${x0 + PAD}" y="${fmt(first - 1.5 * size / SIZE + gap * i)}" font-size="${size}" font-family='${ARIAL}'${squeeze}>${escapeHtml(l)}</text>`;
      });
    }
    return out;
  }

  // The fillable layer on screen: one box per answer, its lines on the rules.
  function inputsHtml() {
    return Object.entries(FIELDS).map(([id, { box: [x0, y0, x1, y1], label }]) =>
      `<textarea class="br-input pc-input" data-field="${id}" autocomplete="off" spellcheck="true" aria-label="${escapeHtml(label)}"
        style="left:${x0}pt;width:${x1 - x0}pt;top:${fmt(y0)}pt;height:${fmt(y1 - y0)}pt;font-size:${SIZE}pt;line-height:${RULE_GAP}pt"></textarea>`).join("");
  }

  const tab = el("pcTab");
  const sheet = el("pcSheet");
  const copy = el("pcPrintPage");

  // On screen, long answers shrink the same way as on the printout.
  function sizeInputs() {
    sheet.querySelectorAll(".pc-input").forEach(input => {
      const s = input.value.trim();
      const { size, gap } = s ? wrapLines(input.dataset.field, s) : { size: SIZE, gap: RULE_GAP };
      input.style.fontSize = `${size}pt`;
      input.style.lineHeight = `${fmt(gap)}pt`;
    });
  }

  // The printed copy is kept up to date as the sheet is filled in, so it's
  // ready (logo loaded) whenever printing starts.
  function render() {
    sizeInputs();
    copy.querySelector(".pc-values").innerHTML = valuesSvg();
  }

  // The sheet keeps the page's proportions and shrinks to fit the panel.
  function fitSheet() {
    const wrap = el("pcSheetWrap");
    if (!wrap.clientWidth) return;
    sheet.style.zoom = String(Math.max(0.45, Math.min(1, wrap.clientWidth / (612 * 96 / 72))));
  }

  sheet.innerHTML = pageSvg() + inputsHtml();
  copy.innerHTML = pageSvg();
  new ResizeObserver(fitSheet).observe(el("pcSheetWrap"));

  tab.addEventListener("input", e => {
    const id = e.target.dataset.field;
    if (!id) return;
    state.values[id] = e.target.value;
    render();
  });

  el("pcClearBtn").addEventListener("click", () => {
    sheet.querySelectorAll(".pc-input").forEach(i => { i.value = ""; });
    state.values = {};
    render();
  });

  el("pcPrintBtn").addEventListener("click", () => window.print());

  // Printing from this tab (the button, Ctrl+P or the browser menu) prints
  // the sheet instead of the yield sheet.
  window.addEventListener("beforeprint", () => {
    if (!tab.classList.contains("hidden")) document.body.dataset.print = "pulseCheck";
  });
  onViewShown("pcTab", () => requestAnimationFrame(fitSheet));

  render();
  return { state, FIELDS };
})();
