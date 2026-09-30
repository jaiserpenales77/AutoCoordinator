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
  netted against a container tare weight (defaults to 6 Kg, matching the
  spreadsheet's hardcoded value, but editable), then converted to
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
  stay blank for handwritten signatures, as on the paper form.

## Leads list

**Yield Sheet Created By** is a dropdown of the names in `leads.js`. Edit that
file (one quoted name per line, e.g. `"Jane Doe",`) to add or remove leads; the
site redeploys on push. **Other…** lets someone type a name that isn't listed
yet. The chosen name prints on the "Yield Sheet Created By:" line; with none
chosen, the line prints blank as on the paper form.

## Importing the JDE report PDFs

Drop the work order's report PDFs on **Import from JDE Reports** (or use
**Choose PDFs**). The app reads them in the browser, so nothing is uploaded.

| Yield sheet field | Taken from |
|---|---|
| FG Item, WO # | Either report |
| Quantity Completed (Bottles) | WO Close-out (R5504801) — Quantity Completed |
| Bulk Item | WO Close-out (R5504801) — the `BU…` row in Issues |
| Issued Bulk (TH) | WO Close-out — that row's Issued Quantity |
| Bulk Rejected/Returned (TH) | WO Close-out — that row's Return Quantity (blank = 0) |

**Total Bottles Produced** (the workbook's Total Packaged) is calculated as
Quantity Completed + Retains + Donations; Retains and Donations are entered by
hand. If no Close-out is imported, Quantity Completed falls back to the
Packaging Pallet Transfers (R593111FG) `Total Qty.`, and the app flags any
difference between the two. Reports for different work orders are refused.
The Charge Report (R593111CV) isn't needed.

Fields the original "PDF Import Setup" sheet notes as **not automatable**
(Count/Fill Rate, Bulk Piece Wt, and the four scrap weights) remain manual
entry, since they come from scale readings rather than any source PDF.

## Running it

No build step or server-side code is required — it's a static HTML/CSS/JS app.

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/
```

Opening `index.html` directly from disk works too, except for PDF import,
which browsers only allow over `http(s)://`.

## Data storage

Saved yield sheets are stored in the browser's `localStorage` (per browser,
per device) — there is no backend. Use **Export CSV** on the records panel to
back up or share the saved work orders.

## Files

- `index.html` — page structure and form fields.
- `style.css` — screen layout plus the print stylesheet (page setup and
  cell styles).
- `app.js` — calculations, saved-record persistence (localStorage), CSV
  export, and print-report generation.
- `pdf-import.js` — reads the JDE report PDFs and extracts the values above.
- `assets/pharmavite-logo.png` — logo taken from the workbook.
- `assets/vendor/pdfjs/` — Mozilla pdf.js 4.10.38 (Apache-2.0), used to read
  the PDFs.
