# PK030 Packaging Yield Coordinator

A small web app that replaces the manual **PK030M [ALL] Final Packaging Yield
Sheet** (QS017B) Excel workbook with a live calculator and a saved-record
list for tracking multiple work orders.

## What it replicates from the original spreadsheet

- **Work order header**: FG Item, WO #, Bulk Item.
- **Bulk reconciliation**: Total Packaged (Bottles), Count (Fill Rate),
  Bulk Rejected/Returned (TH), Issued Bulk (TH).
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
| Bulk Rejected/Returned (TH) | WO Close-out — that row's Return Quantity (blank = 0) |

The bulk row is the Issues item saved on the Stored Data tab, else a `BU…`
item, else the one item that isn't packaging (plain-number shippers/pallets,
`CP…` bottles, `PK…` caps/labels, or a packaging description) — e.g. `A845`.

**Total Bottles Produced** (the workbook's Total Packaged) is calculated as
Quantity Completed + Retains + Donations + Stability; the last three are
entered by hand. If no Close-out is imported, Quantity Completed falls back to the
Packaging Pallet Transfers (R593111FG) `Total Qty.`, and the app flags any
difference between the two. Reports for different work orders are refused.
The Charge Report (R593111CV) isn't needed.

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

There is no login: access is controlled only by the Firestore security rules,
and anyone who can open the site can read and change this data. The rules must
allow reads and writes on `pk030-yield-sheets/{id}` and `pk030/storedData`,
for example:

```
match /pk030-yield-sheets/{id} { allow read, write: if true; }
match /pk030/{id} { allow read, write: if true; }
```

**Export CSV** on the records panel still exports the saved sheets.

## Files

- `index.html` — page structure and form fields.
- `style.css` — screen layout plus the print stylesheet (page setup and
  cell styles).
- `app.js` — calculations, saved-record persistence (localStorage), CSV
  export, and print-report generation.
- `pdf-import.js` — reads the JDE report PDFs and extracts the values above.
- `stored-data.js` — the Stored Data tab's leads, bulk piece weights and FG counts.
- `cloud-sync.js` — syncs sheets and Stored Data with Firestore.
- `assets/pharmavite-logo.png` — logo taken from the workbook.
- `assets/vendor/firebase/` — Firebase JS SDK 12.19.0 app + Firestore
  (Apache-2.0); the Firestore file imports the local app file instead of
  Google's CDN.
- `assets/vendor/pdfjs/` — Mozilla pdf.js 4.10.38 (Apache-2.0), used to read
  the PDFs.
