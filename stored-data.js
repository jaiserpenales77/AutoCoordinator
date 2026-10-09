// Leads (and the sign-in username linked to each), bulk item piece weights,
// FG item counts and line rates entered on the Stored Data tab. localStorage is the working copy; each local change is reported to
// `StoredData.onChange(field, key, value)` (value null = removed) so it can be
// synced, and `replaceAll` takes in the synced copy without reporting back.
const StoredData = (() => {
  const notify = (field, key, value) => api.onChange?.(field, key, value);

  function read(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  const normItem = s => String(s ?? "").trim().toUpperCase();
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

  // A list of { item, <valueField> } keyed by item number (case-insensitive).
  function itemStore(key, valueField, syncField) {
    const valid = i => i && normItem(i.item) && Number.isFinite(Number(i[valueField]));
    const all = () => read(key).filter(valid).sort((a, b) => byName(a.item, b.item));
    const without = item => all().filter(i => normItem(i.item) !== normItem(item));
    return {
      all,
      save(item, value) {
        localStorage.setItem(key, JSON.stringify([...without(item), { item: normItem(item), [valueField]: Number(value) }]));
        notify(syncField, normItem(item), Number(value));
      },
      remove(item) {
        localStorage.setItem(key, JSON.stringify(without(item)));
        notify(syncField, normItem(item), null);
      },
      replace(list) {
        localStorage.setItem(key, JSON.stringify(list.filter(valid)));
      },
      find(item) {
        const k = normItem(item);
        return k ? all().find(i => normItem(i.item) === k) ?? null : null;
      },
      valid
    };
  }

  // Full Hour, Lunch and Break for each line and FG item, as
  // { line, fgItem, fullHour, lunch, break } keyed by line + FG item
  // (case-insensitive); synced as lineRates["LINE|FG ITEM"] = { fullHour, lunch, break }.
  const RATE_FIELDS = ["fullHour", "lunch", "break"];
  const normLine = s => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const rateKey = (line, fgItem) => `${normLine(line)}|${normItem(fgItem)}`;
  const byLineThenItem = (a, b) => a.line.localeCompare(b.line, undefined, { numeric: true, sensitivity: "base" })
    || a.fgItem.localeCompare(b.fgItem, undefined, { numeric: true, sensitivity: "base" });
  const lineRates = (() => {
    const KEY = "pk030_line_rates";
    const isNumber = v => v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
    // "|" separates line from FG item in the synced key, so neither may hold one.
    const valid = r => !!r && normLine(r.line) !== "" && normItem(r.fgItem) !== ""
      && !String(r.line).includes("|") && !String(r.fgItem).includes("|") && RATE_FIELDS.every(f => isNumber(r[f]));
    const clean = r => ({ line: normLine(r.line), fgItem: normItem(r.fgItem),
      fullHour: Number(r.fullHour), lunch: Number(r.lunch), break: Number(r.break) });
    const all = () => read(KEY).filter(valid).map(clean).sort(byLineThenItem);
    const without = key => all().filter(r => rateKey(r.line, r.fgItem) !== key);
    return {
      all,
      save(rate) {
        const r = clean(rate);
        const key = rateKey(r.line, r.fgItem);
        localStorage.setItem(KEY, JSON.stringify([...without(key), r]));
        notify("lineRates", key, { fullHour: r.fullHour, lunch: r.lunch, break: r.break });
      },
      remove(line, fgItem) {
        const key = rateKey(line, fgItem);
        localStorage.setItem(KEY, JSON.stringify(without(key)));
        notify("lineRates", key, null);
      },
      replace(list) {
        localStorage.setItem(KEY, JSON.stringify((list ?? []).filter(valid).map(clean)));
      },
      find(line, fgItem) {
        const key = rateKey(line, fgItem);
        return normLine(line) && normItem(fgItem) ? all().find(r => rateKey(r.line, r.fgItem) === key) ?? null : null;
      },
      // A synced key back into { line, fgItem }.
      fromKey(key) {
        const [line, fgItem] = String(key).split("|");
        return { line: line ?? "", fgItem: fgItem ?? "" };
      },
      valid
    };
  })();

  const LEADS_KEY = "pk030_leads";
  const LEAD_USERS_KEY = "pk030_lead_users";
  const bulkItems = itemStore("pk030_items", "pieceWt", "bulkItems");
  const fgItems = itemStore("pk030_fg_items", "count", "fgItems");

  function leads() {
    return read(LEADS_KEY).filter(n => typeof n === "string" && n.trim()).sort(byName);
  }

  function addLead(name) {
    const clean = String(name).trim().replace(/\s+/g, " ");
    const list = leads();
    if (!clean || list.some(n => n.toLowerCase() === clean.toLowerCase())) return false;
    localStorage.setItem(LEADS_KEY, JSON.stringify([...list, clean]));
    notify("leads", clean, true);
    return true;
  }

  function removeLead(name) {
    setLeadUsername(name, "");
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads().filter(n => n !== name)));
    notify("leads", name, null);
  }

  // Sign-in usernames linked to leads, as { username: lead name }; each
  // username belongs to one lead.
  const normUser = s => String(s ?? "").trim().toLowerCase();
  const validUsername = u => /^[a-z0-9._-]+$/.test(u);

  function leadUsers() {
    try {
      const v = JSON.parse(localStorage.getItem(LEAD_USERS_KEY));
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  }

  function writeLeadUsers(map) {
    localStorage.setItem(LEAD_USERS_KEY, JSON.stringify(map));
  }

  function usernameForLead(name) {
    const map = leadUsers();
    return Object.keys(map).find(u => map[u] === name) ?? "";
  }

  // The lead a username is linked to, if that lead is still in the list.
  function leadForUser(username) {
    const name = leadUsers()[normUser(username)];
    return name && leads().includes(name) ? name : null;
  }

  // Links `username` to lead `name` ("" unlinks). Returns the lead the
  // username was linked to before, if it was someone else.
  function setLeadUsername(name, username) {
    const u = normUser(username);
    const map = leadUsers();
    const old = Object.keys(map).find(k => map[k] === name);
    const previousLead = u && map[u] !== name ? map[u] ?? null : null;
    if (old && old !== u) {
      delete map[old];
      notify("leadUsers", old, null);
    }
    if (u && map[u] !== name) {
      map[u] = name;
      notify("leadUsers", u, name);
    }
    writeLeadUsers(map);
    return previousLead;
  }

  function replaceAll(data) {
    localStorage.setItem(LEADS_KEY, JSON.stringify(data.leads));
    writeLeadUsers(data.leadUsers ?? {});
    bulkItems.replace(data.bulkItems);
    fgItems.replace(data.fgItems);
    lineRates.replace(data.lineRates);
  }

  function exportJson() {
    return JSON.stringify({ leads: leads(), leadUsers: leadUsers(), items: bulkItems.all(), fgItems: fgItems.all(),
      lineRates: lineRates.all() }, null, 2);
  }

  // Merges a file made by exportJson (files from before FG items or line rates
  // existed have no fgItems or lineRates); returns how many of each it took in. Leads and their
  // usernames are only taken in with `withLeads` (admins), else left out
  // (leads: null). With `addOnly` (Leads), items already stored keep their
  // value and are counted as `kept`.
  function importJson(text, { withLeads = true, addOnly = false } = {}) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!data || !Array.isArray(data.leads) || !Array.isArray(data.items)) {
      throw new Error("not a Stored Data export file");
    }
    if (withLeads) data.leads.forEach(n => typeof n === "string" && addLead(n));
    if (withLeads && data.leadUsers && typeof data.leadUsers === "object") {
      Object.entries(data.leadUsers).forEach(([u, name]) => {
        if (validUsername(normUser(u)) && leads().includes(name) && !leadForUser(u)) setLeadUsername(name, u);
      });
    }
    const isNew = store => i => !addOnly || !store.find(i.item);
    const bulkAll = data.items.filter(bulkItems.valid);
    const bulk = bulkAll.filter(isNew(bulkItems));
    bulk.forEach(i => bulkItems.save(i.item, i.pieceWt));
    const fgAll = (Array.isArray(data.fgItems) ? data.fgItems : []).filter(fgItems.valid);
    const fg = fgAll.filter(isNew(fgItems));
    fg.forEach(i => fgItems.save(i.item, i.count));
    const ratesAll = (Array.isArray(data.lineRates) ? data.lineRates : []).filter(lineRates.valid);
    const rates = ratesAll.filter(r => !addOnly || !lineRates.find(r.line, r.fgItem));
    rates.forEach(r => lineRates.save(r));
    return { leads: withLeads ? data.leads.length : null, items: bulk.length, fgItems: fg.length, lineRates: rates.length,
      kept: bulkAll.length - bulk.length + fgAll.length - fg.length + ratesAll.length - rates.length };
  }

  const api = { leads, addLead, removeLead, leadUsers, usernameForLead, leadForUser, setLeadUsername, validUsername, normUser, bulkItems, fgItems, lineRates, replaceAll, exportJson, importJson, onChange: null };
  return api;
})();
