// Quality check for the yield sheet, run before printing (and shown live on
// the Yield Sheet). Built-in rules only: nothing leaves the computer.
//
// It compares the sheet with what the imported JDE reports say (WO Close-out,
// Packaging Pallet Transfers, Charge Report), with Stored Data, and with
// common-sense limits, and returns a list of findings:
//   { level: "error" | "warn" | "info", field, title, text, fix? }
// "error" is something almost surely wrong (red), "warn" something to look
// at (yellow), "info" a reminder. `fix` = { field, value, label } is a
// correction that can be applied with one click.
const QualityCheck = (() => {
  const LOW = 0.945;
  const HIGH = 1.024999;
  const num = v => (String(v ?? "").trim() === "" ? null : Number(v));
  const same = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-6;
  const fmt = n => (n === null || n === undefined || Number.isNaN(n) ? "?"
    : n.toLocaleString("en-US", { maximumFractionDigits: 3 }));
  const pct = r => `${(Math.round(r * 10000) / 100).toFixed(2)}%`;
  const norm = s => String(s ?? "").trim().toUpperCase();
  const inRange = r => r !== null && r >= LOW && r <= HIGH;
  const LABELS = {
    fgItem: "FG Item", woNumber: "WO #", bulkItem: "Bulk Item", dateCreated: "Date", createdBy: "Created By",
    qtyCompleted: "Qty Completed", retains: "Retains", donations: "Donations", stability: "Stability",
    fillRate: "Count", bulkIssued: "Issued", bulkRejected: "Rejected", bulkReturned: "Returned",
    pieceWt: "Piece Wt", scrap1: "Pkg Scrap #1", scrap2: "Pkg Scrap #2", scrap3: "Pkg Scrap #3",
    mfgScrap: "Mfg Scrap", videoJetCount: "VideoJet Count", palletLayers: "Layers", palletBoxes: "Boxes"
  };

  // ctx: { data, results, facts, storedCount(item), storedPieceWt(item),
  //        saved: [{ id, woNumber, dateCreated }], editingId, dirty, today, compute(data) }
  function run(ctx) {
    const { data, results: r, facts } = ctx;
    const out = [];
    const add = (level, field, title, text, fix) => out.push({ level, field, title, text, fix });
    const fixTo = (field, value, label) => ({ field, value: String(value), label: label ?? `Use ${value}` });

    // --- Against the imported JDE reports -----------------------------------
    if (facts) {
      const wo = norm(data.woNumber);
      if (facts.woNumber && wo && wo !== norm(facts.woNumber)) {
        add("error", "woNumber", "WO # doesn't match the reports",
          `The sheet says WO ${data.woNumber.trim()}, the imported reports are for WO ${facts.woNumber}. The reports won't print with this sheet.`,
          fixTo("woNumber", facts.woNumber, `Use ${facts.woNumber}`));
      }
      const reportFg = facts.closeout?.fgItem ?? facts.pallet?.fgItem ?? facts.fgItems?.[0] ?? null;
      if (facts.fgItems?.length > 1) {
        add("warn", "fgItem", "The reports name different FG items",
          `The reports say ${facts.fgItems.join(" and ")}. Check which one this work order made.`);
      }
      if (reportFg && norm(data.fgItem) && norm(data.fgItem) !== norm(reportFg)) {
        add("error", "fgItem", "FG Item doesn't match the reports",
          `The sheet says ${data.fgItem.trim()}, the ${facts.closeout?.fgItem ? "WO Close-out" : "reports"} say${facts.closeout?.fgItem ? "s" : ""} ${reportFg}.`,
          fixTo("fgItem", reportFg, `Use ${reportFg}`));
      }
      const reportBulk = facts.closeout?.bulkItem ?? facts.charge?.bulkItem ?? null;
      if (reportBulk && norm(data.bulkItem) && norm(data.bulkItem) !== norm(reportBulk)) {
        const others = facts.closeout?.otherBulkItems?.map(norm) ?? [];
        add(others.includes(norm(data.bulkItem)) ? "warn" : "error", "bulkItem", "Bulk Item doesn't match the reports",
          `The sheet says ${data.bulkItem.trim()}, the ${facts.closeout?.bulkItem ? "WO Close-out" : "Charge Report"} says ${reportBulk}.`,
          fixTo("bulkItem", reportBulk, `Use ${reportBulk}`));
      } else if (facts.closeout?.otherBulkItems?.length) {
        add("info", "bulkItem", "The Close-out lists more than one bulk",
          `It also issues ${facts.closeout.otherBulkItems.join(", ")}. Check that ${reportBulk} is the bulk this sheet is for.`);
      }
      if (facts.charge?.bulkItem && facts.closeout?.bulkItem && norm(facts.charge.bulkItem) !== norm(facts.closeout.bulkItem)) {
        add("warn", "bulkItem", "The Charge Report and Close-out name different bulks",
          `Charge Report: ${facts.charge.bulkItem}; WO Close-out: ${facts.closeout.bulkItem}.`);
      }

      const qty = num(data.qtyCompleted);
      const completed = facts.closeout?.completed ?? null;
      const palletTotal = facts.pallet?.totalPackaged ?? null;
      const reportQty = completed ?? palletTotal;
      if (reportQty !== null && qty !== null && !same(qty, reportQty)) {
        add("warn", "qtyCompleted", "Qty Completed doesn't match the reports",
          `The sheet says ${fmt(qty)}, the ${completed !== null ? "WO Close-out" : "Pallet Transfers"} says ${fmt(reportQty)}.`,
          fixTo("qtyCompleted", reportQty, `Use ${fmt(reportQty)}`));
      }
      if (completed !== null && palletTotal !== null && !same(completed, palletTotal)) {
        add("warn", "qtyCompleted", "The reports disagree on bottles",
          `WO Close-out Quantity Completed is ${fmt(completed)}, Pallet Transfers Total Qty is ${fmt(palletTotal)} (${fmt(palletTotal - completed)} difference). A pallet may be missing from one of them.`);
      }

      const issued = num(data.bulkIssued);
      const coIssued = facts.closeout?.bulkIssued ?? null;
      const charged = facts.charge?.total ?? null;
      const reportIssued = coIssued ?? charged;
      if (reportIssued !== null && issued !== null && !same(issued, reportIssued)) {
        add("warn", "bulkIssued", "Issued doesn't match the reports",
          `The sheet says ${fmt(issued)} TH, the ${coIssued !== null ? "WO Close-out" : "Charge Report"} says ${fmt(reportIssued)} TH.`,
          fixTo("bulkIssued", reportIssued, `Use ${fmt(reportIssued)}`));
      }
      if (coIssued !== null && charged !== null && !same(coIssued, charged)) {
        add("warn", "bulkIssued", "The reports disagree on bulk issued",
          `WO Close-out issued ${fmt(coIssued)} TH, the Charge Report charged ${fmt(charged)} TH (${fmt(Math.round((charged - coIssued) * 1000) / 1000)} TH difference). A container may be missing from one of them.`);
      }
      const returned = num(data.bulkReturned) ?? 0;
      const coReturned = facts.closeout?.bulkReturned ?? null;
      if (coReturned !== null && !same(returned, coReturned)) {
        add("warn", "bulkReturned", "Returned doesn't match the WO Close-out",
          `The sheet says ${fmt(returned)} TH, the Close-out says ${fmt(coReturned)} TH.`,
          fixTo("bulkReturned", coReturned, `Use ${fmt(coReturned)}`));
      }
    } else {
      add("info", null, "No JDE reports to check against",
        "Import the WO Close-out, Pallet Transfers and Charge Report PDFs to cross-check WO, FG, bulk, bottles and issued bulk.");
    }

    // --- Against Stored Data -------------------------------------------------
    const fg = norm(data.fgItem);
    const count = num(data.fillRate);
    const storedCount = fg ? ctx.storedCount(fg) : null;
    if (storedCount !== null && count !== null && !same(count, storedCount)) {
      add("warn", "fillRate", "Count differs from Stored Data",
        `Stored Data has ${fg} at ${fmt(storedCount)} per bottle; the sheet says ${fmt(count)}.`,
        fixTo("fillRate", storedCount, `Use ${fmt(storedCount)}`));
    } else if (fg && storedCount === null) {
      add("info", "fillRate", `${fg} isn't in Stored Data`,
        "Check the Count by hand. Adding it to Stored Data fills it in next time.");
    }
    const bulk = norm(data.bulkItem);
    const pw = num(data.pieceWt);
    const storedPw = bulk ? ctx.storedPieceWt(bulk) : null;
    if (storedPw !== null && pw !== null && !same(pw, storedPw)) {
      add("warn", "pieceWt", "Piece Wt differs from Stored Data",
        `Stored Data has ${bulk} at ${fmt(storedPw)} mg; the sheet says ${fmt(pw)} mg.`,
        fixTo("pieceWt", storedPw, `Use ${fmt(storedPw)}`));
    }

    // --- Common sense --------------------------------------------------------
    ["qtyCompleted", "retains", "donations", "stability"].forEach(id => {
      const v = num(data[id]);
      if (v !== null && !Number.isInteger(v)) {
        add("warn", id, `${LABELS[id]} isn't a whole number`, `${fmt(v)} bottles: bottles are counted whole.`,
          fixTo(id, Math.round(v), `Use ${fmt(Math.round(v))}`));
      }
    });
    if (count !== null && (!Number.isInteger(count) || count > 2000 || count < 1)) {
      add("warn", "fillRate", "Count looks unusual", `${fmt(count)} per bottle. Check the label claim.`);
    }
    const qty = num(data.qtyCompleted) ?? 0;
    const extras = ["retains", "donations", "stability"].map(id => [id, num(data[id]) ?? 0]);
    extras.forEach(([id, v]) => {
      if (qty > 0 && v > Math.max(50, qty * 0.05)) {
        add("warn", id, `${LABELS[id]} looks high`, `${fmt(v)} bottles is ${fmt(Math.round(v / qty * 1000) / 10)}% of Qty Completed. Check it isn't the wrong box or an extra digit.`);
      }
    });
    if (pw !== null && (pw < 50 || pw > 5000)) {
      add("warn", "pieceWt", "Piece Wt looks unusual", `${fmt(pw)} mg per piece. Check the unit (mg, not g).`);
    }
    const tare = num(data.tareWeight) ?? 6;
    ["scrap1", "scrap2", "scrap3", "mfgScrap"].forEach(id => {
      const v = num(data[id]);
      if (v === null || v === 0) return;
      if (v <= tare) {
        add("warn", id, `${LABELS[id]} is under the container tare`,
          `${fmt(v)} kg gross is at or under the ${fmt(tare)} kg tare, so the net is ${fmt(Math.round((v - tare) * 100) / 100)} kg. Enter the gross weight with the container, or 0 for none.`);
      } else if (v > 300) {
        add("warn", id, `${LABELS[id]} looks heavy`, `${fmt(v)} kg. Check for an extra digit.`);
      }
    });
    if (r.error) {
      add("error", "bulkIssued", "The yield can't be worked out", r.error);
    } else {
      const y = r.finalYieldRatio;
      if (y < 0.8 || y > 1.2) {
        add("error", null, `Final Yield ${pct(y)} is far off`, "That's very unlikely; something is probably mistyped. Check Count, Issued and Qty Completed.");
      } else if (!inRange(y)) {
        add("warn", null, `Final Yield ${pct(y)} is out of range`, `It's ${y < LOW ? "below 94.5%" : "above 102.4999%"}: ${r.statusLabel}. Double-check the entries before raising it.`);
      }
      if (!inRange(y)) {
        if (num(data.videoJetCount) === null) {
          add("error", "videoJetCount", "VideoJet Count is needed", "The yield is out of range, so the sheet needs the VideoJet Count.");
        }
        if (num(data.palletLayers) === null || num(data.palletBoxes) === null) {
          add("info", "palletLayers", "Partial pallet not filled in", "With Layers and Boxes, the sheet prints e.g. \"5 Layers + 2 Boxes\"; without them the line prints blank.");
        }
        // A slipped digit: would ×10 or ÷10 on one entry bring it in range?
        const confirmed = new Set();
        if (facts) {
          if (facts.closeout?.completed !== null && facts.closeout?.completed !== undefined && same(num(data.qtyCompleted), facts.closeout.completed)) confirmed.add("qtyCompleted");
          const iss = facts.closeout?.bulkIssued ?? facts.charge?.total ?? null;
          if (iss !== null && same(num(data.bulkIssued), iss)) confirmed.add("bulkIssued");
        }
        if (storedCount !== null && same(count, storedCount)) confirmed.add("fillRate");
        if (storedPw !== null && same(pw, storedPw)) confirmed.add("pieceWt");
        const guesses = [];
        ["fillRate", "qtyCompleted", "bulkIssued", "retains", "donations", "pieceWt", "scrap1", "scrap2", "scrap3", "mfgScrap"].forEach(id => {
          const v = num(data[id]);
          if (!v || confirmed.has(id)) return;
          [10, 0.1, 100, 0.01].forEach(f => {
            const value = Number((v * f).toPrecision(12));
            const tryR = ctx.compute({ ...data, [id]: String(value) });
            if (!tryR.error && inRange(tryR.finalYieldRatio)) guesses.push({ id, value, y: tryR.finalYieldRatio, f });
          });
        });
        const offered = new Set(out.filter(f => f.fix).map(f => `${f.fix.field}=${Number(f.fix.value)}`));
        guesses.filter(g => !offered.has(`${g.id}=${g.value}`)).slice(0, 3).forEach(g => add("warn", g.id, `Possible typo in ${LABELS[g.id]}`,
          `With ${fmt(g.value)} instead of ${fmt(num(data[g.id]))} (${g.f > 1 ? "a digit left off" : "an extra digit"}), the yield would be ${pct(g.y)}.`,
          fixTo(g.id, g.value, `Use ${fmt(g.value)}`)));
      }
    }

    // --- The sheet itself ------------------------------------------------------
    if (!String(data.createdBy ?? "").trim()) {
      add("warn", "createdBy", "Created By is empty", "The \"Yield Sheet Created By\" line prints blank.");
    }
    if (data.dateCreated) {
      if (data.dateCreated > ctx.today) add("warn", "dateCreated", "The date is in the future", `${data.dateCreated} is after today.`, fixTo("dateCreated", ctx.today, "Use today"));
      else {
        const days = Math.round((Date.parse(ctx.today) - Date.parse(data.dateCreated)) / 864e5);
        if (days > 14) add("info", "dateCreated", `The date is ${days} days ago`, "Fine for an older work order; check it's not a leftover date.", fixTo("dateCreated", ctx.today, "Use today"));
      }
    }
    const wo = norm(data.woNumber);
    if (wo && !/^\d{6,8}$/.test(wo)) {
      add("warn", "woNumber", "WO # looks unusual", `"${data.woNumber.trim()}": work orders are usually 7 digits.`);
    }
    const twin = wo && ctx.saved.find(s => s.id !== ctx.editingId && norm(s.woNumber) === wo);
    if (twin) {
      add("warn", "woNumber", "This WO already has a saved sheet",
        `WO ${data.woNumber.trim()} was saved${twin.dateCreated ? ` on ${twin.dateCreated}` : ""}. Open it from Saved sheets instead of making a second one, unless that's intended.`);
    }
    if (ctx.dirty) add("info", null, "Not saved yet", "Save the sheet so it's in Saved sheets and the database.");

    const order = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  return { run, LABELS };
})();
