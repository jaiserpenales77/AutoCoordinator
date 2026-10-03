// Signs users in and syncs saved yield sheets and Stored Data through the
// Firestore database the JDE Sched app uses (project jde-schedule-database):
// each sheet is a document in `pk030-yield-sheets`, and leads, their linked
// usernames, bulk items and FG items are maps in the `pk030/storedData` document.
// Each account has a `pk030-users/{uid}` record with its account type (role):
// PLT (what everyone who signs up starts as) and MLT only use the forms and
// never reach the database; Lead and up sync sheets and Stored Data; Admin and
// Owner also manage accounts and leads. Owners are the usernames in the
// `pk030/admins` document's `owners` list, which only the Firebase console can
// change. The Firestore rules enforce all of this. localStorage stays the app's working copy;
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
  const USERS = "pk030-users";
  const ACTIVITY = "pk030-activity";
  // The Activity Log shows this many of the newest entries.
  const ACTIVITY_LIMIT = 1000;
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
  let dataUnsubscribers = [];
  let accountsUnsubscribers = [];
  let activityUnsubscribe = null;
  let activityHandler = null;
  let handlers = null;
  // The signed-in account: its record (undefined until loaded), the owners
  // list (likewise), and the account type worked out from them.
  let account = null;
  // The name typed on the sign-up form, for the new account's record.
  let pendingName = null;

  const clean = obj => JSON.parse(JSON.stringify(obj));
  const sheetRef = id => fs.doc(db, SHEETS, id);
  const storedRef = () => fs.doc(db, "pk030", "storedData");
  const adminsRef = () => fs.doc(db, "pk030", "admins");
  const userRef = uid => fs.doc(db, USERS, uid);

  // Account types, lowest first; the index is the access level.
  const ROLES = ["plt", "mlt", "lead", "admin", "owner"];
  const atLeast = (role, min) => ROLES.indexOf(role) >= ROLES.indexOf(min);

  function status() {
    if (failed) return { state: "error", text: failed };
    if (!account?.role) return { state: "connecting", text: "Connecting to database…" };
    if (!atLeast(account.role, "lead")) return { state: "synced", text: "Signed in" };
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

  // Saved sheets and Stored Data, for Lead and up.
  function listenData() {
    dataUnsubscribers.push(fs.onSnapshot(fs.collection(db, SHEETS), { includeMetadataChanges: true }, snap => {
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

    dataUnsubscribers.push(fs.onSnapshot(storedRef(), { includeMetadataChanges: true }, snap => {
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
  }

  function stopData() {
    dataUnsubscribers.splice(0).forEach(unsub => unsub());
    meta = { sheets: null, stored: null };
  }

  // Every account's record, for the Admin tab (Admin and Owner).
  function listenAccounts() {
    accountsUnsubscribers.push(fs.onSnapshot(fs.collection(db, USERS), snap => {
      handlers.onAccounts(snap.docs.map(d => {
        const data = d.data();
        const created = data.createdAt?.toDate?.() ?? null;
        const username = String(data.username ?? "");
        const role = account?.owners?.includes(username) ? "owner"
          : ROLES.includes(data.role) && data.role !== "owner" ? data.role : "plt";
        return { uid: d.id, username, name: String(data.name ?? ""), role, created };
      }));
    }, err => console.warn("Couldn't load the accounts.", err)));
  }

  function stopAccounts() {
    accountsUnsubscribers.splice(0).forEach(unsub => unsub());
    activityUnsubscribe?.();
    activityUnsubscribe = null;
  }

  // The newest activity entries, live, for the Activity Log (Admin and
  // Owner). Starts when the log is first opened.
  function watchActivity(onEntries) {
    activityHandler = onEntries;
    if (activityUnsubscribe || !account || !atLeast(account.role ?? "plt", "admin")) return;
    const q = fs.query(fs.collection(db, ACTIVITY), fs.orderBy("at", "desc"), fs.limit(ACTIVITY_LIMIT));
    activityUnsubscribe = fs.onSnapshot(q, snap => {
      activityHandler(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, uid: String(data.uid ?? ""), username: String(data.username ?? ""),
          action: String(data.action ?? ""), detail: String(data.detail ?? ""),
          at: data.at?.toDate?.() ?? new Date() };
      }), snap.size >= ACTIVITY_LIMIT);
    }, err => {
      console.warn("Couldn't load the activity log.", err);
      activityUnsubscribe = null;
    });
  }

  // Adds an entry to the activity log as the signed-in user. Never blocks or
  // fails the action itself; resolves once saved (or after `waitMs`).
  function log(action, detail = "", waitMs = 0) {
    if (!db || !auth?.currentUser) return Promise.resolve();
    let saved;
    try {
      const entry = { uid: auth.currentUser.uid, username: usernameOf(auth.currentUser),
        action: String(action).slice(0, 60), detail: String(detail ?? "").slice(0, 300), at: fs.serverTimestamp() };
      saved = Promise.resolve(fs.addDoc(fs.collection(db, ACTIVITY), entry));
    } catch (err) {
      saved = Promise.reject(err);
    }
    saved = saved.catch(err => console.warn("Couldn't add to the activity log.", err));
    return waitMs ? Promise.race([saved, new Promise(r => setTimeout(r, waitMs))]) : saved;
  }

  // A first sign-in has no account record yet, so it makes one: as a Lead if
  // an admin already linked this username to a lead (the rules check that),
  // otherwise as a PLT.
  async function createAccountRecord(user) {
    if (account.creating) return;
    account.creating = true;
    const base = { username: account.username, name: (pendingName ?? "").slice(0, 60), createdAt: fs.serverTimestamp() };
    try {
      await fs.setDoc(userRef(user.uid), { ...base, role: "lead" });
    } catch {
      try {
        await fs.setDoc(userRef(user.uid), { ...base, role: "plt" });
      } catch (err) {
        fail("Couldn't create the account record.", err);
      }
    }
    pendingName = null;
    if (account) account.creating = false;
  }

  // Works out the account type once the record and the owners list are in,
  // and starts or stops the shared data to match.
  function updateRole() {
    if (!account || account.record === undefined || account.owners === undefined) return;
    const recorded = account.record?.role;
    const role = account.owners.includes(account.username) ? "owner"
      : ROLES.includes(recorded) && recorded !== "owner" ? recorded : "plt";
    if (role === account.role) return;
    account.role = role;
    const data = atLeast(role, "lead");
    if (data && !dataUnsubscribers.length) listenData();
    if (!data) stopData();
    const admin = atLeast(role, "admin");
    if (admin && !accountsUnsubscribers.length) listenAccounts();
    if (!admin) stopAccounts();
    handlers.onRole(role, { name: String(account.record?.name ?? "") });
    report();
  }

  function listenAccount(user) {
    const mine = { uid: user.uid, username: usernameOf(user), record: undefined, owners: undefined, role: null };
    account = mine;
    // Ignore anything arriving after this account signed out.
    const current = fn => (...args) => { if (account === mine) fn(...args); };
    unsubscribers.push(fs.onSnapshot(userRef(user.uid), { includeMetadataChanges: true }, current(snap => {
      // Wait for the server's answer, so a refused write never counts.
      if (snap.metadata.hasPendingWrites) return;
      const data = snap.data();
      if (!data) {
        if (!snap.metadata.fromCache) createAccountRecord(user);
        return;
      }
      account.record = data;
      updateRole();
    }), current(err => {
      // Rules from before account types refuse account records; until the
      // new rules are published, everyone signed in works as before (a Lead).
      // The rules, not this, decide what anyone can reach.
      console.warn("Account record unavailable; using the pre-account-types access.", err);
      account.record = { role: "lead" };
      updateRole();
    })));
    // Owners. No list (or no access to it) means no owners.
    unsubscribers.push(fs.onSnapshot(adminsRef(), current(snap => {
      const list = snap.data()?.owners;
      account.owners = Array.isArray(list) ? list.filter(u => typeof u === "string") : [];
      updateRole();
    }), current(err => {
      console.warn("Couldn't read the owners list.", err);
      account.owners = [];
      updateRole();
    })));
  }

  function stopListening() {
    unsubscribers.splice(0).forEach(unsub => unsub());
    stopData();
    stopAccounts();
    account = null;
    failed = null;
  }

  // h: onSignedIn(username), onRole(role, { name }), onSignedOut(),
  // onLocalOnly(message), onStatus, onSheets(records), onStoredData(data),
  // onAccounts(accounts), localSheets(), localStored().
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
        listenAccount(user);
        report();
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
      log("Signed in");
    } catch (err) {
      const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
      if (wrong.includes(err.code)) throw new Error("Wrong username or password.");
      if (err.code === "auth/too-many-requests") throw new Error("Too many attempts. Wait a few minutes and try again.");
      if (err.code === "auth/network-request-failed") throw new Error("Can't reach the sign-in service. Check the connection.");
      if (err.code === "auth/user-disabled") throw new Error("This account has been disabled.");
      throw new Error(`Sign-in failed (${err.code || err.message}).`);
    }
  }

  const signUpErrors = {
    "auth/email-already-in-use": "That username is taken. Pick another, or sign in.",
    "auth/weak-password": "The password needs at least 6 characters.",
    "auth/invalid-email": "That isn't a valid username.",
    "auth/operation-not-allowed": "Sign-up is turned off. Ask the app admin for an account.",
    "auth/admin-restricted-operation": "Sign-up is turned off. Ask the app admin for an account.",
    "auth/network-request-failed": "Can't reach the sign-in service. Check the connection.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again."
  };

  // Creates the account and signs it in; its record (a PLT) follows.
  async function signUp(name, username, password) {
    pendingName = name;
    try {
      await authMod.createUserWithEmailAndPassword(auth, toEmail(username), password);
      log("Created an account", name);
    } catch (err) {
      pendingName = null;
      throw new Error(signUpErrors[err.code] ?? `Sign-up failed (${err.code || err.message}).`);
    }
  }

  const hasUnsyncedChanges = () => !!(meta.sheets?.hasPendingWrites || meta.stored?.hasPendingWrites);

  // Signs out and removes this computer's copies of the shared data (the
  // Firestore cache and the app's localStorage copy via onCleared).
  async function signOut(onCleared) {
    // Saved before the offline copy is cleared; a few seconds at most.
    await log("Signed out", "", 3000);
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
      { [field]: { [key]: value === null ? fs.deleteField() : value } }, { merge: true })),
    signUp,
    log,
    watchActivity,
    // An admin changing someone's account type.
    setRole: (uid, role) => write(() => fs.setDoc(userRef(uid), { role }, { merge: true })),
    ROLES
  };
})();
