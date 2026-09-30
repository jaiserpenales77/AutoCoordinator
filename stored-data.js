// Leads and item piece weights entered on the Stored Data tab, kept in this
// browser's localStorage.
const StoredData = (() => {
  const LEADS_KEY = "pk030_leads";
  const ITEMS_KEY = "pk030_items";

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

  function leads() {
    return read(LEADS_KEY).filter(n => typeof n === "string" && n.trim()).sort(byName);
  }

  function items() {
    return read(ITEMS_KEY)
      .filter(i => i && normItem(i.item) && Number.isFinite(Number(i.pieceWt)))
      .sort((a, b) => byName(a.item, b.item));
  }

  function addLead(name) {
    const clean = String(name).trim().replace(/\s+/g, " ");
    const list = leads();
    if (!clean || list.some(n => n.toLowerCase() === clean.toLowerCase())) return false;
    localStorage.setItem(LEADS_KEY, JSON.stringify([...list, clean]));
    return true;
  }

  function removeLead(name) {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads().filter(n => n !== name)));
  }

  function saveItem(item, pieceWt) {
    const key = normItem(item);
    const list = items().filter(i => normItem(i.item) !== key);
    localStorage.setItem(ITEMS_KEY, JSON.stringify([...list, { item: key, pieceWt: Number(pieceWt) }]));
  }

  function removeItem(item) {
    const key = normItem(item);
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items().filter(i => normItem(i.item) !== key)));
  }

  function findItem(item) {
    const key = normItem(item);
    return key ? items().find(i => normItem(i.item) === key) ?? null : null;
  }

  function exportJson() {
    return JSON.stringify({ leads: leads(), items: items() }, null, 2);
  }

  // Merges a file made by exportJson; returns how many leads/items it held.
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
    const validItems = data.items.filter(i => i && normItem(i.item) && Number.isFinite(Number(i.pieceWt)));
    validItems.forEach(i => saveItem(i.item, i.pieceWt));
    return { leads: data.leads.length, items: validItems.length };
  }

  return { leads, items, addLead, removeLead, saveItem, removeItem, findItem, exportJson, importJson };
})();
