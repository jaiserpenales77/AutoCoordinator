// Syncs saved yield sheets and Stored Data through the Firestore database the
// JDE Sched app uses (project jde-schedule-database): each sheet is a document
// in `pk030-yield-sheets`, and leads/bulk items/FG items are maps in the
// `pk030/storedData` document. localStorage stays the app's working copy, so
// the app keeps working when the database can't be reached; Firestore's own
// offline cache (IndexedDB) holds writes made offline and sends them later.
const CloudSync = (() => {
  // Public by design: access is governed by the Firestore security rules.
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyANgwpQIp6SybjkZgpVtvusTc9SEdkTFeg",
    authDomain: "jde-schedule-database.firebaseapp.com",
    projectId: "jde-schedule-database",
    storageBucket: "jde-schedule-database.firebasestorage.app",
    messagingSenderId: "200523177124",
    appId: "1:200523177124:web:9459478521f146e28d9a31"
  };
  const SHEETS = "pk030-yield-sheets";
  // Set once this browser's pre-sync data has been uploaded; until then a
  // snapshot must not replace the local copy, or that data would be lost.
  const MIGRATED = { sheets: "pk030_cloud_migrated_sheets", stored: "pk030_cloud_migrated_stored" };

  let fs = null;
  let db = null;
  let failed = null;
  const meta = { sheets: null, stored: null };
  const queued = [];
  let reportStatus = () => {};

  const clean = obj => JSON.parse(JSON.stringify(obj));
  const sheetRef = id => fs.doc(db, SHEETS, id);
  const storedRef = () => fs.doc(db, "pk030", "storedData");

  function status() {
    if (failed) return { state: "error", text: failed };
    if (!db) return { state: "connecting", text: "Connecting to database…" };
    if (!meta.sheets || !meta.stored) return { state: "connecting", text: "Connecting to database…" };
    if (meta.sheets.fromCache || meta.stored.fromCache) return { state: "offline", text: "Offline — changes will sync when back online" };
    if (meta.sheets.hasPendingWrites || meta.stored.hasPendingWrites) return { state: "saving", text: "Saving…" };
    return { state: "synced", text: "Synced" };
  }

  const report = () => reportStatus(status());

  function fail(message, err) {
    console.error(message, err);
    failed = err?.code === "permission-denied"
      ? "Database access denied — saving on this computer only"
      : "Database unavailable — saving on this computer only";
    report();
  }

  // Writes wait here until the SDK has loaded; dropped if it never does.
  function write(fn) {
    if (db) run(fn);
    else if (!failed) queued.push(fn);
  }

  function run(fn) {
    fn().catch(err => fail("Failed to save to the database.", err));
    report();
  }

  async function loadSdk() {
    const base = new URL("assets/vendor/firebase/", document.baseURI).href;
    const [appMod, fsMod] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-firestore.js")
    ]);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    const settings = { experimentalAutoDetectLongPolling: true };
    try {
      db = fsMod.initializeFirestore(app, {
        ...settings,
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
      });
    } catch (err) {
      console.warn("Firestore offline cache unavailable; syncing without it.", err);
      db = fsMod.initializeFirestore(app, settings);
    }
    fs = fsMod;
  }

  function storedFromRemote(data = {}) {
    return {
      leads: Object.keys(data.leads || {}),
      bulkItems: Object.entries(data.bulkItems || {}).map(([item, pieceWt]) => ({ item, pieceWt })),
      fgItems: Object.entries(data.fgItems || {}).map(([item, count]) => ({ item, count }))
    };
  }

  function migrateSheets(snap, localRecords) {
    const remoteIds = new Set(snap.docs.map(d => d.id));
    const localOnly = localRecords.filter(r => r.id && !remoteIds.has(r.id));
    localOnly.forEach(r => run(() => fs.setDoc(sheetRef(r.id), clean(r))));
    localStorage.setItem(MIGRATED.sheets, "1");
    return localOnly;
  }

  function migrateStored(remote, local) {
    const merge = {};
    const add = (field, key, value) => { (merge[field] ??= {})[key] = value; };
    local.leads.filter(n => !remote.leads.includes(n)).forEach(n => add("leads", n, true));
    const missing = (list, remoteList) => list.filter(i => !remoteList.some(r => r.item === i.item));
    missing(local.bulkItems, remote.bulkItems).forEach(i => add("bulkItems", i.item, i.pieceWt));
    missing(local.fgItems, remote.fgItems).forEach(i => add("fgItems", i.item, i.count));
    if (Object.keys(merge).length) run(() => fs.setDoc(storedRef(), merge, { merge: true }));
    localStorage.setItem(MIGRATED.stored, "1");
    return {
      leads: [...remote.leads, ...Object.keys(merge.leads || {})],
      bulkItems: [...remote.bulkItems, ...missing(local.bulkItems, remote.bulkItems)],
      fgItems: [...remote.fgItems, ...missing(local.fgItems, remote.fgItems)]
    };
  }

  // handlers: onSheets(records), onStoredData({ leads, bulkItems, fgItems }),
  // onStatus({ state, text }), localSheets(), localStored().
  async function start(handlers) {
    reportStatus = handlers.onStatus;
    report();
    try {
      await loadSdk();
    } catch (err) {
      fail("Couldn't load the database library; working from this computer only.", err);
      queued.length = 0;
      return;
    }
    queued.splice(0).forEach(run);

    fs.onSnapshot(fs.collection(db, SHEETS), { includeMetadataChanges: true }, snap => {
      meta.sheets = snap.metadata;
      if (!localStorage.getItem(MIGRATED.sheets)) {
        if (snap.metadata.fromCache) return report();
        const localOnly = migrateSheets(snap, handlers.localSheets());
        handlers.onSheets([...snap.docs.map(d => d.data()), ...localOnly]);
      } else {
        handlers.onSheets(snap.docs.map(d => d.data()));
      }
      report();
    }, err => fail("Yield sheet sync unavailable.", err));

    fs.onSnapshot(storedRef(), { includeMetadataChanges: true }, snap => {
      meta.stored = snap.metadata;
      const remote = storedFromRemote(snap.data());
      if (!localStorage.getItem(MIGRATED.stored)) {
        if (snap.metadata.fromCache) return report();
        handlers.onStoredData(migrateStored(remote, handlers.localStored()));
      } else {
        handlers.onStoredData(remote);
      }
      report();
    }, err => fail("Stored Data sync unavailable.", err));
  }

  return {
    start,
    saveSheet: record => write(() => fs.setDoc(sheetRef(record.id), clean(record))),
    deleteSheet: id => write(() => fs.deleteDoc(sheetRef(id))),
    saveStored: (field, key, value) => write(() => fs.setDoc(storedRef(),
      { [field]: { [key]: value === null ? fs.deleteField() : value } }, { merge: true }))
  };
})();
