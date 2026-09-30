# PK030 Packaging Yield Coordinator

A small web app that replaces the manual **PK030M [ALL] Final Packaging Yield
Sheet** (QS017B) Excel workbook with a live calculator and a saved-record
list for tracking multiple work orders.

## What it replicates from the original spreadsheet

- **Work order header**: FG Item, WO #, Bulk Item.
- **Bulk reconciliation**: Total Packaged (Bottles), Count (Fill Rate),
  Bulk Rejected/Returned (TH), Issued Bulk (TH). Bulk Rejected and Bulk
  Returned are entered separately; their sum is the workbook's single
  Bulk Rejected/Returned value, in the yield math and on the printout.
- **Scrap calculations**: each of the three Packaging Scrap weighings and the
  Manufacturing Scrap weighing are entered as gross scale readings (Kg),
  netted against the container tare weight (fixed at 6 Kg, as in the
  spreadsheet), then converted to
  piece-equivalent thousands (TH) using the Bulk Piece Weight (mg).
- **Final Yield %** and the same pass/fail thresholds as the source sheet:
  values below 94.5% or above 102.4999% trigger a **VideoJet Count** flag and
  the matching **Low Yield NCCAPA** / **High Yield NCCAPA** label.
- **Incomplete sheets** (no Issued Bulk yet, or scrap entered without a Bulk
  Piece Wt) show a prompt instead of a yield status, where the workbook would
  show `#DIV/0!`. The printout still shows `#DIV/0!` in those cells, like the
  workbook.
- **VideoJet Count** entry (cell B21 in the workbook), printed on the
  VideoJet line when the yield is out of range.
- **Print report** that reproduces the workbook's print area
  (`PK030!E21:L71`) cell for cell. It uses the same column widths, row
  heights, Arial font sizes, borders, merged cells, logo placement, number
  formats and conditional formatting. It prints on Letter landscape at 88%
  with the workbook's margins and a page break after row 52, so page 1 is
  the yield sheet and page 2 is the List #/Lot #/CC # label. Sign-off lines
  stay blank for handwritten signatures, as on the paper form. One deliberate
  difference: the Partial Pallet Configuration line prints black text on
  yellow instead of the workbook's hard-to-read white. On that line and the
  VideoJet Count line, By: shows the Created By lead's initials and Date: the
  print date. When both **Layers** and **Boxes** are entered, the
  configuration blank reads e.g. "5 Layers + 2 Boxes".

## Card Preview

The Live Results panel shows the pink paper card's table, filled in as you
type, ready to copy onto the card:

| Card row | From the form |
|---|---|
| Total Packed | Quantity Completed |
| Packaging Scrap | Packaging Scrap #1 + #2 + #3, as entered (gross) |
| Manufacturing Scrap | Manufacturing Scrap, as entered (gross) |
| Bulk Piece Weight | Bulk Piece Wt |
| Bulk Issued | Issued Bulk |
| Bulk Rejected / Bulk Returned | Bulk Rejected / Bulk Returned |
| Total Bottles Yielded | Total Bottles Produced |

## Stored Data tab

- **Leads** — the names in the **Yield Sheet Created By** dropdown. **Other…**
  lets someone type a name that isn't listed yet. The chosen name prints on the
  "Yield Sheet Created By:" line; with none chosen, the line prints blank as on
  the paper form.
- **Bulk Items & Piece Weights** — when a stored Bulk Item is typed or
  imported on the yield sheet, Bulk Piece Wt fills in.
- **FG Items & Counts** — when a stored FG Item is typed or imported, Count
  (Fill Rate) fills in.

A value typed by hand is never overwritten, and a loaded saved sheet keeps its
own values.

Stored Data is shared through the database (see below). **Export Stored Data**
saves a JSON backup; **Import Stored Data** adds a backup's entries back.

## Importing the JDE report PDFs

Drop the work order's report PDFs on **Import from JDE Reports** (or use
**Choose PDFs**). The app reads them in the browser, so nothing is uploaded.

| Yield sheet field | Taken from |
|---|---|
| FG Item, WO # | Either report |
| Quantity Completed (Bottles) | WO Close-out (R5504801) — Quantity Completed |
| Bulk Item | WO Close-out (R5504801) — the bulk row in Issues (see below) |
| Issued Bulk (TH) | WO Close-out — that row's Issued Quantity |
| Bulk Returned (TH) | WO Close-out — that row's Return Quantity (blank = 0) |

The bulk row is the Issues item saved on the Stored Data tab, else a `BU…`
item, else the one item that isn't packaging (plain-number shippers/pallets,
`CP…` bottles, `PK…` caps/labels, or a packaging description) — e.g. `A845`.

