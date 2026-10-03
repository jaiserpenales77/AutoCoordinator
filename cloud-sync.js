// Signs users in and syncs saved yield sheets and Stored Data through the
// Firestore database the JDE Sched app uses (project jde-schedule-database):
// each sheet is a document in `pk030-yield-sheets`, and leads, their linked
// usernames, bulk items and FG items are maps in the `pk030/storedData` document. The Firestore rules only
// let signed-in users reach these, and only admins (the usernames listed in
// the `pk030/admins` document, which is edited in the Firebase console) can
// change leads and their usernames. localStorage stays the app's working copy;
// Firestore's own offline cache (IndexedDB) holds writes made offline and
// sends them later. Signing out clears both copies from this computer.
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
  // Accounts are "username@pk030.local"; the address never receives mail.
  const USERNAME_DOMAIN = "pk030.local";
  const SHEETS = "pk030-yield-sheets";
  // Set once this browser's pre-sync data has been uploaded; until then a
  // snapshot must not replace the local copy, or that data would be lost.
  const MIGRATED = { sheets: "pk030_cloud_migrated_sheets", stored: "pk030_cloud_migrated_stored" };

  let fs = null;
  let db = null;
  let authMod = null;
  let auth = null;
  let failed = null;
  let meta = { sheets: null, stored: null };
  let unsubscribers = [];
  let handlers = null;

  const clean = obj => JSON.parse(JSON.stringify(obj));
  const sheetRef = id => fs.doc(db, SHEETS, id);
  const storedRef = () => fs.doc(db, "pk030", "storedData");
  const adminsRef = () => fs.doc(db, "pk030", "admins");

  function status() {
    if (failed) return { state: "error", text: failed };
    if (!meta.sheets || !meta.stored) return { state: "connecting", text: "Connecting to database…" };
    if (meta.sheets.fromCache || meta.stored.fromCache) return { state: "offline", text: "Offline — changes will sync when back online" };
    if (meta.sheets.hasPendingWrites || meta.stored.hasPendingWrites) return { state: "saving", text: "Saving…" };
    return { state: "synced", text: "Synced" };
  }

  const report = () => handlers?.onStatus(status());

  function fail(message, err) {
    console.error(message, err);
    failed = err?.code === "permission-denied"
      ? "Database access denied — saving on this computer only"
      : "Database unavailable — saving on this computer only";
    report();
  }

  // The UI only allows edits once signed in (or in local-only mode, where
  // there is no database to write to).
  function write(fn) {
    if (!db || !auth?.currentUser) return;
    fn().catch(err => fail("Failed to save to the database.", err));
    report();
  }

  async function loadSdk() {
    const base = new URL("assets/vendor/firebase/", document.baseURI).href;
    const [appMod, fsMod, aMod] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-firestore.js"),
      import(base + "firebase-auth.js")
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
    authMod = aMod;
    auth = aMod.getAuth(app);
  }

  function storedFromRemote(data = {}) {
    return {
      leads: Object.keys(data.leads || {}),
      leadUsers: { ...(data.leadUsers || {}) },
      bulkItems: Object.entries(data.bulkItems || {}).map(([item, pieceWt]) => ({ item, pieceWt })),
      fgItems: Object.entries(data.fgItems || {}).map(([item, count]) => ({ item, count }))
    };
  }

  function migrateSheets(snap, localRecords) {
    const remoteIds = new Set(snap.docs.map(d => d.id));
    const localOnly = localRecords.filter(r => r.id && !remoteIds.has(r.id));
    localOnly.forEach(r => write(() => fs.setDoc(sheetRef(r.id), clean(r))));
    localStorage.setItem(MIGRATED.sheets, "1");
    return localOnly;
  }

  function migrateStored(remote, local) {
    const merge = {};
    const add = (field, key, value) => { (merge[field] ??= {})[key] = value; };
    local.leads.filter(n => !remote.leads.includes(n)).forEach(n => add("leads", n, true));
    Object.entries(local.leadUsers || {}).filter(([u]) => !(u in remote.leadUsers))
      .forEach(([u, name]) => add("leadUsers", u, name));
    const missing = (list, remoteList) => list.filter(i => !remoteList.some(r => r.item === i.item));
    missing(local.bulkItems, remote.bulkItems).forEach(i => add("bulkItems", i.item, i.pieceWt));
    missing(local.fgItems, remote.fgItems).forEach(i => add("fgItems", i.item, i.count));
    // Leads go in their own write: only admins may change them, and a refused
    // write must not take the items with it.
    const { leads, leadUsers, ...items } = merge;
    const leadMerge = { ...(leads && { leads }), ...(leadUsers && { leadUsers }) };
    if (Object.keys(items).length) write(() => fs.setDoc(storedRef(), items, { merge: true }));
    if (Object.keys(leadMerge).length) write(() => fs.setDoc(storedRef(), leadMerge, { merge: true }));
    localStorage.setItem(MIGRATED.stored, "1");
    return {
      leads: [...remote.leads, ...Object.keys(merge.leads || {})],
      leadUsers: { ...remote.leadUsers, ...(merge.leadUsers || {}) },
      bulkItems: [...remote.bulkItems, ...missing(local.bulkItems, remote.bulkItems)],
      fgItems: [...remote.fgItems, ...missing(local.fgItems, remote.fgItems)]
    };
  }

  function listen() {
    unsubscribers.push(fs.onSnapshot(fs.collection(db, SHEETS), { includeMetadataChanges: true }, snap => {
      meta.sheets = snap.metadata;
      if (!localStorage.getItem(MIGRATED.sheets)) {
        if (snap.metadata.fromCache) return report();
        const localOnly = migrateSheets(snap, handlers.localSheets());
        handlers.onSheets([...snap.docs.map(d => d.data()), ...localOnly]);
      } else {
        handlers.onSheets(snap.docs.map(d => d.data()));
      }
      report();
    }, err => fail("Yield sheet sync unavailable.", err)));

    unsubscribers.push(fs.onSnapshot(storedRef(), { includeMetadataChanges: true }, snap => {
      meta.stored = snap.metadata;
      const remote = storedFromRemote(snap.data());
      if (!localStorage.getItem(MIGRATED.stored)) {
        if (snap.metadata.fromCache) return report();
        handlers.onStoredData(migrateStored(remote, handlers.localStored()));
      } else {
        handlers.onStoredData(remote);
      }
      report();
    }, err => fail("Stored Data sync unavailable.", err)));

    // Whether this user is an admin. No list (or no access to it) means not.
    // Usernames must match exactly, as the rules compare them.
    unsubscribers.push(fs.onSnapshot(adminsRef(), snap => {
      const list = snap.data()?.usernames;
      handlers.onAdmins(Array.isArray(list) ? list.filter(u => typeof u === "string") : []);
    }, err => {
      console.warn("Couldn't read the admins list.", err);
      handlers.onAdmins([]);
    }));
  }

  function stopListening() {
    unsubscribers.splice(0).forEach(unsub => unsub());
    meta = { sheets: null, stored: null };
    failed = null;
  }

  // h: onSignedIn(username), onSignedOut(), onLocalOnly(message), onStatus,
  // onSheets(records), onStoredData(data), onAdmins(usernames), localSheets(),
  // localStored().
  async function start(h) {
    handlers = h;
    try {
      await loadSdk();
    } catch (err) {
      console.error("Couldn't load the database library; working from this computer only.", err);
      handlers.onLocalOnly("Database unavailable — saving on this computer only");
      return;
    }
    authMod.onAuthStateChanged(auth, user => {
      stopListening();
      if (user) {
        handlers.onSignedIn(usernameOf(user));
        report();
        listen();
      } else {
        handlers.onSignedOut();
      }
    });
  }

  const usernameOf = user => (user.email || "").replace(`@${USERNAME_DOMAIN}`, "");

  function toEmail(username) {
    const u = username.trim().toLowerCase();
    return u.includes("@") ? u : `${u}@${USERNAME_DOMAIN}`;
  }

  async function signIn(username, password) {
    try {
      await authMod.signInWithEmailAndPassword(auth, toEmail(username), password);
    } catch (err) {
      const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
      if (wrong.includes(err.code)) throw new Error("Wrong username or password.");
      if (err.code === "auth/too-many-requests") throw new Error("Too many attempts. Wait a few minutes and try again.");
      if (err.code === "auth/network-request-failed") throw new Error("Can't reach the sign-in service. Check the connection.");
      if (err.code === "auth/user-disabled") throw new Error("This account has been disabled.");
      throw new Error(`Sign-in failed (${err.code || err.message}).`);
    }
  }

  const hasUnsyncedChanges = () => !!(meta.sheets?.hasPendingWrites || meta.stored?.hasPendingWrites);

  // Signs out and removes this computer's copies of the shared data (the
  // Firestore cache and the app's localStorage copy via onCleared).
  async function signOut(onCleared) {
    stopListening();
    await authMod.signOut(auth);
    await fs.terminate(db);
    await fs.clearIndexedDbPersistence(db).catch(err => console.warn("Couldn't clear the offline cache.", err));
    onCleared();
  }

  return {
    start,
    signIn,
    signOut,
    hasUnsyncedChanges,
    saveSheet: record => write(() => fs.setDoc(sheetRef(record.id), clean(record))),
    deleteSheet: id => write(() => fs.deleteDoc(sheetRef(id))),
    saveStored: (field, key, value) => write(() => fs.setDoc(storedRef(),
      { [field]: { [key]: value === null ? fs.deleteField() : value } }, { merge: true }))
  };
})();
