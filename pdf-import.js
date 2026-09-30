// Reads the JDE report PDFs (text-based, produced by PDFlib) and pulls out the
// values the PK030 yield sheet needs. Parsing works on word positions, because
// the PDFs' raw text order does not follow the printed layout.
const PdfImport = (() => {
  const PDFJS_URL = new URL("assets/vendor/pdfjs/pdf.min.mjs", document.baseURI).href;
  const WORKER_URL = new URL("assets/vendor/pdfjs/pdf.worker.min.mjs", document.baseURI).href;
  let pdfjsPromise = null;

  function loadPdfjs() {
    pdfjsPromise ??= import(PDFJS_URL).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return lib;
    });
    return pdfjsPromise;
  }

  const isNumber = s => /^-?[\d,]*\.?\d+$/.test(s);
  const toNumber = s => (s === undefined || s === "" ? null : parseFloat(String(s).replace(/,/g, "")));

  // pdf.js text items can hold several words; split them, spreading the
  // item's width across its characters.
  function splitWords(str, x, width, y) {
    const charW = str.length ? width / str.length : 0;
    return [...str.matchAll(/\S+/g)].map(m => ({
      s: m[0],
      x0: x + m.index * charW,
      x1: x + (m.index + m[0].length) * charW,
      y
    }));
  }

  function groupLines(tokens) {
    tokens.sort((a, b) => a.y - b.y);
    const lines = [];
    for (const t of tokens) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(line.y - t.y) <= 3) line.tokens.push(t);
      else lines.push({ y: t.y, tokens: [t] });
    }
    for (const line of lines) {
      line.tokens.sort((a, b) => a.x0 - b.x0);
      line.text = line.tokens.map(t => t.s).join(" ");
    }
    return lines;
  }

  async function extractPages(file) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { height } = page.getViewport({ scale: 1 });
      const { items } = await page.getTextContent();
      const tokens = items
        .filter(it => it.str && it.str.trim())
        .flatMap(it => splitWords(it.str, it.transform[4], it.width, height - it.transform[5]));
      pages.push(groupLines(tokens));
    }
    return pages;
  }

  function findSpan(tokens, label) {
    const words = label.toLowerCase().split(/\s+/);
    for (let i = 0; i + words.length <= tokens.length; i++) {
      if (words.every((w, k) => tokens[i + k].s.toLowerCase() === w)) {
        return { x0: tokens[i].x0, x1: tokens[i + words.length - 1].x1 };
      }
    }
    return null;
  }

  // Rows under every occurrence of a header line that has all `labels`.
  // Right-aligned numbers go to the column whose header ends nearest them;
  // everything else goes to the column whose header starts at or left of it.
  function readTable(pages, labels, stopRe) {
    const rows = [];
    for (const lines of pages) {
      for (let i = 0; i < lines.length; i++) {
        const spans = labels.map(l => findSpan(lines[i].tokens, l));
        if (spans.some(s => !s)) continue;
        for (let j = i + 1; j < lines.length && !stopRe.test(lines[j].text); j++) {
          const row = {};
          for (const t of lines[j].tokens) {
            let col = -1;
            if (isNumber(t.s)) {
              let best = Infinity;
              spans.forEach((s, k) => {
                const d = Math.abs(t.x1 - s.x1);
                if (d < best) { best = d; col = k; }
              });
              if (best > 15) col = -1;
            }
            if (col < 0) {
              spans.forEach((s, k) => {
                if (s.x0 <= t.x0 + 5 && (col < 0 || s.x0 > spans[col].x0)) col = k;
              });
            }
            if (col < 0) continue;
            const key = labels[col];
            row[key] = row[key] ? `${row[key]} ${t.s}` : t.s;
          }
          if (Object.keys(row).length) rows.push(row);
        }
      }
    }
    return rows;
  }

  function allText(pages) {
    return pages.flat().map(l => l.text).join("\n");
  }

  function parsePalletTransfers(pages) {
    const text = allText(pages);
    const header = text.match(/Order Number\s+(\S+)\s+Item:\s+(\S+)\s+(.*?)\s+Lot\/SN/);
    const totals = [...text.matchAll(/Total Qty\.?\s+([\d,]+(?:\.\d+)?)/g)];
    return {
      woNumber: header?.[1] ?? null,
      fgItem: header?.[2] ?? null,
      description: header?.[3] ?? null,
      totalPackaged: totals.length ? toNumber(totals[totals.length - 1][1]) : null
    };
  }

  const PACKAGING_DESCRIPTION = /^(SHIPPER|PALLET|BOTTLE|CAP|LABEL|CARTON|INSERT|DESICCANT|COTTON|SEAL|LINER|BAG|BOX|TAPE|FILM|SLEEVE|DIVIDER|TRAY|LID|JAR|POUCH|WRAP)\b/i;

  // The bulk row in the Issues table, most certain first: an item saved on the
  // Stored Data tab, a BU… item, then any item that doesn't look like packaging
  // (plain-number shippers/pallets, CP… bottles, PK… caps/labels, or a
  // packaging description).
  function findBulkRows(issues) {
    const rows = issues.filter(r => r["Item Number"]);
    const looksLikeBulk = r => !/^\d+$/.test(r["Item Number"])
      && !/^(CP|PK)/i.test(r["Item Number"])
      && !PACKAGING_DESCRIPTION.test(r["Item Description"] || "");
    const tiers = [
      rows.filter(r => StoredData.bulkItems.find(r["Item Number"])),
      rows.filter(r => /^BU/i.test(r["Item Number"])),
      rows.filter(looksLikeBulk)
    ];
    return tiers.find(t => t.length) ?? [];
  }

  function parseCloseOut(pages) {
    const yieldRow = readTable(pages,
      ["Order Number", "Order Type", "Item Number", "WO/ UOM", "Expected Quantity", "Quantity Completed", "Yield %"],
      /Router|Issues/)[0] || {};
    const issues = readTable(pages,
      ["Item Number", "Item Description", "Quantity Ordered", "MES Quantity", "Return Quantity", "Issued Quantity"],
      /Container Summary|R5504801/);
    const bulkRows = findBulkRows(issues);
    const bulk = bulkRows[0];
    return {
      woNumber: yieldRow["Order Number"] ?? null,
      fgItem: yieldRow["Item Number"] ?? null,
      expected: toNumber(yieldRow["Expected Quantity"]),
      completed: toNumber(yieldRow["Quantity Completed"]),
      jdeYield: toNumber(yieldRow["Yield %"]),
      bulkItem: bulk?.["Item Number"] ?? null,
      bulkDescription: bulk?.["Item Description"] ?? null,
      bulkIssued: bulk ? toNumber(bulk["Issued Quantity"]) : null,
      bulkReturned: bulk ? (toNumber(bulk["Return Quantity"]) ?? 0) : null,
      otherBulkItems: bulkRows.slice(1).map(r => r["Item Number"])
    };
  }

  function detect(pages, fileName) {
    const head = pages.length ? pages[0].slice(0, 6).map(l => l.text).join(" ") : "";
    const probe = `${head} ${fileName}`;
    if (/R593111FG|Packaging Pallet Transfers/i.test(probe)) return "pallet";
    if (/R5504801|WO Close out Report/i.test(probe)) return "closeout";
    if (/R593111CV/i.test(probe)) return "charge";
    return null;
  }

  const fmtNum = n => (n === null || n === undefined ? "?" : n.toLocaleString("en-US", { maximumFractionDigits: 3 }));

  // Returns { values, log }; values only holds fields that were found.
  async function readReports(files) {
    const log = [];
    const reports = [];
    for (const file of files) {
      let pages;
      try {
        pages = await extractPages(file);
      } catch (err) {
        log.push({ level: "error", text: `${file.name}: couldn't read this PDF (${err.message}).` });
        continue;
      }
      const type = detect(pages, file.name);
      if (type === "pallet") reports.push({ type, file, ...parsePalletTransfers(pages) });
      else if (type === "closeout") reports.push({ type, file, ...parseCloseOut(pages) });
      else if (type === "charge") log.push({ level: "warn", text: `${file.name}: Charge Reports (R593111CV) aren't needed — the WO Close-out already has the bulk issued and returned.` });
      else log.push({ level: "error", text: `${file.name}: not a WO Close-out (R5504801) or Packaging Pallet Transfers (R593111FG) report.` });
    }

    const pallet = reports.find(r => r.type === "pallet");
    const closeout = reports.find(r => r.type === "closeout");

    const wos = [...new Set(reports.map(r => r.woNumber).filter(Boolean))];
    if (wos.length > 1) {
      log.push({ level: "error", text: `These reports are for different work orders (${wos.join(", ")}). Import one work order at a time.` });
      return { values: {}, log };
    }
    const fgs = [...new Set(reports.map(r => r.fgItem).filter(Boolean))];
    if (fgs.length > 1) {
      log.push({ level: "warn", text: `FG Item differs between reports (${fgs.join(", ")}); used ${fgs[0]}.` });
    }

    const values = {};
    if (wos[0]) values.woNumber = wos[0];
    if (fgs[0]) values.fgItem = fgs[0];

    if (pallet) {
      if (pallet.totalPackaged === null) {
        log.push({ level: "warn", text: `${pallet.file.name}: no "Total Qty." found.` });
      }
      log.push({ level: "ok", text: `Packaging Pallet Transfers: WO ${pallet.woNumber ?? "?"}, FG ${pallet.fgItem ?? "?"}${pallet.description ? ` (${pallet.description})` : ""}, Total Qty ${fmtNum(pallet.totalPackaged)}.` });
    }

    if (closeout) {
      if (closeout.bulkItem) {
        values.bulkItem = closeout.bulkItem;
        if (closeout.bulkIssued !== null) values.bulkIssued = closeout.bulkIssued;
        values.bulkRejected = closeout.bulkReturned;
        log.push({ level: "ok", text: `WO Close-out: bulk ${closeout.bulkItem}${closeout.bulkDescription ? ` (${closeout.bulkDescription})` : ""}, issued ${fmtNum(closeout.bulkIssued)}, returned ${fmtNum(closeout.bulkReturned)}.` });
        if (closeout.otherBulkItems.length) {
          log.push({ level: "warn", text: `The Close-out has more than one possible bulk item (${[closeout.bulkItem, ...closeout.otherBulkItems].join(", ")}); used ${closeout.bulkItem}. Saving the right one on the Stored Data tab makes it the one picked.` });
        }
      } else {
        log.push({ level: "warn", text: `${closeout.file.name}: couldn't tell which Issues row is the bulk item. Enter Bulk Item, Issued Bulk and Bulk Rejected/Returned by hand, or save the bulk item on the Stored Data tab and import again.` });
      }
      if (closeout.completed === null) {
        log.push({ level: "warn", text: `${closeout.file.name}: no Quantity Completed found.` });
      }
      if (closeout.jdeYield !== null) {
        log.push({ level: "info", text: `JDE WO yield: ${fmtNum(closeout.jdeYield)}% (expected ${fmtNum(closeout.expected)}, completed ${fmtNum(closeout.completed)}).` });
      }
    }

    const completed = closeout?.completed ?? null;
    const palletTotal = pallet?.totalPackaged ?? null;
    if (completed !== null) {
      values.qtyCompleted = completed;
      if (palletTotal !== null && palletTotal !== completed) {
        log.push({ level: "warn", text: `Pallet Transfers total (${fmtNum(palletTotal)}) doesn't match Close-out Quantity Completed (${fmtNum(completed)}); used the Close-out.` });
      }
    } else if (palletTotal !== null) {
      values.qtyCompleted = palletTotal;
      log.push({ level: "warn", text: `No Close-out Quantity Completed, so Quantity Completed uses the Pallet Transfers total (${fmtNum(palletTotal)}).` });
    }

    return { values, log };
  }

  return { readReports };
})();
