# Packaging Lead Hub

A static web app (no build step) for the PK030 packaging line: yield sheets,
paper forms, a Bulk Calculator and shared Stored Data, deployed to GitHub Pages
from branch `claude/modest-gauss-y18sdh` (the whole repository is published).
Data lives in Firebase Firestore (project `jde-schedule-database`), shared with
the JDE Sched app. See README.md for features, account types and the Firestore
rules.

## Adding data to Stored Data (FG items, bulk items, line rates)

Requests like "add the missing FG items from this schedule" go straight into
the live database with `tools/pk030_db.py`. It signs in as the account in
`PK030_USERNAME` / `PK030_PASSWORD` (a Lead: it can only add, never change or
remove), adds only entries that aren't stored yet, writes an Activity Log entry
for each, and reads the data back to confirm.

1. Read the source carefully (crop/zoom screenshots before reading numbers).
   On the production line schedule, **ITEM** is the FG item and **COUNT** is
   its count; items ending in `SUB` are separate items (4251SUB is not 4251).
   Each item once, even if it appears on several rows.
2. Write the entries in the app's Stored Data export format to a file in the
   scratchpad, never in the repository (it would be published):
   `{"fgItems": [{"item": "2676", "count": 180}],
     "items": [{"item": "BU001565", "pieceWt": 1781}],
     "lineRates": [{"line": "10", "fgItem": "2676", "fullHour": 3000, "lunch": 1500, "break": null}]}`
   (`lunch`/`break` may be null for lines that run through them.)
3. `python3 tools/pk030_db.py add FILE --dry-run`, then without `--dry-run`.
   `python3 tools/pk030_db.py show fgItems` (or `bulkItems`, `lineRates`)
   prints what's stored.
4. Report a table of what was added, what was already stored, and anything
   stored with a different value. The script never changes those; tell the
   person, since only an Admin or Owner can change them in the app.

If `PK030_USERNAME` / `PK030_PASSWORD` aren't set, or sign-in or the network
fails, say so and what to do (they're environment variables in the cloud
environment's settings; a new session picks them up), and offer the same JSON
as a file instead: the app's Stored Data tab → **Import Stored Data** takes
it. Never ask for or print the password, and never write to the database any
other way.

## Changing the app

- Files: `index.html`, `style.css`, `app.js` (yield sheet, tabs, access, Stored
  Data UI, Activity Log), `stored-data.js`, `cloud-sync.js` (sign-in, account
  types, sync), `pdf-import.js`, and one file per form (`bulk-return.js`,
  `unplanned-issue.js`, `hold-tag.js`, `standard-work.js`, `bulk-calc.js`).
- Keep README.md up to date with each change.
- The Firestore rules are kept in README.md and pasted into the Firebase console
  by the owner. They also hold the JDE Sched rules (`jde-sched`, locked to the
  1st/2nd/3rd@jde-sched.local accounts): keep that part whenever the rules
  change, and give the owner the full block to paste.
- Tests must never touch the production database: in Playwright, block
  `**/assets/vendor/firebase/*` (the app then runs on its own copy) or serve
  stand-in modules; test rules in the Firestore emulator. Chromium is at
  `/opt/pw-browsers/chromium`.
