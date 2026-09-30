// Leads, bulk item piece weights and FG item counts entered on the Stored Data
// tab. localStorage is the working copy; each local change is reported to
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

  const LEADS_KEY = "pk030_leads";
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
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads().filter(n => n !== name)));
    notify("leads", name, null);
  }

  function replaceAll(data) {
    localStorage.setItem(LEADS_KEY, JSON.stringify(data.leads));
    bulkItems.replace(data.bulkItems);
    fgItems.replace(data.fgItems);
  }

  function exportJson() {
    return JSON.stringify({ leads: leads(), items: bulkItems.all(), fgItems: fgItems.all() }, null, 2);
  }

  // Merges a file made by exportJson (files from before FG items existed have
  // no fgItems); returns how many of each it held.
  function importJson(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!data || !Array.isArray(data.leads) || !Array.isArray(data.items)) {
      throw new Error("not a Stored Data export file");
    }
    data.leads.forEach(n => typeof n === "string" && addLead(n));
    const bulk = data.items.filter(bulkItems.valid);
    bulk.forEach(i => bulkItems.save(i.item, i.pieceWt));
    const fg = (Array.isArray(data.fgItems) ? data.fgItems : []).filter(fgItems.valid);
    fg.forEach(i => fgItems.save(i.item, i.count));
    return { leads: data.leads.length, items: bulk.length, fgItems: fg.length };
  }

  const api = { leads, addLead, removeLead, bulkItems, fgItems, replaceAll, exportJson, importJson, onChange: null };
  return api;
})();