**Total Bottles Produced** (the workbook's Total Packaged) is calculated as
Quantity Completed + Retains + Donations + Stability; the last three are
entered by hand. If no Close-out is imported, Quantity Completed falls back to the
Packaging Pallet Transfers (R593111FG) `Total Qty.`, and the app flags any
difference between the two.

**Charge Reports** (R593111CV) can be imported too; PH0001 (every item) and
PH0002 (bulk only) overlap, so each bulk container is counted once. The bulk
charged total is checked against the Close-out's Issued Quantity. Without a
Close-out, Bulk Item and Issued Bulk come from the Charge Report instead.

After an import, a small **preview** lists each report with its WO #, FG Item
and key values, and says whether all reports are for the same work order.
Reports for different work orders are refused: nothing is filled in and the
odd work order is shown in red.

**Printing the reports:** Print Yield Sheet (or Ctrl+P) prints the imported
reports after the yield sheet's two pages: Close-out, then Pallet Transfers,
then Charge Reports, one page each at actual size (the report pages print
without the yield sheet's margins, so they keep the PDFs' own margins).
Reports dropped in separate imports for the same work order are all kept;
importing another work order or **New / Clear** drops them. They only print
while the sheet's WO # matches their work order, and the checkbox under the
buttons turns them off. The PDFs stay in the browser tab, not in the saved
sheet, so a sheet loaded later prints without them unless they're imported
again.

Fields the original "PDF Import Setup" sheet notes as **not automatable**
(Count/Fill Rate, Bulk Piece Wt, and the four scrap weights) aren't in any
source PDF. Bulk Piece Wt and Count fill from the Stored Data tab when the
item is stored there; the rest are entered by hand.

## Running it

No build step or server-side code is required — it's a static HTML/CSS/JS app.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening `index.html` directly from disk works too, except for PDF import and
database sync, which browsers only allow over `http(s)://`.

## Data storage

Saved yield sheets and Stored Data sync live between computers through the
same Firebase Firestore database as the JDE Sched app (project
`jde-schedule-database`):

- each yield sheet is a document in the `pk030-yield-sheets` collection;
- leads, bulk piece weights and FG counts are maps in `pk030/storedData`.

The status under the title shows **Synced**, **Saving…**, **Offline** (changes
are kept and sent when the connection returns, even across reloads) or a
"saving on this computer only" message when the database can't be used. The
browser's `localStorage` stays the working copy, so the app keeps working
either way. The first time a browser connects, sheets and Stored Data it had
saved before the database existed are uploaded.

**Export CSV** on the records panel still exports the saved sheets.

## Sign-in

People sign in with a **username and password** before the app shows or syncs
anything. Accounts are Firebase Authentication email/password accounts named
`username@pk030.local`; the address is never emailed, and the sign-in screen
only asks for the username. The app remembers the sign-in on that computer.
**Sign out** clears this computer's copies of the shared data (saved sheets,
Stored Data and the offline cache); signing in again downloads them. If the
database library can't load at all (e.g. `index.html` opened from disk), the
app runs without sign-in on that computer's own copy.

### One-time setup (Firebase console, project `jde-schedule-database`)

1. **Authentication → Sign-in method → Email/Password → Enable** (leave
   "Email link" off).
2. **Authentication → Settings → User actions → uncheck "Enable create
   (sign-up)"**. Without this, anyone could create their own account with the
   site's public key and get past the rules.
3. **Authentication → Users → Add user** for each person: email
   `theirname@pk030.local`, and a password (6+ characters).
4. **Firestore Database → Rules** → replace them with the rules below →
   **Publish**. JDE Sched only uses the `jde-sched` collection, which stays
   open exactly as before; this app's data then needs a signed-in user.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // JDE Sched: unchanged, no sign-in
    match /jde-sched/{document=**} {
      allow read, write: if true;
    }
    // PK030 Yield Coordinator: signed-in users only
    match /pk030-yield-sheets/{id} {
      allow read, write: if request.auth != null;
    }
    match /pk030/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Forgotten password / removing someone

The console's "Reset password" sends an email, which can't reach a
`@pk030.local` address. Instead, **delete the user and add them again** with a
new password. To remove someone's access, delete (or disable) their user.

## Files

- `index.html` — page structure and form fields.
- `style.css` — screen layout plus the print stylesheet (page setup and
  cell styles).
- `app.js` — calculations, saved-record persistence (localStorage), CSV
  export, and print-report generation.
- `pdf-import.js` — reads the JDE report PDFs and extracts the values above.
- `stored-data.js` — the Stored Data tab's leads, bulk piece weights and FG counts.
- `cloud-sync.js` — sign-in, and syncing sheets and Stored Data with Firestore.
- `assets/pharmavite-logo.png` — logo taken from the workbook.
- `assets/vendor/firebase/` — Firebase JS SDK 12.19.0 app, Firestore and Auth
  (Apache-2.0); the Firestore and Auth files import the local app file instead
  of Google's CDN.
- `assets/vendor/pdfjs/` — Mozilla pdf.js 4.10.38 (Apache-2.0), used to read
  the PDFs.
